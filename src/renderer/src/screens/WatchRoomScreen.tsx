import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import ChatPanel from '../components/ChatPanel'
import VoicePanel from '../components/VoicePanel'
import RoomHeader from '../components/watch/RoomHeader'
import VideoStage from '../components/watch/VideoStage'
import PollPanel from '../components/watch/PollPanel'
import QueueModal from '../components/watch/QueueModal'
import VideoChangeModal from '../components/watch/VideoChangeModal'
import type { QueueItem, YtSearchResult } from '../types'
import { useScreenShare } from '../hooks/useScreenShare'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { hideYtBrowserViewNow } from '../hooks/useYtBrowserView'
import { photoSrc } from '../utils/photo'
import { buildInviteMessage } from '../utils/inviteLink'
import { useLocale } from '../hooks/useLocale'
import { showToast } from '../utils/toast'
import { youtubeErrorMessage } from '../utils/ytError'
import type { Room, User, Message } from '../types'

interface YtEvent {
  type: string
  state?: number
  time?: number
  current?: number
  duration?: number
  code?: number
}

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '😢']

const CHAT_WIDTH_MIN = 240
const CHAT_WIDTH_MAX = 520
const CHAT_WIDTH_DEFAULT = 300

function loadChatLayout() {
  try {
    const w = parseInt(localStorage.getItem('wtf_chat_width') ?? '', 10)
    const open = localStorage.getItem('wtf_chat_open') !== '0'
    return {
      width: Number.isFinite(w)
        ? Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, w))
        : CHAT_WIDTH_DEFAULT,
      open
    }
  } catch {
    return { width: CHAT_WIDTH_DEFAULT, open: true }
  }
}

interface Props {
  roomId: string
  currentUser: User
  room: Room
  messages: Message[]
  friends: User[]
  isHost: boolean
  onSendMessage: (text: string) => void
  onUpdateVideo: (isPlaying: boolean, positionMs: number) => void
  onUpdateVideoUrl: (url: string) => void
  onSetTyping: () => void
  onSetPresence: () => void
  onClearPresence: () => void
  onSendReaction: (emoji: string) => void
  onInviteFriend: (friendUid: string) => void
  onTogglePublic: (discoverable: boolean) => void
  onDeleteRoom: () => void
  onLeaveRoom: () => void
  onBlockUser: (uid: string) => Promise<void>
  onCreatePoll: (question: string, options: string[]) => void | Promise<void>
  onVotePoll: (optionIndex: number) => void | Promise<void>
  onClearPoll: () => void | Promise<void>
  onAddUrlToQueue: (url: string) => void | Promise<void>
  onAddSearchToQueue: (r: YtSearchResult) => void | Promise<void>
  onPlayQueueItem: (item: QueueItem) => void | Promise<void>
  onRemoveQueueItem: (item: QueueItem) => void | Promise<void>
  onAdvanceQueue: () => void | Promise<void>
  onToggleReaction: (msgId: string, emoji: string) => void | Promise<void>
  onSetModerator: (uid: string, make: boolean) => void | Promise<void>
  onTransferHost: (uid: string) => void | Promise<void>
  onBack: () => void
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export default function WatchRoomScreen({
  roomId, currentUser, room, messages, friends, isHost, onBlockUser,
  onSendMessage, onUpdateVideo, onUpdateVideoUrl, onSetTyping,
  onSetPresence, onClearPresence, onSendReaction,
  onInviteFriend, onTogglePublic, onDeleteRoom, onLeaveRoom,
  onCreatePoll, onVotePoll, onClearPoll,
  onAddUrlToQueue, onAddSearchToQueue, onPlayQueueItem, onRemoveQueueItem, onAdvanceQueue,
  onToggleReaction, onSetModerator, onTransferHost,
  onBack
}: Props) {
  const { t, dateLocale } = useLocale()
  const [liveRoom, setLiveRoom] = useState<Room>(room)
  const [showInvite, setShowInvite] = useState(false)
  const [showUrlChange, setShowUrlChange] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [floatingReaction, setFloatingReaction] = useState<{emoji:string,key:number}|null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [blockingUid, setBlockingUid] = useState<string | null>(null)
  const chatLayoutInit = useMemo(() => loadChatLayout(), [])
  const [chatOpen, setChatOpen] = useState(chatLayoutInit.open)
  const [chatWidth, setChatWidth] = useState(chatLayoutInit.width)
  const chatWidthRef = useRef(chatLayoutInit.width)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ytPlayerReady, setYtPlayerReady] = useState(false)
  const hostAutoStartedRef = useRef(false)

  // ── Zamanlama geri sayımı ──────────────────────────────────────────
  const [scheduleCountdown, setScheduleCountdown] = useState<number | null>(null) // ms
  useEffect(() => {
    const scheduled = liveRoom.scheduledAt ?? 0
    if (scheduled <= 0) { setScheduleCountdown(null); return }
    function tick() {
      const diff = scheduled - Date.now()
      setScheduleCountdown(diff > 0 ? diff : 0)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [liveRoom.scheduledAt])
  const videoAreaRef = useRef<HTMLDivElement>(null)
  const prevVideoVersionRef = useRef(room.videoVersion)
  const presenceInterval = useRef<ReturnType<typeof setInterval>>()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [videoHidden, setVideoHidden] = useState(false)
  const [ytError, setYtError] = useState<string | null>(null)
  const [showChatSearch, setShowChatSearch] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [showPollDialog, setShowPollDialog] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptA, setPollOptA] = useState('')
  const [pollOptB, setPollOptB] = useState('')
  const [pollOptC, setPollOptC] = useState('')
  const [pollOptD, setPollOptD] = useState('')
  const [playerPosSec, setPlayerPosSec] = useState(0)
  const [playerDurSec, setPlayerDurSec] = useState(0)
  const [driftTick, setDriftTick] = useState(0)
  const [showQueue, setShowQueue] = useState(false)
  const endedHandledRef = useRef(false)

  // useMemo: liveRoom.moderators değişmediğinde yeniden hesaplama yapılmaz
  const isModerator = useMemo(
    () => liveRoom.moderators?.includes(currentUser.uid) ?? false,
    [liveRoom.moderators, currentUser.uid]
  )
  const canControl = useMemo(
    () => isHost || isModerator,
    [isHost, isModerator]
  )

  const {
    sharing: sharingScreen,
    remoteImgRef,
    remoteStream,
    sharerUid,
    someoneElseSharing,
    connecting: screenConnecting,
    toggleScreen,
    startSharing,
    stopSharing,
    qualityPreset,
    trackMuted: screenTrackMuted,
    setQuality
  } = useScreenShare(roomId, currentUser.uid)

  const {
    inVoice,
    isJoining: voiceJoining,
    voiceError,
    muted,
    listenOnly: voiceListenOnly,
    speakingUids,
    voicePeersList,
    voiceEvents,
    peerVolumes,
    peerLocalMuted,
    joinVoice,
    leaveVoice,
    toggleMute,
    enableMicrophone,
    setPeerVolume,
    togglePeerLocalMute,
    micGain,
    speakRmsThreshold,
    setSpeakRmsThreshold,
    localMicLevel,
    deafened: voiceDeafened,
    pushToTalk: voicePushToTalk,
    pttActive: voicePttActive,
    toggleDeafen,
    setPushToTalk,
    setPttActive
  } = useVoiceChat(roomId, currentUser.uid, currentUser.displayName, currentUser.photoBase64)

  const voicePeerPhotos = useMemo(() => {
    const map: Record<string, string> = {}
    if (currentUser.photoBase64) map[currentUser.uid] = currentUser.photoBase64
    friends.forEach(f => {
      if (f.photoBase64) map[f.uid] = f.photoBase64
    })
    return map
  }, [currentUser.uid, currentUser.photoBase64, friends])

  // Odadan çıkarken ses kanalından da ayrıl
  const exitRoom = useCallback(async (action: () => void | Promise<void>) => {
    if (inVoice) await leaveVoice()
    await action()
  }, [inVoice, leaveVoice])

  const [voiceToasts, setVoiceToasts] = useState<{ id: number; msg: string; type: 'joined' | 'left' }[]>([])
  const toastCounter = useRef(0)

  useEffect(() => {
    if (voiceEvents.length === 0) return
    const last = voiceEvents[voiceEvents.length - 1]
    const id = ++toastCounter.current
    const msg = last.type === 'joined'
      ? t('watch_voice_joined', last.displayName)
      : t('watch_voice_left', last.displayName)
    setVoiceToasts(prev => [...prev, { id, msg, type: last.type }])
    setTimeout(() => setVoiceToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [voiceEvents, t])


  // Klavye kısayolları: M sustur, D sağırlaştır, V katıl/ayrıl, P bas-konuş
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === 'm' || e.key === 'M') {
        if (inVoice && !voiceListenOnly) { toggleMute(); e.preventDefault() }
      } else if (e.key === 'd' || e.key === 'D') {
        if (inVoice) { toggleDeafen(); e.preventDefault() }
      } else if (e.key === 'v' || e.key === 'V') {
        if (inVoice) leaveVoice(); else joinVoice()
        e.preventDefault()
      } else if ((e.key === 'p' || e.key === 'P') && voicePushToTalk && inVoice && !voiceListenOnly) {
        setPttActive(true); e.preventDefault()
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'p' || e.key === 'P') setPttActive(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [inVoice, voiceListenOnly, voicePushToTalk, toggleMute, toggleDeafen, joinVoice, leaveVoice, setPttActive])

  // Oda gerçek zamanlı dinle — silinirse ana ekrana dön
  useEffect(() => {
    return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (snap.exists()) {
        setLiveRoom({ id: snap.id, ...snap.data() } as Room)
      } else {
        // Host odayı sildi
        showToast(t('toast_room_deleted'), 'info')
        exitRoom(onBack)
      }
    })
  }, [roomId, exitRoom, onBack, t])

  const postYtCmdIframe = useCallback((cmd: 'play' | 'pause' | 'seek', posSec: number) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage({ cmd, pos: posSec }, '*')
  }, [])

  const postYtCmd = useCallback((cmd: 'play' | 'pause' | 'seek', posSec: number) => {
    postYtCmdIframe(cmd, posSec)
  }, [postYtCmdIframe])

  const applyYtSync = useCallback(() => {
    const playing = liveRoom.isPlaying
    // Oynatıcı hazır değilken pause gönderme — iframe kuyruğa alır ve autoplay'i öldürür
    if (!playing && !ytPlayerReady) return
    const elapsed = playing
      ? Math.max(0, Date.now() - liveRoom.updatedAt)
      : 0
    const pos = (liveRoom.currentPositionMs + elapsed) / 1000
    postYtCmd(playing ? 'play' : 'pause', pos)
  }, [liveRoom.isPlaying, liveRoom.currentPositionMs, liveRoom.updatedAt, postYtCmd, ytPlayerReady])

  useEffect(() => {
    setYtError(null)
    setPlayerPosSec(0)
    setPlayerDurSec(0)
    endedHandledRef.current = false
  }, [liveRoom.videoUrl, liveRoom.videoVersion])

  // videoVersion değişince iframe yeniden yükle
  useEffect(() => {
    if (liveRoom.videoVersion && liveRoom.videoVersion !== prevVideoVersionRef.current) {
      prevVideoVersionRef.current = liveRoom.videoVersion
      hostAutoStartedRef.current = false
      setYtPlayerReady(false)
      const iframe = iframeRef.current
      if (iframe) iframe.src = iframe.src // reload
    }
  }, [liveRoom.videoVersion])

  // Host: eski odalarda isPlaying=false kalmışsa videoyu başlat
  useEffect(() => {
    if (!canControl || !liveRoom.videoUrl || !extractYouTubeId(liveRoom.videoUrl)) return
    if (hostAutoStartedRef.current || liveRoom.isPlaying) return
    hostAutoStartedRef.current = true
    const posMs = liveRoom.currentPositionMs
    setLiveRoom((prev) => ({
      ...prev,
      isPlaying: true,
      updatedAt: Date.now(),
      lastUpdatedBy: currentUser.uid
    }))
    postYtCmd('play', posMs / 1000)
    onUpdateVideo(true, posMs)
  }, [canControl, liveRoom.videoUrl, liveRoom.isPlaying, liveRoom.currentPositionMs, liveRoom.videoVersion, onUpdateVideo, postYtCmd, currentUser.uid])

  // YouTube: host + misafir — iframe komut kuyruğu (YT_READY beklemeden de gönder)
  useEffect(() => {
    applyYtSync()
  }, [applyYtSync])

  // Yüklenme sırasında play komutunu birkaç kez yinele (spinner'da takılma)
  useEffect(() => {
    const ytId = extractYouTubeId(liveRoom.videoUrl)
    if (!ytId) return
    if (!liveRoom.isPlaying) return
    const timers = [400, 1200, 2500, 5000, 9000].map((ms) =>
      setTimeout(() => {
        const elapsedNow = liveRoom.isPlaying
          ? Math.max(0, Date.now() - liveRoom.updatedAt)
          : 0
        const posNow = (liveRoom.currentPositionMs + elapsedNow) / 1000
        postYtCmd('play', posNow)
      }, ms)
    )
    return () => timers.forEach(clearTimeout)
  }, [liveRoom.videoUrl, liveRoom.videoVersion, liveRoom.isPlaying, canControl, liveRoom.currentPositionMs, liveRoom.updatedAt, postYtCmd])

  // Ekran paylaşımı bitince iframe yeniden mount olur — yalnızca paylaşımdan çıkışta sıfırla
  const wasScreenSharingRef = useRef(false)
  useEffect(() => {
    const sharing = sharingScreen || someoneElseSharing
    if (wasScreenSharingRef.current && !sharing) setYtPlayerReady(false)
    wasScreenSharingRef.current = sharing
  }, [sharingScreen, someoneElseSharing])

  const handleYtEvent = useCallback((event: YtEvent) => {
    const t = event?.type
    if (t === 'YT_READY' || t === 'YT_STATE' || t === 'YT_ERROR') {
      console.log('[YT]', JSON.stringify(event))
    }
    if (t === 'YT_READY') {
      setYtPlayerReady(true)
      applyYtSync()
      return
    }
    if (t === 'YT_ERROR') {
      console.error('[YT] Player error code:', event.code)
      setYtError(youtubeErrorMessage(event.code))
      return
    }
    if (t === 'YT_ENDED') {
      if (endedHandledRef.current) return
      endedHandledRef.current = true
      if (isHost) void onAdvanceQueue()
      return
    }
    if (t === 'YT_PROGRESS') {
      const cur = typeof event.current === 'number' && isFinite(event.current) ? event.current : 0
      const dur = typeof event.duration === 'number' && isFinite(event.duration) ? event.duration : 0
      setPlayerPosSec(cur)
      if (dur > 0) setPlayerDurSec(dur)
      return
    }
    if (t === 'YT_STATE') {
      const rawTime = typeof event.time === 'number' && isFinite(event.time) ? event.time : 0
      setPlayerPosSec(rawTime)
      const dur = typeof event.duration === 'number' && isFinite(event.duration) ? event.duration : 0
      if (dur > 0) setPlayerDurSec(dur)
      if (!canControl) return
      const state = event.state
      if (state !== 1 && state !== 2) return
      const clampedMs = Math.round(Math.max(0, Math.min(rawTime, 86400)) * 1000)
      onUpdateVideo(state === 1, clampedMs)
    }
  }, [canControl, isHost, onUpdateVideo, applyYtSync, onAdvanceQueue])

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data?.type?.startsWith?.('YT_')) return
      handleYtEvent(e.data as YtEvent)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [handleYtEvent])

  const youtubeId = useMemo(() => extractYouTubeId(liveRoom.videoUrl), [liveRoom.videoUrl])

  useEffect(() => {
    if (!liveRoom.isPlaying || !youtubeId) return
    const t = setInterval(() => setDriftTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [liveRoom.isPlaying, youtubeId])

  const expectedPosSec = useMemo(() => {
    void driftTick
    const elapsed = liveRoom.isPlaying ? Math.max(0, Date.now() - liveRoom.updatedAt) : 0
    return (liveRoom.currentPositionMs + elapsed) / 1000
  }, [liveRoom.isPlaying, liveRoom.currentPositionMs, liveRoom.updatedAt, driftTick])

  const syncDriftSec = useMemo(
    () => (youtubeId && playerDurSec > 1 ? Math.abs(playerPosSec - expectedPosSec) : 0),
    [youtubeId, playerDurSec, playerPosSec, expectedPosSec]
  )

  const handleResync = useCallback(() => {
    const playing = liveRoom.isPlaying
    const elapsed = playing ? Math.max(0, Date.now() - liveRoom.updatedAt) : 0
    const pos = (liveRoom.currentPositionMs + elapsed) / 1000
    postYtCmd(playing ? 'play' : 'pause', pos)
  }, [liveRoom.isPlaying, liveRoom.currentPositionMs, liveRoom.updatedAt, postYtCmd])

  // Eski BrowserView kalıntısını kapat — yalnızca iframe kullanıyoruz
  useEffect(() => {
    hideYtBrowserViewNow()
    return () => { hideYtBrowserViewNow() }
  }, [])

  // Presence
  useEffect(() => {
    onSetPresence()
    presenceInterval.current = setInterval(onSetPresence, 30000)
    return () => {
      clearInterval(presenceInterval.current)
      onClearPresence()
    }
  // onSetPresence/onClearPresence prop referansları App.tsx'te inline arrow — roomId
  // değişince zaten yeniden çalışır; burada sadece roomId bağımlılığı yeterli.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Emoji tepkisi gelince göster
  useEffect(() => {
    if (!liveRoom.reaction || !liveRoom.reactionAt) return
    setFloatingReaction({ emoji: liveRoom.reaction, key: liveRoom.reactionAt })
    const t = setTimeout(() => setFloatingReaction(null), 2000)
    return () => clearTimeout(t)
  }, [liveRoom.reactionAt])

  // Tam ekran — video / ekran paylaşımı alanını tam ekran yap (mobil ile eşdeğer)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    const el = videoAreaRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(buildInviteMessage(liveRoom.title, roomId))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Paylaşan adını bul (avatar tooltip için)
  const sharerName = friends.find((f) => f.uid === sharerUid)?.displayName ?? t('common_someone')

  // Odadaki canlı üyeler (presence) — useMemo: presence değişmediğinde yeniden hesaplama yok
  const onlineUids = useMemo(
    () => Object.keys(liveRoom.presence ?? {}).filter(
      (u) => Date.now() - ((liveRoom.presence ?? {})[u] ?? 0) < 60000
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveRoom.presence, liveRoom.updatedAt]
  )

  const roomTitle = liveRoom.title || roomId

  const typingLabel = useMemo(() => {
    const now = Date.now()
    const names = Object.entries(liveRoom.typing ?? {})
      .filter(([uid, ts]) => uid !== currentUser.uid && now - ts < 5000)
      .map(([uid]) => liveRoom.presenceNames?.[uid] ?? t('common_someone'))
    if (names.length === 0) return null
    if (names.length === 1) return t('watch_typing_one', names[0])
    return t('watch_typing_many', names.slice(0, 2).join(', '))
  }, [liveRoom.typing, liveRoom.presenceNames, currentUser.uid, t])

  const toggleChatOpen = useCallback(() => {
    setChatOpen((v) => {
      const next = !v
      try { localStorage.setItem('wtf_chat_open', next ? '1' : '0') } catch { /* yut */ }
      return next
    })
  }, [])

  const onChatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = chatWidthRef.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function onMove(ev: MouseEvent) {
      const next = Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, startW + (startX - ev.clientX)))
      chatWidthRef.current = next
      setChatWidth(next)
    }
    function onUp() {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('wtf_chat_width', String(chatWidthRef.current)) } catch { /* yut */ }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const scheduleFmt = useMemo(() => {
    if (scheduleCountdown === null || scheduleCountdown <= 0) return null
    const totalSec = Math.ceil(scheduleCountdown / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }, [scheduleCountdown])

  return (
    <div className="watch-room">
      <div className="watch-room__stage-col">
        <RoomHeader
          roomTitle={roomTitle}
          roomId={roomId}
          onlineUids={onlineUids}
          presenceNames={liveRoom.presenceNames}
          speakingUids={speakingUids}
          myUid={currentUser.uid}
          canControl={canControl}
          isHost={isHost}
          discoverable={!!liveRoom.discoverable}
          inVoice={inVoice}
          voiceMuted={muted}
          voiceListenOnly={voiceListenOnly}
          videoHidden={videoHidden}
          chatSearchOpen={showChatSearch}
          hasVideo={!!liveRoom.videoUrl}
          screenSharing={sharingScreen || someoneElseSharing}
          onBack={() => exitRoom(onBack)}
          onCopyCode={copyInviteLink}
          copied={copied}
          onVideoChange={() => setShowUrlChange(true)}
          onMembers={() => setShowMembers(true)}
          onInvite={() => setShowInvite(true)}
          onTogglePublic={() => onTogglePublic(!liveRoom.discoverable)}
          onDelete={() => setShowDeleteConfirm(true)}
          onLeave={() => setShowLeaveConfirm(true)}
          onResync={handleResync}
          onToggleVideoHidden={() => setVideoHidden(v => !v)}
          chatOpen={chatOpen}
          onToggleChat={toggleChatOpen}
          onToggleChatSearch={() => {
            setShowChatSearch(v => !v)
            if (showChatSearch) setChatSearchQuery('')
          }}
          onJoinVoice={joinVoice}
          onLeaveVoice={leaveVoice}
          onToggleVoiceMute={toggleMute}
          onStartPoll={() => setShowPollDialog(true)}
          onOpenQueue={() => setShowQueue(true)}
          queueCount={liveRoom.queue?.length ?? 0}
        />

        {liveRoom.pinnedMessage && (
          <div className="watch-room__banner watch-room__banner--pin">📌 {liveRoom.pinnedMessage}</div>
        )}

        {scheduleCountdown !== null && scheduleCountdown > 0 && (
          <div className="watch-room__banner watch-room__banner--schedule">
            <div>
              <div style={{ fontWeight: 700 }}>
                {t('watch_scheduled', new Date(liveRoom.scheduledAt).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{t('watch_scheduled_wait')}</div>
            </div>
            <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>{scheduleFmt}</strong>
          </div>
        )}
        {scheduleCountdown === 0 && liveRoom.scheduledAt > 0 && (
          <div className="watch-room__banner watch-room__banner--live">{t('watch_started')}</div>
        )}

        <VideoStage
          areaRef={videoAreaRef}
          iframeRef={iframeRef}
          sharingScreen={sharingScreen}
          screenTrackMuted={screenTrackMuted}
          remoteImgRef={remoteImgRef}
          remoteStream={remoteStream}
          someoneElseSharing={someoneElseSharing}
          screenConnecting={screenConnecting}
          sharerName={sharerName}
          videoUrl={liveRoom.videoUrl}
          youtubeId={youtubeId}
          videoVersion={liveRoom.videoVersion}
          canControl={canControl}
          canAddVideo={canControl}
          onAddVideo={() => setShowUrlChange(true)}
          floatingReaction={floatingReaction}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onIframeLoad={() => setYtPlayerReady(false)}
          videoHidden={videoHidden}
          onShowVideo={() => setVideoHidden(false)}
          ytError={ytError}
          onDismissYtError={() => setYtError(null)}
          playerPosSec={playerPosSec}
          playerDurSec={playerDurSec}
          syncDriftSec={syncDriftSec}
        />

        <div className="watch-room__reactions">
          {showReactions
            ? REACTION_EMOJIS.map((e) => (
                <button key={e} type="button" className="reaction-send-btn" onClick={() => { onSendReaction(e); setShowReactions(false) }}>{e}</button>
              ))
            : <button type="button" className="voice-btn" onClick={() => setShowReactions(true)}>{t('watch_reaction')}</button>
          }
          {showReactions && <button type="button" className="btn-link" onClick={() => setShowReactions(false)}>✕</button>}
        </div>

        <VoicePanel
          sharingScreen={sharingScreen}
          onToggleScreen={toggleScreen}
          onStartSharing={startSharing}
          onStopSharing={stopSharing}
          qualityPreset={qualityPreset}
          onSetQuality={setQuality}
          inVoice={inVoice}
          isJoining={voiceJoining}
          voiceError={voiceError}
          muted={muted}
          speakingUids={speakingUids}
          voicePeersList={voicePeersList}
          listenOnly={voiceListenOnly}
          myUid={currentUser.uid}
          onJoinVoice={joinVoice}
          onLeaveVoice={leaveVoice}
          onToggleMute={toggleMute}
          onToggleDeafen={toggleDeafen}
          onEnableMicrophone={() => { void enableMicrophone() }}
          deafened={voiceDeafened}
          pushToTalk={voicePushToTalk}
          pttActive={voicePttActive}
          onSetPushToTalk={setPushToTalk}
          onSetPttActive={setPttActive}
          peerVolumes={peerVolumes}
          peerLocalMuted={peerLocalMuted}
          onSetPeerVolume={setPeerVolume}
          onTogglePeerLocalMute={togglePeerLocalMute}
          micGain={micGain}
          speakRmsThreshold={speakRmsThreshold}
          localMicLevel={localMicLevel}
          onSetSpeakRmsThreshold={setSpeakRmsThreshold}
          presenceNames={liveRoom.presenceNames}
          peerPhotos={voicePeerPhotos}
        />
      </div>

      {!chatOpen && (
        <button type="button" className="watch-room__chat-reopen" onClick={toggleChatOpen} title={t('watch_chat_open')}>
          💬
        </button>
      )}

      {chatOpen && (
      <aside className="watch-room__chat" style={{ width: chatWidth }}>
        <div
          className="watch-room__chat-resize"
          onMouseDown={onChatResizeStart}
          title={t('watch_chat_resize')}
          role="separator"
          aria-orientation="vertical"
        />
        <PollPanel
          room={liveRoom}
          myUid={currentUser.uid}
          isHost={isHost}
          onVote={(idx) => { void onVotePoll(idx) }}
          onClear={() => { void onClearPoll() }}
        />
        {showChatSearch && (
          <div className="watch-room__chat-search">
            <input
              type="search"
              placeholder={t('watch_chat_search_ph')}
              value={chatSearchQuery}
              onChange={e => setChatSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="button" className="btn-link" onClick={() => { setShowChatSearch(false); setChatSearchQuery('') }}>✕</button>
          </div>
        )}
        <ChatPanel
          messages={messages.filter(m => !(currentUser.blockedIds ?? []).includes(m.senderUid ?? ''))}
          myUid={currentUser.uid}
          onSend={onSendMessage}
          onTyping={onSetTyping}
          onReaction={(msgId, emoji) => { void onToggleReaction(msgId, emoji) }}
          typingLabel={typingLabel}
          searchQuery={chatSearchQuery}
        />
      </aside>
      )}

      {showQueue && (
        <QueueModal
          queue={liveRoom.queue ?? []}
          canControl={canControl}
          myUid={currentUser.uid}
          onClose={() => setShowQueue(false)}
          onAddUrl={onAddUrlToQueue}
          onAddResult={onAddSearchToQueue}
          onPlayItem={onPlayQueueItem}
          onRemoveItem={onRemoveQueueItem}
        />
      )}

      {showPollDialog && (
        <div className="modal-overlay" onClick={() => setShowPollDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>📊 {t('watch_start_poll')}</h3>
            <div className="form-group" style={{ marginTop: 12 }}>
              <input
                type="text"
                placeholder={t('watch_poll_question')}
                value={pollQuestion}
                onChange={e => setPollQuestion(e.target.value)}
                autoFocus
              />
            </div>
            {[
              { label: t('watch_poll_opt_a'), value: pollOptA, set: setPollOptA },
              { label: t('watch_poll_opt_b'), value: pollOptB, set: setPollOptB },
              { label: t('watch_poll_opt_c'), value: pollOptC, set: setPollOptC },
              { label: t('watch_poll_opt_d'), value: pollOptD, set: setPollOptD }
            ].map(({ label, value, set }) => (
              <div key={label} className="form-group" style={{ marginTop: 8 }}>
                <input type="text" placeholder={label} value={value} onChange={e => set(e.target.value)} />
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowPollDialog(false)}>{t('common_cancel')}</button>
              <button
                className="btn-primary"
                disabled={!pollQuestion.trim() || !pollOptA.trim() || !pollOptB.trim()}
                onClick={async () => {
                  const opts = [pollOptA, pollOptB, pollOptC, pollOptD]
                    .map(s => s.trim())
                    .filter(Boolean)
                  if (opts.length < 2) return
                  await onCreatePoll(pollQuestion.trim(), opts)
                  setShowPollDialog(false)
                  setPollQuestion('')
                  setPollOptA('')
                  setPollOptB('')
                  setPollOptC('')
                  setPollOptD('')
                }}
              >
                {t('common_start')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUrlChange && (
        <VideoChangeModal
          onClose={() => setShowUrlChange(false)}
          onChangeUrl={onUpdateVideoUrl}
        />
      )}

      {/* Katılımcılar / Engelle modalı */}
      {showMembers && (
        <div className="modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>👤 {t('watch_participants', liveRoom.memberUids?.length ?? 0)}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {liveRoom.memberUids?.map(uid => {
                const name = liveRoom.presenceNames?.[uid] ?? uid
                const isMe = uid === currentUser.uid
                const isOnline = onlineUids.includes(uid)
                const isMod = liveRoom.moderators?.includes(uid) ?? false
                const isHostUser = liveRoom.hostUid === uid
                return (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: isOnline ? 'rgba(59,165,93,0.2)' : 'rgba(139,92,246,0.15)',
                      border: `2px solid ${isOnline ? '#22c55e' : 'transparent'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: isOnline ? '#4ade80' : 'var(--text2)', flexShrink: 0
                    }}>
                      {name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {name}
                        {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text2)' }}>{t('common_you_suffix')}</span>}
                        {isHostUser && <span style={{ marginLeft: 6, fontSize: 11, color: '#fbbf24' }}>👑</span>}
                        {isMod && !isHostUser && <span style={{ marginLeft: 6, fontSize: 11, color: '#a78bfa' }}>🛡</span>}
                      </div>
                      <div style={{ fontSize: 11, color: isOnline ? '#4ade80' : 'var(--text2)' }}>{isOnline ? t('common_online') : t('common_offline')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {isHost && !isMe && !isHostUser && (
                        <>
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            title={isMod ? t('watch_remove_mod') : t('watch_make_mod')}
                            onClick={() => { void onSetModerator(uid, !isMod); showToast(isMod ? t('toast_mod_revoked') : t('toast_mod_granted'), 'success') }}
                          >
                            {isMod ? '⬇' : '🛡'}
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            title={t('watch_transfer_host')}
                            onClick={() => {
                              if (!confirm(t('watch_transfer_host_confirm', name))) return
                              void onTransferHost(uid)
                              showToast(t('toast_host_transferred'), 'success')
                            }}
                          >
                            👑
                          </button>
                        </>
                      )}
                      {!isMe && (
                        <button
                          type="button"
                          className="btn-icon danger"
                          style={{ fontSize: 11, padding: '4px 8px', opacity: blockingUid === uid ? 0.5 : 1 }}
                          disabled={blockingUid === uid}
                          title={t('watch_block_user', name)}
                          onClick={async () => {
                            if (!confirm(t('watch_block_confirm', name))) return
                            setBlockingUid(uid)
                            await onBlockUser(uid)
                            setBlockingUid(null)
                            setShowMembers(false)
                            showToast(t('toast_user_blocked'), 'info')
                          }}
                        >
                          {blockingUid === uid ? '...' : '🚫'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button className="btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowMembers(false)}>{t('common_close')}</button>
          </div>
        </div>
      )}

      {/* Davet modalı */}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>👥 {t('watch_invite_friends')}</h3>
            {friends.filter((f) => !liveRoom.memberUids?.includes(f.uid)).length === 0 ? (
              <p>{t('watch_invite_empty')}</p>
            ) : (
              friends.filter((f) => !liveRoom.memberUids?.includes(f.uid)).map((f) => (
                <div key={f.uid} className="friend-card" style={{ marginBottom: 8 }}>
                  <div className="friend-avatar">{photoSrc(f.photoBase64) ? <img src={photoSrc(f.photoBase64)!} style={{ width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover' }} alt="" /> : (f.displayName?.[0] ?? '?').toUpperCase()}</div>
                  <div style={{ flex: 1 }}><div className="friend-name">{f.displayName}</div></div>
                  <button className="btn-primary" style={{ padding:'6px 14px' }} onClick={() => { onInviteFriend(f.uid); setShowInvite(false) }}>{t('common_invite')}</button>
                </div>
              ))
            )}
            <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowInvite(false)}>{t('common_close')}</button>
          </div>
        </div>
      )}

      {/* Ses kanalı giriş/çıkış toast bildirimleri */}
      {voiceToasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {voiceToasts.map(t => (
            <div key={t.id} style={{
              background: t.type === 'joined' ? 'rgba(34,197,94,0.92)' : 'rgba(100,116,139,0.92)',
              color: '#fff', borderRadius: 20, padding: '8px 18px',
              fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
              animation: 'voiceToastIn 0.25s ease'
            }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* Oda silme onay modalı */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🗑 {t('watch_delete_room')}</h3>
            <p>{t('watch_delete_confirm_body')}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>{t('common_cancel')}</button>
              <button className="btn-primary danger" onClick={() => { setShowDeleteConfirm(false); exitRoom(onDeleteRoom) }}>{t('common_yes_delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Odadan ayrılma onay modalı */}
      {showLeaveConfirm && (
        <div className="modal-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🚪 {t('watch_leave_room')}</h3>
            <p>{t('watch_leave_confirm_body')}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowLeaveConfirm(false)}>{t('common_cancel')}</button>
              <button className="btn-primary danger" onClick={() => { setShowLeaveConfirm(false); exitRoom(onLeaveRoom) }}>{t('common_yes_leave')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
