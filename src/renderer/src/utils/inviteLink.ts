const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_WEB_BASE = 'https://watchtofriend.web.app'
const WEB_HOSTS = new Set(['watchtofriend.web.app', 'watchtofriend.app'])

export function buildInviteLink(roomId: string): string {
  const code = roomId.toUpperCase().trim()
  return `${INVITE_WEB_BASE}/join/${code}`
}

export function buildDirectAppLink(roomId: string): string {
  return `watchtofriend://join/${roomId.toUpperCase().trim()}`
}

export function buildInviteMessage(roomTitle: string | undefined, roomId: string): string {
  const title = roomTitle?.trim() || 'Watch with Friends'
  const code = roomId.toUpperCase().trim()
  return [
    `🎬 ${title} odasına katıl!`,
    buildInviteLink(code),
    '',
    buildDirectAppLink(code),
    '',
    `Kod: ${code}`
  ].join('\n')
}

function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().trim()
  if (code.length !== 6) return null
  if (![...code].every((c) => CODE_CHARS.includes(c))) return null
  return code
}

export function extractCodeFromInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = parseInviteFromUrl(trimmed)
  if (fromUrl) return fromUrl
  const m = trimmed.match(/^[A-Z0-9]{6}$/i)
  if (m && normalizeCode(m[0])) return normalizeCode(m[0])
  const join = trimmed.match(/\/join\/([A-Z0-9]{6})/i)
  if (join?.[1]) return normalizeCode(join[1])
  return null
}

/** https://watchtofriend.app/join/ABC123 veya watchtofriend://join/ABC123 */
export function parseInviteFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const q = parsed.searchParams.get('code')
    if (q) return normalizeCode(q) ?? null

    if (parsed.protocol === 'https:' && WEB_HOSTS.has(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts[0] === 'join' && parts[1]) return normalizeCode(parts[1]) ?? null
    }
    if (parsed.protocol === 'watchtofriend:' && parsed.hostname === 'join') {
      const path = parsed.pathname.replace(/^\//, '').trim()
      if (path) return normalizeCode(path) ?? null
    }
  } catch {
    // ignore
  }
  return null
}
