import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, addDoc, limitToLast,
  arrayUnion, arrayRemove, getDocs, deleteField, writeBatch, runTransaction,
  type Transaction, type DocumentReference
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { deleteDmConversationBetween } from '../utils/dmDelete'
import type { Room, Message, Request, User, QueueItem, YtSearchResult } from '../types'
import { fetchVideoTitle } from '../utils/youtubeSearch'
import { fetchServerOffset, serverNow } from '../utils/serverClock'
import { translate } from '../locales/translate'
import { showToast } from '../utils/toast'

function randomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

const TX_MAX_ATTEMPTS = 6

/** Oda belgesi sık güncellenir (video senkronu) → transaction çakışmasında yeniden dene. */
async function runRoomTransaction(
  roomId: string,
  apply: (tx: Transaction, room: Room, ref: DocumentReference) => void
): Promise<boolean> {
  const ref = doc(db, 'rooms', roomId)
  for (let attempt = 0; attempt < TX_MAX_ATTEMPTS; attempt++) {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) return
        apply(tx, snap.data() as Room, ref)
      })
      return true
    } catch (e: unknown) {
      const code = (e as { code?: string }).code
      if (code === 'failed-precondition' && attempt < TX_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1) + Math.random() * 40))
        continue
      }
      console.warn('[useRoom] room transaction failed:', e)
      return false
    }
  }
  return false
}

export function useRoom(uid: string) {
  useEffect(() => {
    if (!uid) return
    void fetchServerOffset(uid)
    const id = setInterval(() => { void fetchServerOffset(uid) }, 300_000)
    return () => clearInterval(id)
  }, [uid])

  const [rooms, setRooms] = useState<Room[]>([])
  const [publicRooms, setPublicRooms] = useState<Room[]>([])
  const [friends, setFriends] = useState<User[]>([])
  const [incomingRequests, setIncomingRequests] = useState<Request[]>([])

  useEffect(() => {
    if (!uid) return
    const q = query(collection(db, 'rooms'), where('memberUids', 'array-contains', uid))
    return onSnapshot(
      q,
      (snap) => setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Room)),
      () => setRooms([])
    )
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const q = query(collection(db, 'rooms'), where('discoverable', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        setPublicRooms(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Room)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        )
      },
      () => setPublicRooms([])
    )
  }, [uid])

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      async (snap) => {
        const data = snap.data()
        const friendIds: string[] = data?.friendIds ?? []
        if (friendIds.length === 0) { if (!cancelled) setFriends([]); return }
        const users = await Promise.all(
          friendIds.map(async (fid) => {
            const s = await getDoc(doc(db, 'users', fid))
            return s.exists() ? ({ uid: fid, ...s.data() } as User) : null
          })
        )
        if (!cancelled) setFriends(users.filter(Boolean) as User[])
      },
      () => { if (!cancelled) setFriends([]) }
    )
    return () => { cancelled = true; unsub() }
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const q = query(collection(db, 'requests'), where('toUid', '==', uid))
    return onSnapshot(
      q,
      (snap) => {
        setIncomingRequests(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Request))
            .sort((a, b) => b.timestamp - a.timestamp)
        )
      },
      () => setIncomingRequests([])
    )
  }, [uid])

  async function createRoom(
    videoUrl: string,
    displayName: string,
    title = '',
    discoverable = false,
    password = '',
    maxMembers = 0,
    scheduledAt = 0
  ): Promise<string> {
    const code = randomCode()
    const now = Date.now()
    await setDoc(doc(db, 'rooms', code), {
      roomId: code,
      hostUid: uid,
      hostName: displayName,
      title: title.trim(),
      videoUrl: videoUrl.trim(),
      isPlaying: true,
      currentPositionMs: 0,
      updatedAt: now,
      videoVersion: now,
      memberUids: [uid],
      moderators: [],
      lastUpdatedBy: uid,
      discoverable,
      password: password.trim(),
      maxMembers,
      scheduledAt,
      presence: {},
      presenceNames: {},
      typing: {},
      reaction: '', reactionAt: 0, reactionBy: '',
      ctrlReqAt: 0, ctrlReqBy: '', ctrlReqName: '', ctrlReqAction: '',
      pinnedMessage: '', pinnedMessageSenderName: '',
      pollQuestion: '', pollOptions: [], pollVotes: {}, pollVoterChoice: {},
      queue: [],
      screenShareUid: '',
      clickSel: '', clickAt: 0, clickBy: ''
    })
    return code
  }

  async function joinRoom(code: string, password = ''): Promise<'ok' | 'not_found' | 'wrong_password' | 'full'> {
    const ref = doc(db, 'rooms', code.toUpperCase())
    const snap = await getDoc(ref)
    if (!snap.exists()) return 'not_found'
    const room = snap.data() as Room
    if (room.password && room.password !== password) return 'wrong_password'
    if (room.maxMembers > 0 && room.memberUids.length >= room.maxMembers) return 'full'
    await updateDoc(ref, { memberUids: arrayUnion(uid) })
    return 'ok'
  }

  async function deleteRoom(roomId: string) {
    // Anlık yerel güncelleme: Firestore listener'ı beklemeden listeyi güncelle
    setRooms((prev) => prev.filter((r) => r.id !== roomId))
    setPublicRooms((prev) => prev.filter((r) => r.id !== roomId))
    // Önce mesaj alt koleksiyonunu temizle (500 doc limit gözetilerek parça parça)
    const msgsSnap = await getDocs(collection(db, 'rooms', roomId, 'messages'))
    for (let i = 0; i < msgsSnap.docs.length; i += 499) {
      const batch = writeBatch(db)
      msgsSnap.docs.slice(i, i + 499).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    await deleteDoc(doc(db, 'rooms', roomId))
  }

  async function leaveRoom(roomId: string) {
    // Anlık yerel güncelleme: Firestore listener'ı beklemeden listeyi güncelle
    setRooms((prev) => prev.filter((r) => r.id !== roomId))
    await updateDoc(doc(db, 'rooms', roomId), { memberUids: arrayRemove(uid) })
  }

  async function updateVideoState(roomId: string, isPlaying: boolean, currentPositionMs: number) {
    await updateDoc(doc(db, 'rooms', roomId), {
      isPlaying, currentPositionMs, updatedAt: serverNow(), lastUpdatedBy: uid
    })
  }

  async function updateVideoUrl(roomId: string, url: string) {
    const now = Date.now()
    await updateDoc(doc(db, 'rooms', roomId), {
      videoUrl: url,
      currentPositionMs: 0,
      isPlaying: true,
      updatedAt: now,
      videoVersion: now,
      lastUpdatedBy: uid
    })
  }

  async function togglePublic(roomId: string, discoverable: boolean) {
    await updateDoc(doc(db, 'rooms', roomId), { discoverable })
  }

  async function setPresence(roomId: string, name: string) {
    await updateDoc(doc(db, 'rooms', roomId), {
      [`presence.${uid}`]: Date.now(),
      [`presenceNames.${uid}`]: name
    }).catch(() => {})
  }

  async function clearPresence(roomId: string) {
    await updateDoc(doc(db, 'rooms', roomId), {
      [`presence.${uid}`]: deleteField(),
      [`presenceNames.${uid}`]: deleteField()
    }).catch(() => {})
  }

  async function setTyping(roomId: string) {
    await updateDoc(doc(db, 'rooms', roomId), { [`typing.${uid}`]: Date.now() }).catch(() => {})
  }

  async function sendReaction(roomId: string, emoji: string) {
    await updateDoc(doc(db, 'rooms', roomId), {
      reaction: emoji, reactionAt: Date.now(), reactionBy: uid
    })
  }

  async function createPoll(roomId: string, question: string, options: string[]) {
    const pollVotes = Object.fromEntries(options.map((_, i) => [String(i), 0]))
    await updateDoc(doc(db, 'rooms', roomId), {
      pollQuestion: question,
      pollOptions: options,
      pollVotes,
      pollVoterChoice: {}
    })
  }

  async function votePoll(roomId: string, optionIndex: number) {
    await runRoomTransaction(roomId, (tx, room, ref) => {
      const prevChoice = room.pollVoterChoice?.[uid]
      if (prevChoice === optionIndex) return
      const votes = { ...(room.pollVotes ?? {}) }
      if (prevChoice != null) {
        const prev = String(prevChoice)
        votes[prev] = Math.max(0, (votes[prev] ?? 0) - 1)
      }
      const key = String(optionIndex)
      votes[key] = (votes[key] ?? 0) + 1
      tx.update(ref, {
        pollVotes: votes,
        [`pollVoterChoice.${uid}`]: optionIndex
      })
    })
  }

  async function clearPoll(roomId: string) {
    await updateDoc(doc(db, 'rooms', roomId), {
      pollQuestion: '',
      pollOptions: [],
      pollVotes: {},
      pollVoterChoice: {}
    })
  }

  async function pinMessage(roomId: string, text: string, senderName: string) {
    await updateDoc(doc(db, 'rooms', roomId), {
      pinnedMessage: text, pinnedMessageSenderName: senderName
    })
  }

  async function addToQueue(roomId: string, item: QueueItem) {
    await updateDoc(doc(db, 'rooms', roomId), { queue: arrayUnion(item) })
  }

  async function removeFromQueue(roomId: string, item: QueueItem) {
    await updateDoc(doc(db, 'rooms', roomId), { queue: arrayRemove(item) })
  }

  async function addUrlToQueue(roomId: string, url: string, displayName: string) {
    const u = url.trim()
    if (!u.startsWith('http://') && !u.startsWith('https://')) return
    const title = await fetchVideoTitle(u)
    const item: QueueItem = {
      id: crypto.randomUUID(),
      url: u,
      title,
      addedBy: uid,
      addedByName: displayName
    }
    await addToQueue(roomId, item)
  }

  async function addSearchResultToQueue(roomId: string, r: YtSearchResult, displayName: string) {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      url: `https://www.youtube.com/watch?v=${r.videoId}`,
      title: r.title,
      addedBy: uid,
      addedByName: displayName
    }
    await addToQueue(roomId, item)
  }

  async function playFromQueue(roomId: string, item: QueueItem) {
    const now = Date.now()
    await updateDoc(doc(db, 'rooms', roomId), {
      videoUrl: item.url,
      currentPositionMs: 0,
      isPlaying: true,
      updatedAt: now,
      videoVersion: now,
      lastUpdatedBy: uid,
      queue: arrayRemove(item)
    })
  }

  async function advanceQueue(roomId: string): Promise<boolean> {
    const now = Date.now()
    return runRoomTransaction(roomId, (tx, room, ref) => {
      const next = room.queue?.[0]
      if (!next) return
      tx.update(ref, {
        videoUrl: next.url,
        currentPositionMs: 0,
        isPlaying: true,
        updatedAt: now,
        videoVersion: now,
        lastUpdatedBy: uid,
        queue: arrayRemove(next)
      })
    })
  }

  // ---- Mesajlar ----
  function useMessages(roomId: string) {
    const [messages, setMessages] = useState<Message[]>([])
    useEffect(() => {
      if (!roomId) return
      // Mobil ile aynı limit: son 200 mesaj (tüm koleksiyon yerine)
      const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('timestamp', 'asc'), limitToLast(200))
      return onSnapshot(q, (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message))
      })
    }, [roomId])
    return messages
  }

  async function sendMessage(roomId: string, text: string, senderName: string, senderPhoto = '') {
    const t = text.trim()
    if (!t || !roomId || !uid) return false
    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderUid: uid,
        senderName,
        senderPhoto,
        text: t,
        timestamp: serverNow(),
        roomId,
        system: false,
        reactions: {}
      })
      return true
    } catch (e) {
      console.warn('[useRoom] sendMessage failed:', e)
      showToast(translate('watch_err_send'), 'error')
      return false
    }
  }

  async function sendSystemMessage(roomId: string, text: string) {
    if (!roomId || !text.trim()) return
    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderUid: '', senderName: '', text, timestamp: serverNow(), system: true
      })
    } catch (e) {
      console.warn('[useRoom] sendSystemMessage failed:', e)
    }
  }

  async function toggleMessageReaction(roomId: string, messageId: string, emoji: string) {
    const ref = doc(db, 'rooms', roomId, 'messages', messageId)
    const snap = await getDoc(ref)
    const reactions: Record<string, string> = snap.data()?.reactions ?? {}
    if (reactions[uid] === emoji) {
      await updateDoc(ref, { [`reactions.${uid}`]: deleteField() })
    } else {
      await updateDoc(ref, { [`reactions.${uid}`]: emoji })
    }
  }

  async function setModerator(roomId: string, targetUid: string, makeModerator: boolean) {
    await updateDoc(doc(db, 'rooms', roomId), {
      moderators: makeModerator ? arrayUnion(targetUid) : arrayRemove(targetUid)
    })
  }

  async function transferHost(roomId: string, newHostUid: string) {
    await updateDoc(doc(db, 'rooms', roomId), { hostUid: newHostUid })
  }

  // ---- Arkadaş/Oda istekleri ----
  async function sendFriendRequest(raw: string, fromName: string): Promise<string> {
    const input = raw.trim().replace(/^#/, '')
    if (!input) return translate('home_friend_invalid_input')

    const tryCode = async (code: string) => {
      const q2 = query(collection(db, 'users'), where('friendCode', '==', code.toUpperCase()))
      const snap2 = await getDocs(q2)
      if (snap2.empty) return null
      const target = snap2.docs[0]
      if (target.id === uid) return translate('toast_cannot_add_self')
      const ref = doc(collection(db, 'requests'))
      await setDoc(ref, { id: ref.id, fromUid: uid, fromName, toUid: target.id, type: 'friend', timestamp: Date.now() })
      return 'ok'
    }

    if (!input.includes('@')) {
      const byCode = await tryCode(input)
      if (byCode) return byCode
      return translate('toast_user_not_found')
    }

    const q = query(collection(db, 'users'), where('email', '==', input))
    const snap = await getDocs(q)
    if (snap.empty) {
      const byCode = await tryCode(input)
      return byCode ?? translate('toast_user_not_found')
    }
    const target = snap.docs[0]
    if (target.id === uid) return translate('toast_cannot_add_self')
    const ref = doc(collection(db, 'requests'))
    await setDoc(ref, { id: ref.id, fromUid: uid, fromName, toUid: target.id, type: 'friend', timestamp: Date.now() })
    return 'ok'
  }

  async function sendRoomInvite(toUid: string, fromName: string, roomId: string) {
    // Mobille aynı docId formatı: toUid_roomId
    const docId = `${toUid}_${roomId}`
    await setDoc(doc(db, 'requests', docId), {
      id: docId, fromUid: uid, fromName, toUid, type: 'room', roomId, timestamp: Date.now()
    })
  }

  async function acceptRequest(req: Request) {
    if (req.type === 'friend') {
      await updateDoc(doc(db, 'users', uid), { friendIds: arrayUnion(req.fromUid) })
      await updateDoc(doc(db, 'users', req.fromUid), { friendIds: arrayUnion(uid) })
    } else if (req.type === 'room' && req.roomId) {
      await updateDoc(doc(db, 'rooms', req.roomId), { memberUids: arrayUnion(uid) })
      try {
        const name = (await getDoc(doc(db, 'users', uid))).data()?.displayName ?? translate('common_user')
        await sendSystemMessage(req.roomId, translate('watch_user_joined', name))
      } catch {}
    }
    // id alanı document'a yazıldığı için güvenle silinebilir
    await deleteDoc(doc(db, 'requests', req.id))
  }

  async function rejectRequest(reqId: string) {
    await deleteDoc(doc(db, 'requests', reqId))
  }

  async function removeFriend(friendUid: string) {
    await updateDoc(doc(db, 'users', uid), { friendIds: arrayRemove(friendUid) })
    await updateDoc(doc(db, 'users', friendUid), { friendIds: arrayRemove(uid) })
    try {
      await deleteDmConversationBetween(uid, friendUid)
    } catch {
      /* DM yoksa veya silme izni yoksa arkadaşlık yine kaldırılmış olur */
    }
  }

  // ── Engelleme ──────────────────────────────────────────────────────────────
  async function blockUser(otherUid: string) {
    if (!uid || !otherUid || uid === otherUid) return
    await updateDoc(doc(db, 'users', uid), { blockedIds: arrayUnion(otherUid) })
    // Arkadaşlıktan da çıkar (çift yönlü)
    try { await removeFriend(otherUid) } catch { /* yut */ }
  }

  async function unblockUser(otherUid: string) {
    if (!uid || !otherUid) return
    await updateDoc(doc(db, 'users', uid), { blockedIds: arrayRemove(otherUid) })
  }

  return {
    rooms, publicRooms, friends, incomingRequests,
    createRoom, joinRoom, deleteRoom, leaveRoom,
    updateVideoState, updateVideoUrl,
    togglePublic, setPresence, clearPresence, setTyping,
    sendReaction, createPoll, votePoll, clearPoll, pinMessage,
    addToQueue, removeFromQueue, addUrlToQueue, addSearchResultToQueue, playFromQueue, advanceQueue,
    useMessages, sendMessage, sendSystemMessage, toggleMessageReaction,
    setModerator, transferHost,
    sendFriendRequest, sendRoomInvite, acceptRequest, rejectRequest, removeFriend,
    blockUser, unblockUser
  }
}
