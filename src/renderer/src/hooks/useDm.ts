import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, onSnapshot,
  query, where, orderBy, updateDoc, deleteDoc, getDoc, deleteField, increment,
  writeBatch, limitToLast, addDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { compressPhotoForStorage } from '../utils/photo'
import { serverNow } from '../utils/serverClock'
import { translate } from '../locales/translate'
import { showToast } from '../utils/toast'
import type { DmConversation, Message } from '../types'

function dmId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_')
}

function randomCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

export function useDm(myUid: string) {
  const [conversations, setConversations] = useState<DmConversation[]>([])

  useEffect(() => {
    if (!myUid) return
    const q = query(collection(db, 'dms'), where('participantUids', 'array-contains', myUid))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DmConversation)
        list.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        setConversations(list)
      },
      () => setConversations([])
    )
  }, [myUid])

  function useMessages(id: string) {
    const [messages, setMessages] = useState<Message[]>([])
    useEffect(() => {
      if (!id) return
      // Mobil ile aynı limit: son 200 mesaj — tüm koleksiyonu çekmekten kaçın
      const q = query(collection(db, 'dms', id, 'messages'), orderBy('timestamp', 'asc'), limitToLast(200))
      return onSnapshot(
        q,
        (snap) => {
          setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message))
        },
        () => setMessages([])
      )
    }, [id])
    return messages
  }

  async function openOrCreateDm(
    otherUid: string,
    myName: string,
    otherName: string,
    myPhoto = '',
    otherPhoto = ''
  ): Promise<string> {
    const id = dmId(myUid, otherUid)
    const ref = doc(db, 'dms', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        participantUids: [myUid, otherUid],
        participantNames: { [myUid]: myName, [otherUid]: otherName },
        participantPhotos: { [myUid]: myPhoto, [otherUid]: otherPhoto },
        lastMessage: '',
        lastMessageAt: Date.now(),
        lastSenderUid: '',
        unreadCount: { [myUid]: 0, [otherUid]: 0 }
      })
    }
    return id
  }

  async function sendMessage(id: string, text: string, senderName: string, senderPhoto = '') {
    const t = text.trim()
    if (!t || !myUid) return false
    const otherUid = id.split('_').find((u) => u !== myUid) ?? ''
    const now = serverNow()
    try {
      const batch = writeBatch(db)
      const msgRef = doc(collection(db, 'dms', id, 'messages'))
      batch.set(msgRef, {
        senderUid: myUid,
        senderName,
        senderPhoto,
        text: t,
        timestamp: now,
        reactions: {}
      })
      batch.update(doc(db, 'dms', id), {
        lastMessage: t,
        lastMessageAt: now,
        lastSenderUid: myUid,
        [`unreadCount.${otherUid}`]: increment(1)
      })
      await batch.commit()
      return true
    } catch (e) {
      console.warn('[useDm] sendMessage failed:', e)
      showToast(translate('watch_err_send'), 'error')
      return false
    }
  }

  async function deleteMessage(dmConvId: string, msgId: string) {
    await deleteDoc(doc(db, 'dms', dmConvId, 'messages', msgId))
  }

  async function toggleReaction(dmConvId: string, msgId: string, emoji: string) {
    // Mobil ile aynı format: reactions = { uid → emoji }
    const ref = doc(db, 'dms', dmConvId, 'messages', msgId)
    const snap = await getDoc(ref)
    const reactions: Record<string, string> = snap.data()?.reactions ?? {}
    if (reactions[myUid] === emoji) {
      // Aynı emojiye basınca kaldır
      await updateDoc(ref, { [`reactions.${myUid}`]: deleteField() })
    } else {
      // Farklı emoji seç (veya yeni ekle)
      await updateDoc(ref, { [`reactions.${myUid}`]: emoji })
    }
  }

  async function clearUnread(id: string) {
    await updateDoc(doc(db, 'dms', id), { [`unreadCount.${myUid}`]: 0 }).catch(() => {})
  }

  return { conversations, useMessages, openOrCreateDm, sendMessage, deleteMessage, toggleReaction, clearUnread }
}

export function useProfile(myUid: string) {
  async function ensureFriendCode(): Promise<string> {
    const snap = await getDoc(doc(db, 'users', myUid))
    const existing = snap.data()?.friendCode
    if (existing) return existing
    const code = randomCode()
    await updateDoc(doc(db, 'users', myUid), { friendCode: code })
    return code
  }

  async function updateDisplayName(name: string) {
    await updateDoc(doc(db, 'users', myUid), { displayName: name })
  }

  async function updatePhoto(base64: string) {
    const compressed = await compressPhotoForStorage(base64)
    await updateDoc(doc(db, 'users', myUid), { photoBase64: compressed })
  }

  async function removePhoto() {
    await updateDoc(doc(db, 'users', myUid), { photoBase64: '' })
  }

  function useHistory() {
    const [history, setHistory] = useState<import('../types').WatchHistory[]>([])
    useEffect(() => {
      if (!myUid) return
      const q = query(collection(db, 'users', myUid, 'history'), orderBy('watchedAt', 'desc'))
      return onSnapshot(q, (snap) => {
        setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as import('../types').WatchHistory))
      })
    }, [myUid])
    return history
  }

  async function addToHistory(videoUrl: string, roomId: string) {
    await addDoc(collection(db, 'users', myUid, 'history'), {
      videoUrl, roomId, watchedAt: Date.now()
    })
  }

  async function deleteHistory(id: string) {
    await deleteDoc(doc(db, 'users', myUid, 'history', id))
  }

  return { ensureFriendCode, updateDisplayName, updatePhoto, removePhoto, useHistory, addToHistory, deleteHistory }
}
