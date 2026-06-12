const SESSIONS_KEY = 'rating_room_sessions'
const PROMPTED_KEY = 'rating_prompted'
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.watch.watchtofriend'

export function recordRoomSession(): void {
  try {
    if (localStorage.getItem(PROMPTED_KEY) === '1') return
    const n = parseInt(localStorage.getItem(SESSIONS_KEY) ?? '0', 10) + 1
    localStorage.setItem(SESSIONS_KEY, String(n))
  } catch { /* yut */ }
}

export function shouldPromptRating(): boolean {
  try {
    if (localStorage.getItem(PROMPTED_KEY) === '1') return false
    return parseInt(localStorage.getItem(SESSIONS_KEY) ?? '0', 10) >= 3
  } catch {
    return false
  }
}

export function markRatingPrompted(): void {
  try { localStorage.setItem(PROMPTED_KEY, '1') } catch { /* yut */ }
}

export function openRatePage(): void {
  markRatingPrompted()
  window.open(PLAY_STORE, '_blank', 'noopener,noreferrer')
}
