import React, { useState, useRef, useEffect, useMemo } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { bannerSrc, photoSrc } from '../utils/photo'
import { PROFILE_NAME_COLORS, nameColorStyle } from '../utils/profileColor'
import { useTheme } from '../hooks/useTheme'
import { useLocale } from '../hooks/useLocale'
import { resetTour } from '../components/FirstLaunchTour'
import { openRatePage } from '../utils/ratingPref'
import type { AppLocale } from '../utils/localePref'
import type { ThemeMode } from '../utils/themePref'
import type { LocaleKey } from '../locales/tr'
import type { User, WatchHistory } from '../types'

interface BlockedEntry { uid: string; displayName: string }

interface Props {
  user: User
  history: WatchHistory[]
  onUpdateName: (name: string) => Promise<void>
  onUpdatePhoto: (base64: string) => Promise<void>
  onRemovePhoto: () => Promise<void>
  onUpdateBanner: (base64: string) => Promise<void>
  onRemoveBanner: () => Promise<void>
  onUpdateBio: (bio: string) => Promise<void>
  onUpdateNameColor: (color: string) => Promise<void>
  onDeleteHistory: (id: string) => void
  onUnblockUser: (uid: string) => Promise<void>
  onDeleteAccount?: (password: string) => Promise<void>
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>
  onReplayTour?: () => void
  onOpenHelp?: () => void
  onClose: () => void
}

const MAX_BIO = 300

export default function ProfileModal({
  user, history, onUpdateName, onUpdatePhoto, onRemovePhoto,
  onUpdateBanner, onRemoveBanner, onUpdateBio, onUpdateNameColor,
  onDeleteHistory, onUnblockUser,
  onDeleteAccount, onChangePassword, onReplayTour, onOpenHelp, onClose
}: Props) {
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const { pref: localePref, setLocale, t, dateLocale } = useLocale()

  const THEME_OPTIONS = useMemo(() => [
    { label: t('theme_system'), value: 0 as ThemeMode },
    { label: t('theme_light'), value: 1 as ThemeMode },
    { label: t('theme_dark'), value: 2 as ThemeMode }
  ], [t])

  const LANG_OPTIONS = useMemo(() => [
    { label: t('lang_system'), value: 'system' as AppLocale },
    { label: t('lang_turkish'), value: 'tr' as AppLocale },
    { label: t('lang_english'), value: 'en' as AppLocale }
  ], [t])

  const [editName, setEditName] = useState(user.displayName)
  const [editBio, setEditBio] = useState(user.bio ?? '')
  const [selectedColor, setSelectedColor] = useState(user.nameColor ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [blockedEntries, setBlockedEntries] = useState<BlockedEntry[]>([])
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => { setEditName(user.displayName) }, [user.displayName])
  useEffect(() => { setEditBio(user.bio ?? '') }, [user.bio])
  useEffect(() => { setSelectedColor(user.nameColor ?? '') }, [user.nameColor])

  useEffect(() => {
    const api = (window as { electronAPI?: { getAppVersion?: () => Promise<string> } }).electronAPI
    api?.getAppVersion?.().then(setAppVersion).catch(() => {})
  }, [])

  useEffect(() => {
    const ids: string[] = user.blockedIds ?? []
    if (ids.length === 0) { setBlockedEntries([]); return }
    let cancelled = false
    Promise.all(
      ids.map(async (bid) => {
        const snap = await getDoc(doc(db, 'users', bid))
        const name = snap.exists() ? ((snap.data().displayName as string) || bid) : bid
        return { uid: bid, displayName: name }
      })
    ).then((entries) => { if (!cancelled) setBlockedEntries(entries) })
    return () => { cancelled = true }
  }, [user.blockedIds])

  async function handleUnblock(uid: string) {
    setUnblockingUid(uid)
    await onUnblockUser(uid)
    setBlockedEntries(prev => prev.filter(e => e.uid !== uid))
    setUnblockingUid(null)
  }

  async function handleSaveName() {
    if (!editName.trim() || editName === user.displayName) return
    setSaving(true)
    await onUpdateName(editName.trim())
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSaveBio() {
    if (editBio === (user.bio ?? '')) return
    setSaving(true)
    await onUpdateBio(editBio)
    setSaving(false)
  }

  async function handleColorPick(color: string) {
    setSelectedColor(color)
    await onUpdateNameColor(color)
  }

  async function handleRemovePhoto() {
    if (!photoSrc(user.photoBase64) || removingPhoto) return
    setRemovingPhoto(true)
    try { await onRemovePhoto() } finally { setRemovingPhoto(false) }
  }

  async function handleRemoveBanner() {
    if (!bannerSrc(user.bannerBase64) || uploadingBanner) return
    setUploadingBanner(true)
    try { await onRemoveBanner() } finally { setUploadingBanner(false) }
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error(t('profile_photo_read_error')))
      reader.readAsDataURL(file)
    })
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || uploadingPhoto || removingPhoto) return
    setPhotoError(null)
    setUploadingPhoto(true)
    try {
      await onUpdatePhoto(await readFileAsDataUrl(file))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : t('profile_photo_upload_error'))
    } finally {
      setUploadingPhoto(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || uploadingBanner) return
    setBannerError(null)
    setUploadingBanner(true)
    try {
      await onUpdateBanner(await readFileAsDataUrl(file))
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : t('profile_banner_upload_error'))
    } finally {
      setUploadingBanner(false)
      if (bannerRef.current) bannerRef.current.value = ''
    }
  }

  function copyFriendCode() {
    if (user.friendCode) navigator.clipboard.writeText(user.friendCode)
  }

  async function handleChangePassword() {
    if (!onChangePassword) return
    setPasswordMsg(null)
    setPasswordError(null)
    if (newPassword.length < 6) { setPasswordError(t('profile_password_min')); return }
    if (newPassword !== newPasswordConfirm) { setPasswordError(t('profile_password_mismatch')); return }
    setChangingPassword(true)
    try {
      await onChangePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setPasswordMsg(t('profile_password_updated'))
    } catch {
      setPasswordError(t('profile_password_failed'))
    } finally {
      setChangingPassword(false)
    }
  }

  const hasPhoto = Boolean(photoSrc(user.photoBase64))
  const hasBanner = Boolean(bannerSrc(user.bannerBase64))
  const previewNameStyle = nameColorStyle(selectedColor)
  const ringStyle = selectedColor ? { boxShadow: `0 0 0 3px ${selectedColor}` } : undefined

  return (
    <div className="modal-overlay" onClick={() => { if (!removingPhoto) onClose() }}>
      <div className={`modal profile-studio${removingPhoto ? ' is-busy' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="profile-studio-topbar">
          <h2>{t('profile_title' as LocaleKey)}</h2>
          <button type="button" className="btn-icon profile-studio-close" onClick={onClose} disabled={removingPhoto}>✕</button>
        </div>

        <div className="profile-studio-banner-wrap">
          <div className="profile-studio-banner">
            {hasBanner ? (
              <img src={bannerSrc(user.bannerBase64)!} alt="" className="profile-studio-banner-img" />
            ) : (
              <div className="profile-studio-banner-fallback" />
            )}
            <div className="profile-studio-banner-actions">
              <button type="button" className="btn-secondary btn-sm profile-banner-action-btn" disabled={uploadingBanner} onClick={() => bannerRef.current?.click()}>
                <span className="profile-banner-action-icon" aria-hidden>🖼</span>
                {t('profile_change_banner' as LocaleKey)}
              </button>
              {hasBanner && (
                <button type="button" className="btn-secondary btn-sm profile-banner-action-btn profile-banner-action-btn--icon" disabled={uploadingBanner} onClick={() => { void handleRemoveBanner() }} title={t('profile_remove_banner' as LocaleKey)}>
                  ✕
                </button>
              )}
            </div>
            <div className="profile-studio-banner-identity">
              <div className="profile-studio-banner-identity-inner">
                <div className="profile-studio-avatar-col">
                  <div
                    className={`profile-avatar-wrap profile-studio-avatar profile-studio-avatar--overlay${removingPhoto || uploadingPhoto ? ' is-loading' : ''}`}
                    style={ringStyle}
                    onClick={() => { if (!removingPhoto && !uploadingPhoto) photoRef.current?.click() }}
                  >
                    {hasPhoto ? (
                      <img src={photoSrc(user.photoBase64)!} className="profile-avatar-img" alt="avatar" />
                    ) : (
                      <div className="profile-avatar-big">{(user.displayName?.[0] ?? '?').toUpperCase()}</div>
                    )}
                    {!removingPhoto && !uploadingPhoto && <div className="profile-avatar-edit">📷</div>}
                    {(removingPhoto || uploadingPhoto) && (
                      <div className="profile-avatar-loading" aria-hidden>
                        <span className="profile-remove-spinner profile-remove-spinner-lg" />
                      </div>
                    )}
                  </div>
                  {(hasPhoto || removingPhoto) && (
                    <button type="button" className="profile-remove-btn profile-remove-btn--overlay" disabled={removingPhoto} onClick={() => { void handleRemovePhoto() }} title={t('profile_remove_photo')}>
                      {removingPhoto ? <span className="profile-remove-spinner" /> : <span className="profile-remove-icon" aria-hidden>🗑</span>}
                    </button>
                  )}
                </div>
                <div className="profile-studio-banner-meta">
                  <span className="profile-studio-eyebrow">{t('profile_eyebrow' as LocaleKey)}</span>
                  <div className="profile-studio-name-line">
                    <span className="profile-studio-display-name" style={previewNameStyle}>{editName || user.displayName}</span>
                    <span className="profile-studio-name-tag">#{user.friendCode || '...'}</span>
                  </div>
                  {user.email && <div className="profile-email">{user.email}</div>}
                </div>
              </div>
            </div>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { void handleBannerChange(e) }} />
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { void handlePhotoChange(e) }} />
          {bannerError && <p className="profile-photo-error">{bannerError}</p>}
          {photoError && <p className="profile-photo-error">{photoError}</p>}
          {user.friendCode && (
            <div className="friend-code-row profile-studio-friend-code" onClick={copyFriendCode} title={t('profile_copy')}>
              <span className="friend-code-label">{t('profile_friend_id')}</span>
              <span className="friend-code-value">#{user.friendCode}</span>
              <span className="friend-code-copy">📋</span>
            </div>
          )}
        </div>

        <div className="profile-studio-grid">
          <section className="profile-card">
            <div className="profile-card-hdr">
              <span className="profile-card-title">{t('profile_bio_title' as LocaleKey)}</span>
              <span className="profile-card-sub">{t('profile_bio_hint' as LocaleKey)}</span>
            </div>
            <textarea
              className="profile-bio-input"
              value={editBio}
              maxLength={MAX_BIO}
              placeholder={t('profile_bio_placeholder' as LocaleKey)}
              onChange={(e) => setEditBio(e.target.value)}
            />
            <div className="profile-card-footer">
              <span className="profile-bio-count">{editBio.length}/{MAX_BIO}</span>
              <button type="button" className="btn-primary" disabled={saving || editBio === (user.bio ?? '')} onClick={() => { void handleSaveBio() }}>
                {t('profile_bio_save' as LocaleKey)}
              </button>
            </div>
          </section>

          <section className="profile-card">
            <div className="profile-card-hdr">
              <span className="profile-card-title">{t('profile_name_style_title' as LocaleKey)}</span>
              <span className="profile-card-sub">{t('profile_name_style_hint' as LocaleKey)}</span>
            </div>
            <div className="form-group">
              <label>{t('profile_display_name')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleSaveName()} />
                <button className="btn-primary" onClick={() => { void handleSaveName() }} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
                  {saved ? '✓' : saving ? '...' : t('profile_save')}
                </button>
              </div>
            </div>
            <div className="profile-color-label">{t('profile_name_color' as LocaleKey)}</div>
            <div className="profile-color-row">
              {PROFILE_NAME_COLORS.map((hex) => (
                <button
                  key={hex || 'default'}
                  type="button"
                  className={`profile-color-swatch${selectedColor === hex ? ' active' : ''}${hex ? '' : ' default'}`}
                  style={hex ? { background: hex } : undefined}
                  onClick={() => { void handleColorPick(hex) }}
                  aria-label={hex || 'default'}
                />
              ))}
            </div>
            <div className="profile-preview-card">
              <div className="profile-preview-label">{t('profile_preview' as LocaleKey)}</div>
              <div className="profile-studio-name-line">
                <span className="profile-preview-name" style={previewNameStyle}>{editName || user.displayName}</span>
                <span className="profile-studio-name-tag">#{user.friendCode || '...'}</span>
              </div>
            </div>
          </section>
        </div>

        <button type="button" className="btn-link profile-settings-toggle" onClick={() => setShowSettings(v => !v)}>
          {showSettings ? t('profile_hide_settings' as LocaleKey) : t('profile_show_settings' as LocaleKey)}
        </button>

        {showSettings && (
          <div className="profile-studio-settings">
            {appVersion && <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text2)' }}>{t('profile_version', appVersion)}</div>}
            <div style={{ marginBottom: 16 }}>
              <div className="profile-settings-label">{t('profile_theme')}</div>
              <div className="theme-chips">
                {THEME_OPTIONS.map(({ label, value }) => (
                  <button key={value} type="button" className={`theme-chip${themeMode === value ? ' active' : ''}`} onClick={() => setThemeMode(value)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="profile-settings-label">{t('profile_language')}</div>
              <div className="theme-chips">
                {LANG_OPTIONS.map(({ label, value }) => (
                  <button key={value} type="button" className={`theme-chip${localePref === value ? ' active' : ''}`} onClick={() => setLocale(value)}>{label}</button>
                ))}
              </div>
            </div>
            {onChangePassword && (
              <div className="profile-password-section">
                <div className="profile-settings-label">{t('profile_change_password')}</div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_current_password')}</label>
                  <input type="password" autoComplete="current-password" value={currentPassword} disabled={changingPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_new_password')}</label>
                  <input type="password" autoComplete="new-password" value={newPassword} disabled={changingPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_new_password_confirm')}</label>
                  <input type="password" autoComplete="new-password" value={newPasswordConfirm} disabled={changingPassword} onChange={(e) => setNewPasswordConfirm(e.target.value)} />
                </div>
                {passwordError && <p className="profile-photo-error">{passwordError}</p>}
                {passwordMsg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{passwordMsg}</p>}
                <button type="button" className="btn-secondary" style={{ width: '100%' }} disabled={changingPassword || !currentPassword || !newPassword || !newPasswordConfirm} onClick={() => { void handleChangePassword() }}>
                  {changingPassword ? '...' : t('profile_change_password')}
                </button>
              </div>
            )}
            <div className="profile-links">
              {onReplayTour && <button type="button" className="btn-link" onClick={() => { resetTour(); onReplayTour(); onClose() }}>{t('profile_replay_tour')}</button>}
              {onOpenHelp && <button type="button" className="btn-link" onClick={() => { onOpenHelp(); onClose() }}>{t('profile_help')}</button>}
              <button type="button" className="btn-link" onClick={openRatePage}>{t('profile_rate')}</button>
            </div>

            <div className="profile-history">
              <div className="profile-history-hdr">
                <span>{t('profile_history')}</span>
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>{t('profile_history_count', history.length)}</span>
              </div>
              {history.length === 0 ? (
                <div style={{ color: 'var(--text2)', fontSize: 13, padding: '12px 0' }}>{t('profile_history_empty')}</div>
              ) : (
                <div className="history-list">
                  {history.slice(0, 10).map((h) => (
                    <div key={h.id} className="history-item">
                      <div className="history-url">{h.videoUrl}</div>
                      <div className="history-date">{new Date(h.watchedAt).toLocaleDateString(dateLocale)}</div>
                      <button className="btn-icon danger" onClick={() => onDeleteHistory(h.id)}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {blockedEntries.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="profile-history-hdr">
                  <span>🚫 {t('profile_blocked')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('profile_blocked_count', blockedEntries.length)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {blockedEntries.map(entry => (
                    <div key={entry.uid} className="profile-blocked-row">
                      <div className="profile-blocked-avatar">{entry.displayName.charAt(0).toUpperCase()}</div>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{entry.displayName}</span>
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, opacity: unblockingUid === entry.uid ? 0.5 : 1 }} disabled={unblockingUid === entry.uid} onClick={() => { void handleUnblock(entry.uid) }}>
                        {unblockingUid === entry.uid ? '...' : t('profile_unblock')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onDeleteAccount && (
              <div className="profile-danger-zone">
                <button type="button" className="btn-danger profile-delete-btn" disabled={removingPhoto || deletingAccount} onClick={() => { setDeletePassword(''); setDeleteError(null); setShowDeleteConfirm(true) }}>
                  {t('profile_delete_account')}
                </button>
              </div>
            )}
          </div>
        )}

        <button className="btn-secondary profile-studio-close-btn" disabled={removingPhoto} onClick={onClose}>
          {removingPhoto ? t('profile_wait') : t('profile_close')}
        </button>
      </div>

      {showDeleteConfirm && onDeleteAccount && (
        <div className="modal-overlay modal-overlay--nested" onClick={() => { if (!deletingAccount) setShowDeleteConfirm(false) }}>
          <div className="modal modal--confirm" onClick={(e) => e.stopPropagation()}>
            <h3>{t('profile_delete_title')}</h3>
            <p className="modal-confirm-body">{t('profile_delete_body')}</p>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>{t('profile_delete_password')}</label>
              <input type="password" value={deletePassword} autoComplete="current-password" disabled={deletingAccount} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>
            {deleteError && <p className="profile-photo-error">{deleteError}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" disabled={deletingAccount} onClick={() => setShowDeleteConfirm(false)}>{t('common_cancel')}</button>
              <button className="btn-danger" disabled={deletingAccount || !deletePassword.trim()} onClick={() => {
                void (async () => {
                  setDeletingAccount(true)
                  setDeleteError(null)
                  try {
                    await onDeleteAccount(deletePassword)
                    setShowDeleteConfirm(false)
                    onClose()
                  } catch {
                    setDeleteError(t('profile_delete_failed'))
                  } finally {
                    setDeletingAccount(false)
                  }
                })()
              }}>{deletingAccount ? '...' : t('profile_delete_confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
