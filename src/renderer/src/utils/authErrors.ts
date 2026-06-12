import { translate } from '../locales/translate'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function mapAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message?.toLowerCase() ?? ''

  if (code === 'auth/credentials-required' || code === 'auth/missing-password' || code === 'auth/missing-email') {
    return Object.assign(new Error(translate('auth_err_credentials_required')), { code })
  }
  if (code === 'auth/name-required') {
    return Object.assign(new Error(translate('auth_err_name_required')), { code })
  }
  if (code === 'auth/invalid-email' || message.includes('badly formatted')) {
    return Object.assign(new Error(translate('auth_err_invalid_email')), { code: 'auth/invalid-email' })
  }
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    message.includes('invalid') ||
    message.includes('incorrect') ||
    message.includes('credential')
  ) {
    return Object.assign(new Error(translate('auth_err_wrong_password')), { code: 'auth/invalid-credential' })
  }
  if (code === 'auth/email-already-in-use') {
    return Object.assign(new Error(translate('auth_err_email_in_use')), { code })
  }
  if (code === 'auth/weak-password' || message.includes('at least 6')) {
    return Object.assign(new Error(translate('auth_err_weak_password')), { code: 'auth/weak-password' })
  }
  if (code === 'auth/too-many-requests' || message.includes('too many')) {
    return Object.assign(new Error(translate('auth_err_too_many')), { code })
  }
  if (code === 'auth/network-request-failed' || message.includes('network')) {
    return Object.assign(new Error(translate('auth_err_network')), { code })
  }
  if (code === 'auth/popup-closed-by-user') {
    return Object.assign(new Error(translate('auth_google_cancelled')), { code })
  }
  if (code === 'auth/popup-blocked') {
    return Object.assign(new Error(translate('auth_google_popup_blocked')), { code })
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return Object.assign(new Error(translate('auth_err_google_account_exists')), { code })
  }

  return Object.assign(new Error(translate('auth_err_generic')), { code: code || 'auth/unknown' })
}
