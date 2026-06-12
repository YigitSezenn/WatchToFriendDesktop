import React, { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../hooks/useLocale'

interface Props {
  roomTitle: string
  roomId: string
  onlineUids: string[]
  presenceNames: Record<string, string> | undefined
  speakingUids: Set<string>
  myUid?: string
  canControl: boolean
  isHost: boolean
  discoverable: boolean
  inVoice?: boolean
  voiceMuted?: boolean
  voiceListenOnly?: boolean
  videoHidden?: boolean
  chatSearchOpen?: boolean
  chatOpen?: boolean
  onToggleChat?: () => void
  onBack: () => void
  onCopyCode: () => void
  copied: boolean
  onVideoChange: () => void
  onMembers: () => void
  onInvite: () => void
  onTogglePublic: () => void
  onDelete: () => void
  onLeave: () => void
  onResync?: () => void
  onToggleVideoHidden?: () => void
  onToggleChatSearch?: () => void
  onJoinVoice?: () => void
  onLeaveVoice?: () => void
  onToggleVoiceMute?: () => void
  onStartPoll?: () => void
  onOpenQueue?: () => void
  queueCount?: number
  hasVideo?: boolean
  screenSharing?: boolean
}

export default function RoomHeader({
  roomTitle, roomId, onlineUids, presenceNames, speakingUids, myUid,
  canControl, isHost, discoverable,
  inVoice = false, voiceMuted = false, voiceListenOnly = false,
  videoHidden = false, chatSearchOpen = false, chatOpen = true,
  onBack, onCopyCode, copied,
  onVideoChange, onMembers, onInvite, onTogglePublic, onDelete, onLeave,
  onResync, onToggleVideoHidden, onToggleChat, onToggleChatSearch,
  onJoinVoice, onLeaveVoice, onToggleVoiceMute, onStartPoll, onOpenQueue,
  queueCount = 0,
  hasVideo = false, screenSharing = false
}: Props) {
  const { t } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  function closeAnd(fn?: () => void) {
    setMenuOpen(false)
    fn?.()
  }

  return (
    <header className="room-header">
      <button type="button" className="room-header__back" onClick={onBack}>
        ← {t('common_back')}
      </button>

      <div className="room-header__info">
        <span className="room-header__title">{roomTitle}</span>
        <span className="room-header__meta">
          <span className="room-header__online-dot" />
          {t('watch_online_count', onlineUids.length)}
        </span>
        <button type="button" className="room-header__copy" onClick={onCopyCode} title={t('watch_copy_invite')}>
          {copied ? t('watch_invite_copied') : t('watch_invite_link')}
        </button>
      </div>

      <div className="room-header__members">
        {onlineUids.slice(0, 3).map((uid) => {
          const speaking = speakingUids.has(uid)
          const voiceConnected = inVoice && uid === myUid && !voiceMuted && !voiceListenOnly
          const avatarClass = speaking
            ? ' room-header__avatar--speaking'
            : voiceConnected
              ? ' room-header__avatar--voice-connected'
              : ''
          return (
            <span
              key={uid}
              className={`room-header__avatar${avatarClass}`}
              title={(presenceNames?.[uid] ?? uid) + (speaking ? t('watch_speaking_tooltip') : voiceConnected ? t('watch_in_voice_tooltip') : '')}
            >
              {(presenceNames?.[uid] ?? '?')[0]?.toUpperCase()}
            </span>
          )
        })}
        {onlineUids.length > 3 && (
          <span className="room-header__avatar">+{onlineUids.length - 3}</span>
        )}
      </div>

      {onToggleChat && (
        <button
          type="button"
          className="room-header__chat-btn"
          onClick={onToggleChat}
          title={chatOpen ? t('watch_chat_hide') : t('watch_chat_show')}
        >
          {chatOpen ? '◧' : '💬'}
        </button>
      )}

      <div className="room-header__menu-wrap" ref={menuWrapRef}>
        <button
          type="button"
          className="room-header__menu-btn"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="room-header__dropdown" role="menu">
            <button type="button" role="menuitem" onClick={() => closeAnd(inVoice ? onLeaveVoice : onJoinVoice)}>
              {inVoice ? `🔇 ${t('watch_leave_voice')}` : `🎙️ ${t('watch_join_voice')}`}
            </button>
            {inVoice && !voiceListenOnly && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onToggleVoiceMute)}>
                {voiceMuted ? `🔊 ${t('watch_unmute')}` : `🔇 ${t('watch_mute')}`}
              </button>
            )}
            {onOpenQueue && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onOpenQueue)}>
                📋 {queueCount > 0 ? t('watch_queue_count', queueCount) : t('watch_queue')}
              </button>
            )}
            {onResync && hasVideo && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onResync)}>
                🔄 {t('watch_resync')}
              </button>
            )}
            {onToggleVideoHidden && hasVideo && !screenSharing && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onToggleVideoHidden)}>
                {videoHidden ? `📺 ${t('watch_video_show')}` : `📴 ${t('watch_video_hide')}`}
              </button>
            )}
            {canControl && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onVideoChange)}>
                🔗 {t('watch_change_video')}
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => closeAnd(onMembers)}>
              👤 {t('watch_members')}
            </button>
            <button type="button" role="menuitem" onClick={() => closeAnd(onCopyCode)}>
              🔗 {t('watch_copy_invite')}
            </button>
            <button type="button" role="menuitem" onClick={() => closeAnd(onInvite)}>
              👥 {t('watch_invite_friends')}
            </button>
            {onToggleChatSearch && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onToggleChatSearch)}>
                {chatSearchOpen ? `✕ ${t('watch_chat_search_close')}` : `🔍 ${t('watch_chat_search_open')}`}
              </button>
            )}
            {isHost && onStartPoll && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onStartPoll)}>
                📊 {t('watch_start_poll')}
              </button>
            )}
            {isHost && (
              <button type="button" role="menuitem" onClick={() => closeAnd(onTogglePublic)}>
                {discoverable ? t('watch_public_on') : t('watch_public_off')}
              </button>
            )}
            {isHost ? (
              <button type="button" role="menuitem" className="danger" onClick={() => closeAnd(onDelete)}>
                🗑 {t('watch_delete_room')}
              </button>
            ) : (
              <button type="button" role="menuitem" className="danger" onClick={() => closeAnd(onLeave)}>
                🚪 {t('watch_leave_room')}
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
