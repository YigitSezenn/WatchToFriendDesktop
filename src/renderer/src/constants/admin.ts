export const ADMIN_EMAIL = 'ysezenn@outlook.com'

export function isAdminUser(email?: string | null): boolean {
  return (email ?? '').toLowerCase() === ADMIN_EMAIL.toLowerCase()
}
