import {
  collection, doc, deleteDoc, getDocs, updateDoc, writeBatch, query, where,
  arrayRemove, deleteField
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { deleteDmConversationBetween } from './dmDelete'

async function deleteRoomFully(roomId: string): Promise<void> {
  const msgsSnap = await getDocs(collection(db, 'rooms', roomId, 'messages'))
  for (let i = 0; i < msgsSnap.docs.length; i += 499) {
    const batch = writeBatch(db)
    msgsSnap.docs.slice(i, i + 499).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'rooms', roomId)).catch(() => {})
}

async function leaveOrTransferRoom(roomId: string, uid: string, hostUid: string, members: string[]): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId)
  if (hostUid === uid) {
    const others = members.filter((m) => m !== uid)
    if (others.length === 0) {
      await deleteRoomFully(roomId)
      return
    }
    await updateDoc(roomRef, {
      hostUid: others[0],
      memberUids: arrayRemove(uid),
      moderators: arrayRemove(uid),
      [`presence.${uid}`]: deleteField(),
      [`presenceNames.${uid}`]: deleteField()
    })
    return
  }
  await updateDoc(roomRef, {
    memberUids: arrayRemove(uid),
    moderators: arrayRemove(uid),
    [`presence.${uid}`]: deleteField(),
    [`presenceNames.${uid}`]: deleteField()
  })
}

/** Firestore verilerini siler; Auth kullanıcısı ayrıca deleteUser ile kaldırılmalı. */
export async function purgeUserData(uid: string, friendIds: string[]): Promise<void> {
  if (!uid) return

  await Promise.all(
    friendIds.map((fid) =>
      updateDoc(doc(db, 'users', fid), { friendIds: arrayRemove(uid) }).catch(() => {})
    )
  )

  const dmsSnap = await getDocs(query(collection(db, 'dms'), where('participantUids', 'array-contains', uid)))
  for (const dmDoc of dmsSnap.docs) {
    const other = (dmDoc.data().participantUids as string[] | undefined)?.find((u) => u !== uid)
    if (other) await deleteDmConversationBetween(uid, other)
  }

  const [reqFrom, reqTo] = await Promise.all([
    getDocs(query(collection(db, 'requests'), where('fromUid', '==', uid))),
    getDocs(query(collection(db, 'requests'), where('toUid', '==', uid)))
  ])
  const reqIds = new Set<string>()
  const reqRefs = [...reqFrom.docs, ...reqTo.docs].filter((d) => {
    if (reqIds.has(d.id)) return false
    reqIds.add(d.id)
    return true
  })
  for (let i = 0; i < reqRefs.length; i += 499) {
    const batch = writeBatch(db)
    reqRefs.slice(i, i + 499).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  const roomsSnap = await getDocs(query(collection(db, 'rooms'), where('memberUids', 'array-contains', uid)))
  for (const roomDoc of roomsSnap.docs) {
    const data = roomDoc.data()
    const members = (data.memberUids as string[] | undefined) ?? []
    const hostUid = String(data.hostUid ?? '')
    await leaveOrTransferRoom(roomDoc.id, uid, hostUid, members)
  }

  const histSnap = await getDocs(collection(db, 'users', uid, 'history'))
  for (let i = 0; i < histSnap.docs.length; i += 499) {
    const batch = writeBatch(db)
    histSnap.docs.slice(i, i + 499).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  await deleteDoc(doc(db, 'users', uid))
}
