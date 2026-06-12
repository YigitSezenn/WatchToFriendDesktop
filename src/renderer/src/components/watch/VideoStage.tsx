import React, { RefObject } from 'react'
import { useLocale } from '../../hooks/useLocale'

interface ScreenShareImageProps {
  imgRef: React.MutableRefObject<HTMLImageElement | null>
  label: string
}

function ScreenShareImage({ imgRef, label }: ScreenShareImageProps) {
  return (
    <div className="video-stage__share">
      <div className="video-stage__share-spinner">
        <div className="spinner" />
        <p>{label}</p>
      </div>
      <img
        ref={imgRef}
        alt={label}
        className="video-stage__share-img"
        onLoad={(e) => {
          const spinner = (e.currentTarget.previousElementSibling as HTMLElement | null)
          if (spinner) spinner.style.display = 'none'
        }}
      />
      <span className="video-stage__share-label">📺 {label}</span>
    </div>
  )
}

function ScreenShareVideo({ stream, label }: { stream: MediaStream; label: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)

  React.useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    el.play().catch(() => {})
  }, [stream])

  return (
    <div className="video-stage__share">
      <video ref={videoRef} className="video-stage__share-img" autoPlay playsInline muted />
      <span className="video-stage__share-label">📺 {label}</span>
    </div>
  )
}

export interface VideoStageProps {
  areaRef: RefObject<HTMLDivElement | null>
  iframeRef: RefObject<HTMLIFrameElement | null>
  sharingScreen: boolean
  screenTrackMuted: boolean
  remoteImgRef: React.MutableRefObject<HTMLImageElement | null>
  remoteStream: MediaStream | null
  someoneElseSharing: boolean
  screenConnecting: boolean
  sharerName: string
  videoUrl: string
  youtubeId: string | null
  videoVersion: number
  canControl: boolean
  canAddVideo: boolean
  onAddVideo: () => void
  floatingReaction: { emoji: string; key: number } | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onIframeLoad?: () => void
  videoHidden?: boolean
  onShowVideo?: () => void
  ytError?: string | null
  onDismissYtError?: () => void
  playerPosSec?: number
  playerDurSec?: number
  syncDriftSec?: number
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function VideoStage({
  areaRef, iframeRef, sharingScreen, screenTrackMuted,
  remoteImgRef, remoteStream, someoneElseSharing, screenConnecting,
  sharerName, videoUrl, youtubeId, videoVersion, canControl, canAddVideo, onAddVideo,
  floatingReaction, isFullscreen, onToggleFullscreen, onIframeLoad,
  videoHidden = false, onShowVideo, ytError, onDismissYtError,
  playerPosSec = 0, playerDurSec = 0, syncDriftSec = 0
}: VideoStageProps) {
  const { t } = useLocale()
  const showProgress = playerDurSec > 1 && !videoHidden && !sharingScreen && !someoneElseSharing && !!videoUrl
  const progressFrac = showProgress ? Math.min(1, Math.max(0, playerPosSec / playerDurSec)) : 0
  const driftColor = syncDriftSec < 1.5 ? '#22c55e' : syncDriftSec < 3 ? '#f59e0b' : '#ef4444'
  const ytSrc = youtubeId
    ? `http://127.0.0.1:7842/yt?v=${youtubeId}&autoplay=1&start=0&ctrl=${canControl ? 1 : 0}&rv=${videoVersion}`
    : null

  let content: React.ReactNode

  if (videoHidden && !sharingScreen && !someoneElseSharing) {
    content = (
      <div className="video-stage__hidden">
        <p>{t('watch_video_hidden_audio')}</p>
        {onShowVideo && (
          <button type="button" className="btn-secondary" onClick={onShowVideo}>{t('watch_video_show')}</button>
        )}
      </div>
    )
  } else if (sharingScreen) {
    content = (
      <div className="video-stage__webrtc">
        <div className="video-stage__webrtc-icon">🖥️</div>
        <p className="video-stage__webrtc-title">{t('watch_screen_sharing_you')}</p>
        <p className="video-stage__webrtc-sub">{t('watch_screen_viewers_see')}</p>
        {screenTrackMuted && (
          <p className="video-stage__warn">{t('watch_screen_capture_warn')}</p>
        )}
      </div>
    )
  } else if (someoneElseSharing) {
    content = remoteStream
      ? <ScreenShareVideo stream={remoteStream} label={t('watch_screen_of', sharerName)} />
      : <ScreenShareImage imgRef={remoteImgRef} label={screenConnecting ? t('watch_screen_sharing_name', sharerName) : t('watch_screen_of', sharerName)} />
  } else if (!videoUrl) {
    content = (
      <div className="video-stage__empty">
        <div className="video-stage__empty-icon">🎬</div>
        <p>{t('watch_no_video')}</p>
        {canAddVideo && (
          <button type="button" className="btn-primary" onClick={onAddVideo}>{t('watch_add_video')}</button>
        )}
      </div>
    )
  } else if (ytSrc) {
    content = (
      <iframe
        ref={iframeRef}
        key={`yt-${youtubeId}-${videoVersion}`}
        className="video-stage__iframe"
        src={ytSrc}
        title={t('watch_yt_player')}
        allow="autoplay; encrypted-media; fullscreen"
        onLoad={onIframeLoad}
      />
    )
  } else {
    content = (
      <iframe
        ref={iframeRef}
        className="video-stage__iframe"
        src={videoUrl}
        title={t('watch_video_player')}
        allow="autoplay; encrypted-media; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={onIframeLoad}
      />
    )
  }

  return (
    <section className="video-stage" ref={areaRef}>
      <div className="video-stage__player">
        {content}
        {ytError && (
          <div className="video-stage__yt-error" role="alert">
            <strong>{t('watch_video_error')}</strong>
            <p>{ytError}</p>
            <div className="video-stage__yt-error-actions">
              {youtubeId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${youtubeId}`, '_blank')}
                >
                  {t('watch_yt_open_external')}
                </button>
              )}
              {onDismissYtError && (
                <button type="button" className="btn-link" onClick={onDismissYtError}>{t('common_close')}</button>
              )}
            </div>
          </div>
        )}
      </div>
      {showProgress && (
        <div className="video-stage__progress">
          <div className="video-stage__progress-track">
            <div className="video-stage__progress-fill" style={{ width: `${progressFrac * 100}%` }} />
          </div>
          <div className="video-stage__progress-meta">
            <span>{formatClock(playerPosSec)} / {formatClock(playerDurSec)}</span>
            <span style={{ color: driftColor }}>{t('watch_sync_drift', syncDriftSec.toFixed(1))}</span>
          </div>
        </div>
      )}
      <div className="video-stage__bar">
        {floatingReaction && (
          <span key={floatingReaction.key} className="video-stage__reaction">
            {floatingReaction.emoji}
          </span>
        )}
        <button
          type="button"
          className="video-stage__fullscreen"
          onClick={onToggleFullscreen}
          title={isFullscreen ? t('watch_collapse') : t('watch_expand')}
        >
          {isFullscreen ? '🗗' : '⛶'}
        </button>
      </div>
    </section>
  )
}
