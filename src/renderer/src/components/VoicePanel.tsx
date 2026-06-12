import React, { useEffect, useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import SourcePickerModal from './SourcePickerModal'
import { VoicePeer, MIC_GAIN_MAX } from '../hooks/useVoiceChat'
import { photoSrc } from '../utils/photo'

interface Props {
  sharingScreen: boolean
  onToggleScreen: () => void
  onStartSharing: (sourceId?: string) => void
  onStopSharing: () => void
  qualityPreset?: 'low' | 'medium' | 'high'
  onSetQuality?: (q: 'low' | 'medium' | 'high') => void
  // Sesli sohbet
  inVoice: boolean
  isJoining?: boolean
  voiceError?: string | null
  muted: boolean
  listenOnly?: boolean
  speakingUids: Set<string>
  voicePeersList?: VoicePeer[]
  myUid: string
  onJoinVoice: () => void
  onLeaveVoice: () => void
  onToggleMute: () => void
  onToggleDeafen?: () => void
  onEnableMicrophone?: () => void
  pushToTalk?: boolean
  pttActive?: boolean
  deafened?: boolean
  onSetPushToTalk?: (enabled: boolean) => void
  onSetPttActive?: (active: boolean) => void
  onOverlayChange?: (open: boolean) => void
  peerVolumes?: Record<string, number>
  peerLocalMuted?: Set<string>
  onSetPeerVolume?: (uid: string, level: number) => void
  onTogglePeerLocalMute?: (uid: string) => void
  micGain?: number
  speakRmsThreshold?: number
  localMicLevel?: number
  onSetSpeakRmsThreshold?: (rms: number) => void
  presenceNames?: Record<string, string>
  peerPhotos?: Record<string, string>
}

export default function VoicePanel({
  sharingScreen, onToggleScreen, onStartSharing, onStopSharing,
  qualityPreset = 'high', onSetQuality,
  inVoice, isJoining = false, voiceError,
  muted, listenOnly = false, speakingUids, voicePeersList = [], myUid,
  onJoinVoice, onLeaveVoice, onToggleMute, onToggleDeafen, onEnableMicrophone,
  pushToTalk = false, pttActive = false, deafened = false,
  onSetPushToTalk, onSetPttActive, onOverlayChange,
  peerVolumes = {}, peerLocalMuted = new Set(),
  onSetPeerVolume, onTogglePeerLocalMute,
  micGain = 1, speakRmsThreshold = 6, localMicLevel = 0, onSetSpeakRmsThreshold,
  presenceNames = {}, peerPhotos = {}
}: Props) {
  const { t } = useLocale()
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    onOverlayChange?.(showPicker)
    return () => onOverlayChange?.(false)
  }, [showPicker, onOverlayChange])
  const isElectron = !!(window as any).electronAPI
  const iAmSpeaking = speakingUids.has(myUid)

  function handleScreenBtnClick() {
    if (sharingScreen) { onStopSharing(); return }
    if (isElectron) setShowPicker(true)
    else onStartSharing()
  }

  return (
    <>
      <div className="voice-panel">
        <div className="voice-controls">

          {/* ── Sesli Sohbet butonu ── */}
          {!inVoice ? (
            <button
              className="voice-btn"
              onClick={onJoinVoice}
              disabled={isJoining}
              title={isJoining ? t('common_connecting') : `${t('watch_join_voice')} [V]`}
            >
              <span className="voice-btn-icon">{isJoining ? '⏳' : '🎙️'}</span>
              <span className="voice-btn-label">{isJoining ? t('common_connecting') : t('watch_voice_chat')}</span>
              {!isJoining && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 4 }}>V</span>}
            </button>
          ) : (
            <>
              <div className="discord-voice-bar">
                <button
                  type="button"
                  className={`discord-voice-bar__btn ${muted ? 'discord-voice-bar__btn--danger' : ''}`}
                  onClick={onToggleMute}
                  disabled={listenOnly || deafened}
                  title={muted ? `${t('watch_unmute')} [M]` : `${t('watch_mute')} [M]`}
                >
                  {muted ? '🔇' : '🎙️'}
                </button>
                <button
                  type="button"
                  className={`discord-voice-bar__btn ${deafened ? 'discord-voice-bar__btn--danger' : ''}`}
                  onClick={onToggleDeafen}
                  title={deafened ? `${t('watch_undeafen')} [D]` : `${t('watch_deafen')} [D]`}
                >
                  {deafened ? '🔇🎧' : '🎧'}
                </button>
                <button
                  type="button"
                  className={`discord-voice-bar__btn ${pushToTalk ? 'discord-voice-bar__btn--active' : ''}`}
                  onClick={() => onSetPushToTalk?.(!pushToTalk)}
                  title={t('watch_ptt_mode')}
                >
                  PTT
                </button>
                {pushToTalk && !listenOnly && (
                  <button
                    type="button"
                    className={`discord-voice-bar__ptt ${pttActive ? 'discord-voice-bar__ptt--active' : ''}`}
                    onMouseDown={() => onSetPttActive?.(true)}
                    onMouseUp={() => onSetPttActive?.(false)}
                    onMouseLeave={() => onSetPttActive?.(false)}
                    title={t('watch_ptt_hold')}
                  >
                    {pttActive ? t('watch_ptt_speaking') : t('watch_ptt_hold')}
                  </button>
                )}
                <button
                  type="button"
                  className="discord-voice-bar__btn discord-voice-bar__btn--leave"
                  onClick={onLeaveVoice}
                  title={`${t('watch_leave_voice_channel')} [V]`}
                >
                  📴
                </button>
              </div>
              {/* Mikrofon sustur/aç (sadece listen-only değilse) */}
              {listenOnly ? (
                <button
                  className="voice-btn"
                  onClick={onEnableMicrophone}
                  disabled={!onEnableMicrophone}
                  title={onEnableMicrophone ? t('watch_enable_mic') : t('watch_no_mic_listen')}
                  style={{ background: 'rgba(100,100,100,0.15)', borderColor: 'rgba(100,100,100,0.4)' }}
                >
                  <span className="voice-btn-icon">🎧</span>
                  <span className="voice-btn-label" style={{ color: '#9ca3af' }}>{t('watch_listen_only')}</span>
                </button>
              ) : (
                <div
                  className="voice-btn screen-active"
                  style={{
                    background: muted || deafened
                      ? 'rgba(239,68,68,0.12)'
                      : iAmSpeaking
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(139,92,246,0.12)',
                    borderColor: muted || deafened
                      ? 'rgba(239,68,68,0.4)'
                      : iAmSpeaking
                      ? 'rgba(34,197,94,0.5)'
                      : 'rgba(139,92,246,0.4)',
                    cursor: 'default'
                  }}
                >
                  <span className="voice-btn-icon">{deafened ? '🔇🎧' : muted ? '🔇' : '🎙️'}</span>
                  <span className="voice-btn-label" style={{ color: muted || deafened ? '#fca5a5' : iAmSpeaking ? '#86efac' : undefined }}>
                    {deafened ? t('watch_deafened') : muted ? t('watch_muted_label') : iAmSpeaking ? t('watch_speaking') : t('watch_in_voice')}
                  </span>
                  {!muted && !deafened && <span className="live-dot" style={{ background: iAmSpeaking ? '#3BA55D' : 'var(--accent)' }} />}
                </div>
              )}
            </>
          )}

          {/* ── Ekran Paylaşımı butonu + kalite seçici ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className={`voice-btn ${sharingScreen ? 'screen-active' : ''}`}
              onClick={handleScreenBtnClick}
              title={sharingScreen ? t('watch_screen_stop') : t('watch_screen_share')}
            >
              <span className="voice-btn-icon">{sharingScreen ? '🖥️' : '📺'}</span>
              <span className="voice-btn-label">{sharingScreen ? t('watch_screen_sharing') : t('watch_screen_share')}</span>
              {sharingScreen && <span className="live-dot" />}
            </button>
            {!sharingScreen && onSetQuality && (
              <select
                value={qualityPreset}
                onChange={e => onSetQuality(e.target.value as 'low' | 'medium' | 'high')}
                title={t('watch_screen_quality')}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6, color: 'var(--text2)', fontSize: 10, padding: '3px 4px',
                  cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="low">480p</option>
                <option value="medium">720p</option>
                <option value="high">1080p</option>
              </select>
            )}
          </div>
        </div>

        {/* Hata mesajı */}
        {voiceError && (
          <div style={{ fontSize: 11, color: '#fca5a5', paddingTop: 4, lineHeight: 1.4 }}>
            ⚠️ {voiceError}
          </div>
        )}

        {/* Ses kanalı katılımcıları */}
        {voicePeersList.length > 0 && (
          <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              {t('watch_voice_channel_title', voicePeersList.length)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {voicePeersList.map(peer => {
                const speaking = speakingUids.has(peer.uid)
                const voiceConnected = peer.uid === myUid && inVoice && !listenOnly && !muted
                const avatarClass = speaking
                  ? 'voice-peer-avatar--speaking'
                  : voiceConnected
                    ? 'voice-peer-avatar--connected'
                    : ''
                const peerName = peer.displayName && peer.displayName !== t('common_user')
                  ? peer.displayName
                  : (presenceNames[peer.uid] ?? peer.displayName ?? t('common_user'))
                const peerPhoto = photoSrc(peer.photoBase64)
                  ?? photoSrc(peerPhotos[peer.uid])
                  ?? null
                const label = peer.uid === myUid
                  ? `${peerName}${t('common_you_suffix')}`
                  : peerName
                return (
                  <div key={peer.uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div
                      className={avatarClass}
                      style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: speaking ? 'rgba(59,165,93,0.25)' : 'rgba(139,92,246,0.18)',
                      border: speaking || voiceConnected ? undefined : '2px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: speaking ? '#4ade80' : 'var(--text2)',
                      position: 'relative', transition: 'all 0.2s', overflow: 'hidden'
                    }}>
                      {peerPhoto
                        ? <img src={peerPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : peerName.charAt(0).toUpperCase()}
                      {(peer.muted || peer.listenOnly) && (
                        <div style={{
                          position: 'absolute', bottom: -2, right: -2,
                          width: 14, height: 14, borderRadius: '50%',
                          background: peer.listenOnly ? '#6b7280' : '#ef4444',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 8
                        }}>
                          {peer.listenOnly ? '🎧' : '🔇'}
                        </div>
                      )}
                      {/* Bağlantı durumu göstergesi */}
                      {(peer.connectionState === 'connecting' || peer.connectionState === 'reconnecting') && (
                        <div title={peer.connectionState === 'reconnecting' ? t('watch_reconnecting') : t('common_connecting')} style={{
                          position: 'absolute', top: -2, right: -2,
                          width: 8, height: 8, borderRadius: '50%',
                          background: peer.connectionState === 'reconnecting' ? '#f59e0b' : '#60a5fa',
                          border: '1px solid rgba(0,0,0,0.3)'
                        }} />
                      )}
                    </div>
                    <span
                      title={label}
                      style={{ fontSize: 10, color: speaking ? '#4ade80' : 'var(--text2)', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {label}
                    </span>
                    {onSetPeerVolume && onTogglePeerLocalMute && (
                      <div
                        className="voice-peer-volume"
                        title={peer.uid === myUid ? t('watch_mic_output_level') : t('watch_local_only')}
                      >
                        <button
                          type="button"
                          className="voice-peer-volume__mute"
                          onClick={() => onTogglePeerLocalMute(peer.uid)}
                          title={
                            peer.uid === myUid
                              ? (micGain < 0.01 ? t('watch_unmute') : t('watch_lower_mic'))
                              : (peerLocalMuted.has(peer.uid) ? t('watch_unmute_audio') : t('watch_mute_local'))
                          }
                        >
                          {(peer.uid === myUid ? micGain < 0.01 : peerLocalMuted.has(peer.uid)) ? '🔇' : (peer.uid === myUid ? '🎙️' : '🔉')}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(
                            peer.uid === myUid
                              ? (micGain < 0.01 ? 0 : (micGain / MIC_GAIN_MAX) * 100)
                              : ((peerLocalMuted.has(peer.uid) ? 0 : (peerVolumes[peer.uid] ?? 1)) * 100)
                          )}
                          disabled={peer.uid !== myUid && peerLocalMuted.has(peer.uid)}
                          onChange={e => onSetPeerVolume(peer.uid, Number(e.target.value) / 100)}
                          className="voice-peer-volume__slider"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {inVoice && !listenOnly && (
              <div className="voice-mic-level">
                <div className="voice-mic-level__label">
                  <span>🎙️ {t('watch_mic_level')}</span>
                  <span className={localMicLevel > 0.1 ? 'voice-mic-level__active' : ''}>
                    {localMicLevel > 0.1 ? t('watch_audio_detected') : t('watch_try_speak')}
                  </span>
                </div>
                <div className="voice-mic-level__track">
                  <div
                    className="voice-mic-level__fill"
                    style={{ width: `${Math.max(2, Math.round(localMicLevel * 100))}%` }}
                  />
                </div>
              </div>
            )}
            {inVoice && onSetSpeakRmsThreshold && (
              <div className="voice-threshold">
                <div className="voice-threshold__label">
                  <span>{t('watch_speak_threshold')}</span>
                  <span className="voice-threshold__hint">{t('watch_sensitive')} ← → {t('watch_less_sensitive')}</span>
                </div>
                <p className="voice-threshold__tip">{t('watch_mic_gain_hint')}</p>
                <input
                  type="range"
                  min={2}
                  max={25}
                  step={1}
                  value={Math.round(speakRmsThreshold)}
                  onChange={e => onSetSpeakRmsThreshold(Number(e.target.value))}
                  className="voice-threshold__slider"
                  title={t('watch_threshold_slider_title')}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showPicker && (
        <SourcePickerModal
          onSelect={(sourceId) => { setShowPicker(false); onStartSharing(sourceId) }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </>
  )
}
