import React, { useState, useRef, useEffect, useMemo } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { photoSrc } from '../utils/photo'
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
  onDeleteHistory: (id: string) => void
  onUnblockUser: (uid: string) => Promise<void>
  onDeleteAccount?: (password: string) => Promise<void>
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>
  onReplayTour?: () => void
  onOpenHelp?: () => void
  onClose: () => void
}

export default function ProfileModal({
  user, history, onUpdateName, onUpdatePhoto, onRemovePhoto, onDeleteHistory, onUnblockUser,
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [blockedEntries, setBlockedEntries] = useState<BlockedEntry[]>([])
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
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

  async function handleRemovePhoto() {
    if (!photoSrc(user.photoBase64) || removingPhoto) return
    setRemovingPhoto(true)
    try {
      await onRemovePhoto()
    } finally {
      setRemovingPhoto(false)
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || uploadingPhoto || removingPhoto) return
    setPhotoError(null)
    setUploadingPhoto(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error(t('profile_photo_read_error')))
        reader.readAsDataURL(file)
      })
      await onUpdatePhoto(dataUrl)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : t('profile_photo_upload_error'))
    } finally {
      setUploadingPhoto(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function copyFriendCode() {
    if (user.friendCode) navigator.clipboard.writeText(user.friendCode)
  }

  async function handleChangePassword() {
    if (!onChangePassword) return
    setPasswordMsg(null)
    setPasswordError(null)
    if (newPassword.length < 6) {
      setPasswordError(t('profile_password_min'))
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError(t('profile_password_mismatch'))
      return
    }
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

  return (
    <div className="modal-overlay" onClick={() => { if (!removingPhoto) onClose() }}>
      <div className={`modal profile-modal${removingPhoto ? ' is-busy' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <div className="profile-avatar-col">
            <div
              className={`profile-avatar-wrap${removingPhoto || uploadingPhoto ? ' is-loading' : ''}`}
              onClick={() => { if (!removingPhoto && !uploadingPhoto) fileRef.current?.click() }}
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
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            {photoError && (
              <p className="profile-photo-error">{photoError}</p>
            )}
            {(hasPhoto || removingPhoto) && (
              <button
                type="button"
                className="profile-remove-btn"
                disabled={removingPhoto}
                onClick={handleRemovePhoto}
              >
                {removingPhoto ? (
                  <>
                    <span className="profile-remove-spinner" />
                    {t('profile_removing')}
                  </>
                ) : (
                  <>
                    <span className="profile-remove-icon" aria-hidden>🗑</span>
                    {t('profile_remove_photo')}
                  </>
                )}
              </button>
            )}
          </div>

          <div className="profile-info">
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label>{t('profile_display_name')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                />
                <button className="btn-primary" onClick={handleSaveName} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
                  {saved ? '✓' : saving ? '...' : t('profile_save')}
                </button>
              </div>
            </div>
            <div className="profile-email">{user.email}</div>
            {user.friendCode && (
              <div className="friend-code-row" onClick={copyFriendCode} title={t('profile_copy')}>
                <span className="friend-code-label">{t('profile_friend_id')}</span>
                <span className="friend-code-value">#{user.friendCode}</span>
                <span className="friend-code-copy">📋</span>
              </div>
            )}
            {appVersion && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
                {t('profile_version', appVersion)}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: 4 }}>
                {t('profile_theme')}
              </div>
              <div className="theme-chips">
                {THEME_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    className={`theme-chip${themeMode === value ? ' active' : ''}`}
                    onClick={() => setThemeMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: 4 }}>
                {t('profile_language')}
              </div>
              <div className="theme-chips">
                {LANG_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    className={`theme-chip${localePref === value ? ' active' : ''}`}
                    onClick={() => setLocale(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {onChangePassword && (
              <div className="profile-password-section">
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: 8 }}>
                  {t('profile_change_password')}
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_current_password')}</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    disabled={changingPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_new_password')}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    disabled={changingPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>{t('profile_new_password_confirm')}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPasswordConfirm}
                    disabled={changingPassword}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  />
                </div>
                {passwordError && <p className="profile-photo-error">{passwordError}</p>}
                {passwordMsg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{passwordMsg}</p>}
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: '100%' }}
                  disabled={changingPassword || !currentPassword || !newPassword || !newPasswordConfirm}
                  onClick={() => { void handleChangePassword() }}
                >
                  {changingPassword ? '...' : t('profile_change_password')}
                </button>
              </div>
            )}
            <div className="profile-links" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              {onReplayTour && (
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 12 }}
                  onClick={() => { resetTour(); onReplayTour(); onClose() }}
                >
                  {t('profile_replay_tour')}
                </button>
              )}
              {onOpenHelp && (
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 12 }}
                  onClick={() => { onOpenHelp(); onClose() }}
                >
                  {t('profile_help')}
                </button>
              )}
              <button
                type="button"
                className="btn-link"
                style={{ fontSize: 12 }}
                onClick={openRatePage}
              >
                {t('profile_rate')}
              </button>
            </div>
          </div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>
                🚫 {t('profile_blocked')}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{t('profile_blocked_count', blockedEntries.length)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {blockedEntries.map(entry => (
                <div key={entry.uid} className="profile-blocked-row">
                  <div className="profile-blocked-avatar">
                    {entry.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{entry.displayName}</span>
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 11, opacity: unblockingUid === entry.uid ? 0.5 : 1 }}
                    disabled={unblockingUid === entry.uid}
                    onClick={() => handleUnblock(entry.uid)}
                  >
                    {unblockingUid === entry.uid ? '...' : t('profile_unblock')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {onDeleteAccount && (
          <div className="profile-danger-zone">
            <button
              type="button"
              className="btn-danger profile-delete-btn"
              disabled={removingPhoto || deletingAccount}
              onClick={() => {
                setDeletePassword('')
                setDeleteError(null)
                setShowDeleteConfirm(true)
              }}
            >
              {t('profile_delete_account')}
            </button>
          </div>
        )}

        <button
          className="btn-secondary"
          style={{ width: '100%', marginTop: 16 }}
          disabled={removingPhoto}
          onClick={onClose}
        >
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
              <input
                type="password"
                value={deletePassword}
                autoComplete="current-password"
                disabled={deletingAccount}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deletePassword.trim()) {
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
                  }
                }}
              />
            </div>
            {deleteError && <p className="profile-photo-error">{deleteError}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" disabled={deletingAccount} onClick={() => setShowDeleteConfirm(false)}>
                {t('common_cancel')}
              </button>
              <button
                className="btn-danger"
                disabled={deletingAccount || !deletePassword.trim()}
                onClick={() => {
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
                }}
              >
                {deletingAccount ? '...' : t('profile_delete_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
