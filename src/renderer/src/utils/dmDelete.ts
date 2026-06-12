import { collection, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase/config'

function dmId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_')
}

/** İki kullanıcı arasındaki DM dokümanını ve tüm mesajlarını siler. */
export async function deleteDmConversationBetween(uid1: string, uid2: string): Promise<void> {
  if (!uid1 || !uid2 || uid1 === uid2) return
  const id = dmId(uid1, uid2)
  const messagesRef = collection(db, 'dms', id, 'messages')
  const snap = await getDocs(messagesRef)
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'dms', id)).catch(() => {})
}
