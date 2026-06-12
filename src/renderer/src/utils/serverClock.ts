import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

let serverOffset = 0

/** Yerel saat ile Firestore sunucu saati arasındaki fark (ms). */
export async function fetchServerOffset(uid: string): Promise<number> {
  if (!uid) return serverOffset
  try {
    const ref = doc(db, 'users', uid)
    const t0 = Date.now()
    await updateDoc(ref, { clockProbe: serverTimestamp() })
    const snap = await getDoc(ref)
    const t1 = Date.now()
    const probe = snap.data()?.clockProbe as { toMillis?: () => number } | undefined
    const serverMs = probe?.toMillis?.()
    if (serverMs == null) return serverOffset
    serverOffset = serverMs - (t0 + t1) / 2
  } catch {
    /* önceki offset korunur */
  }
  return serverOffset
}

/** Android RoomRepository.serverNow() ile uyumlu zaman damgası. */
export function serverNow(): number {
  return Date.now() + serverOffset
}
