import React, { useMemo, useRef, useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import BrandLogo from '../components/BrandLogo'
import type { LocaleKey } from '../locales/tr'

interface Props {
  onCreate: (videoUrl: string, title: string, discoverable: boolean, password: string, maxMembers: number, scheduledAt: number) => Promise<string>
  onBack: () => void
}

const TEMPLATE_KEYS: LocaleKey[] = [
  'room_template_film',
  'room_template_anime',
  'room_template_series',
  'room_template_doc',
  'room_template_sport',
  'room_template_concert'
]

export default function CreateRoomScreen({ onCreate, onBack }: Props) {
  const { t, dateLocale } = useLocale()
  const templates = useMemo(() => TEMPLATE_KEYS.map((key) => t(key)), [t])
  const [videoUrl, setVideoUrl] = useState('')
  const [title, setTitle] = useState('')
  const [discoverable, setDiscoverable] = useState(false)
  const [password, setPassword] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [scheduledAt, setScheduledAt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dateInputRef = useRef<HTMLInputElement>(null)

  const urlError = videoUrl && !videoUrl.startsWith('http') ? t('room_err_url') : ''
  const pastDateError = scheduledAt > 0 && scheduledAt < Date.now()
  const canCreate = !loading && !urlError && !pastDateError

  const scheduledLabel = scheduledAt > 0 ? new Date(scheduledAt).toLocaleString(dateLocale) : null

  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16)

  function handleDateChange(val: string) {
    if (!val) { setScheduledAt(0); return }
    const ts = new Date(val).getTime()
    if (!isNaN(ts)) setScheduledAt(ts)
  }

  async function handleCreate() {
    if (urlError || pastDateError) return
    setError('')
    setLoading(true)
    try {
      await onCreate(videoUrl.trim(), title.trim(), discoverable, password.trim(), parseInt(maxMembers) || 0, scheduledAt)
    } catch {
      setError(t('room_err_create_failed'))
      setLoading(false)
    }
  }

  return (
    <div className="simple-screen">
      <div className="simple-card create-card">
        <button className="btn-back" onClick={onBack}>← {t('common_back')}</button>
        <div className="create-hero">
          <BrandLogo size={72} hero />
          <h2>{t('room_create_heading')}</h2>
          <p className="hint">{t('room_create_sub')}</p>
        </div>

        <div className="form-group">
          <label>{t('room_templates')}</label>
          <div className="template-chips">
            {templates.map((label) => (
              <button
                key={label}
                className={`chip ${title === label ? 'chip-active' : ''}`}
                onClick={() => setTitle(title === label ? '' : label)}
              >{label}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>{t('room_name_hint')}</label>
          <input type="text" placeholder={t('room_name_placeholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="form-group">
          <label>{t('room_video_hint')}</label>
          <input
            type="url"
            placeholder={t('room_video_placeholder')}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          {urlError && <div className="field-error">{urlError}</div>}
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🕐 {t('room_schedule')}</span>
            {scheduledAt > 0 && (
              <button className="btn-link" style={{ fontSize: 11 }} onClick={() => { setScheduledAt(0); if (dateInputRef.current) dateInputRef.current.value = '' }}>
                {t('common_clear')}
              </button>
            )}
          </label>
          <input
            ref={dateInputRef}
            type="datetime-local"
            min={nowLocal}
            onChange={e => handleDateChange(e.target.value)}
            style={{ cursor: 'pointer' }}
          />
          {pastDateError && <div className="field-error">{t('room_schedule_past')}</div>}
          {scheduledLabel && !pastDateError && (
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 4 }}>
              {t('room_schedule_planned', scheduledLabel)}
            </div>
          )}
        </div>

        <div className="toggle-row" onClick={() => setDiscoverable(!discoverable)}>
          <div>
            <div className="toggle-label">{t('room_public')}</div>
            <div className="toggle-sub">{t('room_public_hint')}</div>
          </div>
          <div className={`toggle ${discoverable ? 'on' : ''}`}><div className="toggle-knob" /></div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>{t('room_password_hint')}</label>
            <input type="text" placeholder={t('room_password_placeholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="form-group" style={{ width: 110 }}>
            <label>{t('room_max_members')}</label>
            <input type="number" placeholder="∞" min="0" max="100" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn-primary full" onClick={handleCreate} disabled={!canCreate}>
          {loading ? t('room_creating') : scheduledAt > 0 ? t('room_schedule_btn') : t('room_create_btn')}
        </button>
      </div>
    </div>
  )
}
