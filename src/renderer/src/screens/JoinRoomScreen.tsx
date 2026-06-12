import React, { useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import { extractCodeFromInput } from '../utils/inviteLink'
import type { LocaleKey } from '../locales/tr'

interface Props {
  onJoin: (code: string, password: string) => Promise<'ok' | 'not_found' | 'wrong_password' | 'full'>
  onBack: () => void
  initialCode?: string
}

const JOIN_ERROR_KEYS: Record<string, LocaleKey> = {
  not_found: 'join_err_not_found',
  wrong_password: 'join_err_wrong_password',
  full: 'join_err_full'
}

export default function JoinRoomScreen({ onJoin, onBack, initialCode }: Props) {
  const { t } = useLocale()
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (code.trim().length < 6) { setError(t('join_code_short_error')); return }
    setLoading(true)
    const result = await onJoin(code.trim(), password)
    if (result !== 'ok') {
      setError(t(JOIN_ERROR_KEYS[result] ?? 'common_error'))
      setLoading(false)
    }
  }

  return (
    <div className="simple-screen">
      <div className="simple-card">
        <button className="btn-back" onClick={onBack}>← {t('common_back')}</button>
        <h2>{t('join_title')}</h2>
        <p className="hint">
          {initialCode ? t('join_hint_invite') : t('join_hint_code')}
        </p>

        <div className="form-group">
          <label>{t('join_code_label')}</label>
          <input
            type="text"
            placeholder="AB1234"
            value={code}
            onChange={(e) => {
              const extracted = extractCodeFromInput(e.target.value)
              setCode(extracted ?? e.target.value.toUpperCase().slice(0, 6))
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={6}
            autoFocus
            style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.3rem' }}
          />
        </div>

        <div className="form-group">
          <label>{t('join_password_label')}</label>
          <input
            type="password"
            placeholder={t('join_password_placeholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn-primary full" onClick={handleJoin} disabled={loading}>
          {loading ? t('common_connecting') : t('common_join')}
        </button>
      </div>
    </div>
  )
}
