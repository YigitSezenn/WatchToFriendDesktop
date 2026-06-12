/** Android: unread toplamı en fazla 99 gösterilir. */
export function formatBadgeCount(count: number): string | null {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return null
  return n > 99 ? '99+' : String(n)
}

export function badgeNumber(count: number): number {
  return Math.min(99, Math.max(0, Math.floor(count)))
}

/** Firestore increment alanları bazen number/string döner; güvenli okuma. */
export function getUnreadForUser(
  unreadCount: Record<string, unknown> | undefined,
  uid: string
): number {
  if (!uid || !unreadCount) return 0
  const raw = unreadCount[uid]
  if (raw == null) return 0
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw))
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  if (typeof raw === 'object' && raw !== null && 'toNumber' in raw) {
    const n = (raw as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export function totalDmUnread(
  conversations: Array<{ unreadCount?: Record<string, unknown> }>,
  uid: string
): number {
  return conversations.reduce((s, c) => s + getUnreadForUser(c.unreadCount, uid), 0)
}
