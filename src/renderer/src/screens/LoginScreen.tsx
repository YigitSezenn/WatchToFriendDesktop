import React, { useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import BrandLogo from '../components/BrandLogo'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string, name: string) => Promise<void>
}

export default function LoginScreen({ onLogin, onRegister }: Props) {
  const { t } = useLocale()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        if (!name.trim()) { setError(t('auth_err_name_required')); setLoading(false); return }
        await onRegister(email, password, name)
      } else {
        await onLogin(email, password)
      }
    } catch (err: unknown) {
      const msg = (err as { code?: string; message?: string })?.code
        ?? (err as { message?: string })?.message
        ?? t('auth_err_generic')
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError(t('auth_err_wrong_password'))
      } else if (msg.includes('email-already-in-use')) {
        setError(t('auth_err_email_in_use'))
      } else if (msg.includes('weak-password')) {
        setError(t('auth_err_weak_password'))
      } else {
        setError(String(msg))
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo size={96} hero />
          <h1>WatchToFriend</h1>
          <p>{t(isRegister ? 'auth_subtitle_register' : 'auth_subtitle_login')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <div className="form-group">
              <label>{t('auth_display_name')}</label>
              <input
                type="text"
                placeholder={t('auth_name_placeholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>{t('auth_email')}</label>
            <input
              type="email"
              placeholder="ornek@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth_password')}</label>
            <div className="password-field-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={t(showPassword ? 'auth_hide_password' : 'auth_show_password')}
                title={t(showPassword ? 'auth_hide_password' : 'auth_show_password')}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : t(isRegister ? 'auth_register' : 'auth_login')}
          </button>
        </form>

        <div className="auth-switch">
          {t(isRegister ? 'auth_toggle_login' : 'auth_toggle_register')}
          <button className="btn-link" onClick={() => { setIsRegister(!isRegister); setError('') }}>
            {isRegister ? ` ${t('auth_login')}` : ` ${t('auth_register')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
