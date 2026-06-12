import React, { useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import BrandLogo from '../components/BrandLogo'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string, name: string) => Promise<void>
  onGoogleLogin: () => Promise<void>
  onResetPassword: (email: string) => Promise<void>
}

export default function LoginScreen({ onLogin, onRegister, onGoogleLogin, onResetPassword }: Props) {
  const { t } = useLocale()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (isRegister) {
        await onRegister(email, password, name)
      } else {
        await onLogin(email, password)
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || t('auth_err_generic'))
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await onGoogleLogin()
    } catch (err: unknown) {
      setError((err as Error)?.message || t('auth_err_generic'))
    }
    setLoading(false)
  }

  async function handleResetPassword() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await onResetPassword(email)
      setInfo(t('auth_info_reset_sent'))
    } catch (err: unknown) {
      setError((err as Error)?.message || t('auth_err_generic'))
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
              autoComplete="email"
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
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 6 : undefined}
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

          {!isRegister && (
            <div className="auth-forgot-row">
              <button
                type="button"
                className="btn-link"
                disabled={loading}
                onClick={() => void handleResetPassword()}
              >
                {t('auth_forgot_password')}
              </button>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : t(isRegister ? 'auth_register' : 'auth_login')}
          </button>
        </form>

        <div className="auth-divider">
          <span>{t('auth_or')}</span>
        </div>

        <button type="button" className="btn-google" disabled={loading} onClick={() => void handleGoogle()}>
          <span className="btn-google-icon" aria-hidden>G</span>
          {t('auth_google')}
        </button>

        <div className="auth-switch">
          {t(isRegister ? 'auth_toggle_login' : 'auth_toggle_register')}
          <button
            className="btn-link"
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
              setInfo('')
            }}
          >
            {isRegister ? ` ${t('auth_login')}` : ` ${t('auth_register')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
