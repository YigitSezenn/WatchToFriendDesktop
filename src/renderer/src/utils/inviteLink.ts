export const INVITE_WEB_BASE = 'https://watchtofriend.web.app'
const WEB_HOSTS = new Set(['watchtofriend.web.app', 'watchtofriend.app'])

export function buildInviteLink(roomId: string): string {
  const code = resolveCode(roomId)
  if (!code) return `${INVITE_WEB_BASE}/join`
  return `${INVITE_WEB_BASE}/join?code=${code}`
}

export function buildDirectAppLink(roomId: string): string {
  const code = resolveCode(roomId) ?? roomId.toUpperCase().trim()
  return `watchtofriend://join/${code}`
}

export function buildInviteMessage(roomTitle: string | undefined, roomId: string): string {
  const title = roomTitle?.trim() || 'Watch with Friends'
  const code = resolveCode(roomId) ?? roomId.toUpperCase().trim()
  const link = buildInviteLink(code)
  return [`🎬 ${title} odasına katıl!`, link, '', `Oda kodu: ${code}`].join('\n')
}

export function buildCopyInviteLink(roomId: string): string {
  return buildInviteLink(roomId)
}

function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().trim()
  if (code.length !== 6) return null
  if (!/^[A-Z0-9]{6}$/.test(code)) return null
  return code
}

function decodeRepeated(raw: string): string {
  let text = raw
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(text)
      if (next === text) break
      text = next
    } catch {
      break
    }
  }
  return text
}

/** Bozuk / birleştirilmiş URL metninden ilk geçerli oda kodunu çıkarır. */
export function extractCodeFromBlob(raw: string): string | null {
  if (!raw.trim()) return null
  const text = decodeRepeated(raw.trim())
  const direct = normalizeCode(text)
  if (direct) return direct

  const patterns = [
    /[?&]code=([A-Z0-9]{6})/i,
    /\/join\/([A-Z0-9]{6})/i,
    /watchtofriend:?\/+\/?join\/+([A-Z0-9]{6})/i,
    /(?:Kod|Code|Oda kodu):\s*([A-Z0-9]{6})/i,
    /^([A-Z0-9]{6})/i
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m?.[1]) {
      const code = normalizeCode(m[1])
      if (code) return code
    }
  }
  return null
}

function resolveCode(roomId: string): string | null {
  return extractCodeFromBlob(roomId) ?? normalizeCode(roomId.toUpperCase().trim())
}

export function extractCodeFromInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = parseInviteFromUrl(trimmed)
  if (fromUrl) return fromUrl
  return extractCodeFromBlob(trimmed)
}

/** https://watchtofriend.web.app/join?code=ABC123 veya /join/ABC123 */
export function parseInviteFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const q = parsed.searchParams.get('code')
    if (q) {
      const fromQuery = extractCodeFromBlob(q)
      if (fromQuery) return fromQuery
    }

    if (parsed.protocol === 'https:' && WEB_HOSTS.has(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts[0] === 'join' && parts[1]) {
        const fromPath = extractCodeFromBlob(parts[1])
        if (fromPath) return fromPath
      }
      const fromHref = extractCodeFromBlob(parsed.href)
      if (fromHref) return fromHref
    }
    if (parsed.protocol === 'watchtofriend:' && parsed.hostname === 'join') {
      const path = parsed.pathname.replace(/^\//, '').trim()
      if (path) return extractCodeFromBlob(path)
    }
  } catch {
    // ignore
  }
  return extractCodeFromBlob(url)
}
