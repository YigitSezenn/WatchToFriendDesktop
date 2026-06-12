import type { DmConversation } from '../types'

/** Firestore doc id veya participant uid çiftinden geçerli DM kimliği (mobil resolvedId parity). */
export function resolveDmId(conv: DmConversation, myUid: string): string {
  if (conv.id?.trim()) return conv.id.trim()
  const uids = [...new Set(conv.participantUids.filter(Boolean))].sort()
  if (uids.length >= 2) return uids.join('_')
  if (uids.length === 1 && myUid && myUid !== uids[0]) {
    return [myUid, uids[0]].sort().join('_')
  }
  return ''
}
