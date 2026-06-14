export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('.').map((part) => parseInt(part, 10) || 0)
  const remoteParts = parse(remote)
  const currentParts = parse(current)
  const len = Math.max(remoteParts.length, currentParts.length)
  for (let i = 0; i < len; i++) {
    const rv = remoteParts[i] ?? 0
    const cv = currentParts[i] ?? 0
    if (rv > cv) return true
    if (rv < cv) return false
  }
  return false
}
