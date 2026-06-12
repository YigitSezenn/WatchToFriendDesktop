import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from './firebase/config'
import { useAuth } from './hooks/useAuth'
import { useRoom } from './hooks/useRoom'
import { useDm, useProfile } from './hooks/useDm'
import LoginScreen from './screens/LoginScreen'
import SplashScreen from './screens/SplashScreen'
import HomeScreen from './screens/HomeScreen'
import CreateRoomScreen from './screens/CreateRoomScreen'
import JoinRoomScreen from './screens/JoinRoomScreen'
import WatchRoomScreen from './screens/WatchRoomScreen'
import DmScreen from './screens/DmScreen'
import ProfileModal from './screens/ProfileModal'
import AdminScreen from './screens/AdminScreen'
import { isAdminUser } from './constants/admin'
import ToastHost from './components/ToastHost'
import FirstLaunchTour, { isTourDone } from './components/FirstLaunchTour'
import HelpModal from './components/HelpModal'
import { useTheme } from './hooks/useTheme'
import { useLocale } from './hooks/useLocale'
import { showToast } from './utils/toast'
import { recordRoomSession, shouldPromptRating, openRatePage } from './utils/ratingPref'
import { totalDmUnread } from './utils/formatBadge'
import { useNotifications, type NotificationNavigateAction, type NotifScreen } from './hooks/useNotifications'
import type { User } from './types'

type Screen = 'home' | 'create' | 'join' | 'watch' | 'dm' | 'admin'

export default function App() {
  useTheme()
  const { user: authUser, loading, login, register, loginWithGoogle, resetPassword, logout, changePassword, deleteAccount } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [activeDmUid, setActiveDmUid] = useState<string | null>(null)
  const [activeDmId, setActiveDmId] = useState<string | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [fullUser, setFullUser] = useState<User | null>(null)
  // Keşfet'ten katılırken Firestore listener henüz tetiklenmeden önce oda verisini tutar
  const [pendingRoom, setPendingRoom] = useState<import('./types').Room | null>(null)
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(null)
  const [showTour, setShowTour] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [bootSplash, setBootSplash] = useState(true)
  const [homeTabOverride, setHomeTabOverride] = useState<'rooms' | 'discover' | 'friends' | 'dm' | null>(null)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    const timer = window.setTimeout(() => setBootSplash(false), 900)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!authUser?.uid) {
      setFullUser(null)
      return
    }
    return onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data()
        setFullUser({
          uid: authUser.uid,
          ...data,
          email: (data.email as string | undefined) ?? authUser.email ?? '',
          displayName: (data.displayName as string | undefined) ?? authUser.displayName ?? '',
          friendIds: (data.friendIds as string[] | undefined) ?? authUser.friendIds ?? []
        } as User)
      },
      () => setFullUser(null)
    )
  }, [authUser?.uid])

  const user = authUser ? (fullUser ?? authUser) : null
  const isAdmin = isAdminUser(user?.email)

  useEffect(() => {
    if (user && screen === 'home' && !isTourDone()) setShowTour(true)
  }, [user, screen])

  useEffect(() => {
    if (user && screen === 'home' && shouldPromptRating()) openRatePage()
  }, [user, screen])

  function finishWatchSession() {
    recordRoomSession()
  }

  const sessionUid = isDeletingAccount ? '' : (user?.uid ?? '')

  const roomHook = useRoom(sessionUid)
  const {
    rooms, publicRooms, friends, incomingRequests,
    createRoom, joinRoom, deleteRoom, leaveRoom,
    updateVideoState, updateVideoUrl, togglePublic,
    setPresence, clearPresence, setTyping, sendReaction,
    createPoll, votePoll, clearPoll,
    addUrlToQueue, addSearchResultToQueue, playFromQueue, advanceQueue, removeFromQueue,
    useMessages, sendMessage, toggleMessageReaction,
    setModerator, transferHost,
    sendFriendRequest, sendRoomInvite, acceptRequest, rejectRequest, removeFriend,
    blockUser, unblockUser
  } = roomHook

  const dmHook = useDm(sessionUid)
  const { conversations, useMessages: useDmMessages, openOrCreateDm,
    sendMessage: sendDm, deleteMessage: deleteDmMsg, toggleReaction, clearUnread } = dmHook

  const profileHook = useProfile(sessionUid)
  const { ensureFriendCode, updateDisplayName, updatePhoto, removePhoto, useHistory, deleteHistory } = profileHook
  const history = useHistory()

  // useMemo: her render'da yeniden hesaplanmayı önle (büyük liste filtreleri)
  const totalUnread = useMemo(
    () => totalDmUnread(conversations, user?.uid ?? ''),
    [conversations, user?.uid]
  )
  // Live listeden gelirse pendingRoom artık gerek yok
  const activeRoom = useMemo(() => {
    const fromList = rooms.find((r) => r.id === activeRoomId) ?? null
    return fromList ?? pendingRoom
  }, [rooms, activeRoomId, pendingRoom])
  useEffect(() => {
    if (activeRoomId && rooms.some((r) => r.id === activeRoomId)) setPendingRoom(null)
  }, [rooms, activeRoomId])
  const roomMessages = useMessages(activeRoomId ?? '')
  // useMemo: friends listesi değişmediğinde yeniden hesaplama yapılmaz
  const activeDmFriend = useMemo(
    () => friends.find((f) => f.uid === activeDmUid),
    [friends, activeDmUid]
  )
  const dmMessages = useDmMessages(activeDmId ?? '')

  useEffect(() => {
    if (user?.uid && !user.friendCode) ensureFriendCode()
    // ensureFriendCode profil hook'tan geliyor, referans değişmez; user.uid bağımlılığı yeterli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  // Ana ekrana dönünce YouTube BrowserView tıklamaları engellemesin
  useEffect(() => {
    if (screen === 'watch') return
    const ytView = (window as { electronAPI?: { ytView?: { hide: () => Promise<void> } } }).electronAPI?.ytView
    ytView?.hide().catch(() => {})
  }, [screen])

  useEffect(() => {
    if (screen === 'admin' && !isAdmin) setScreen('home')
  }, [screen, isAdmin])

  function openInviteJoin(code: string) {
    setInviteJoinCode(code.toUpperCase())
    setScreen('join')
  }

  useEffect(() => {
    const api = (window as {
      electronAPI?: { onInviteLink?: (cb: (code: string) => void) => () => void }
    }).electronAPI
    if (!api?.onInviteLink) return
    return api.onInviteLink((code) => {
      if (user) openInviteJoin(code)
      else sessionStorage.setItem('pendingInviteCode', code)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const stored = sessionStorage.getItem('pendingInviteCode')
    if (!stored) return
    sessionStorage.removeItem('pendingInviteCode')
    openInviteJoin(stored)
  }, [user])

  const pendingCount = incomingRequests.length

  async function handleOpenDm(friendUid: string) {
    const friend = friends.find((f) => f.uid === friendUid)
    if (!friend || !user) return
    const id = await openOrCreateDm(friendUid, user.displayName, friend.displayName, user.photoBase64 ?? '', friend.photoBase64 ?? '')
    setActiveDmId(id); setActiveDmUid(friendUid); setScreen('dm')
  }

  async function handleDeleteAccount(password: string) {
    if (!user) return
    setIsDeletingAccount(true)
    setShowProfile(false)
    setScreen('home')
    setActiveRoomId(null)
    setActiveDmId(null)
    setActiveDmUid(null)
    try {
      await deleteAccount(password, user.friendIds ?? [])
    } finally {
      setIsDeletingAccount(false)
    }
  }

  async function handleRemoveFriend(friendUid: string) {
    try {
      await removeFriend(friendUid)
      if (activeDmUid === friendUid) {
        setActiveDmId(null)
        setActiveDmUid(null)
        setScreen('home')
      }
    } catch {
      showToast(t('toast_remove_friend_failed'), 'error')
    }
  }

  const handleNotifNavigate = useCallback((action: NotificationNavigateAction) => {
    if (action.type === 'friend') {
      setScreen('home')
      setHomeTabOverride('friends')
      return
    }
    if (action.type === 'room_invite') {
      setScreen('home')
      setHomeTabOverride('friends')
      return
    }
    if (action.type === 'dm' && action.friendUid) {
      void handleOpenDm(action.friendUid)
      return
    }
    if (action.type === 'room_message' && action.roomId) {
      setActiveRoomId(action.roomId)
      setScreen('watch')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, user?.uid])

  useNotifications({
    uid: sessionUid,
    screen: screen as NotifScreen,
    activeRoomId,
    activeDmId,
    conversations,
    incomingRequests,
    rooms,
    totalUnread,
    pendingCount,
    onNavigate: handleNotifNavigate
  })

  async function handleAcceptRequest(req: import('./types').Request) {
    await acceptRequest(req)
    // Oda daveti kabul edilince odaya git
    if (req.type === 'room' && req.roomId) {
      setActiveRoomId(req.roomId)
      setScreen('watch')
    }
  }

  if (loading || bootSplash) {
    return <SplashScreen />
  }

  if (!user) {
    return (
      <>
        <LoginScreen
          onLogin={login}
          onRegister={register}
          onGoogleLogin={loginWithGoogle}
          onResetPassword={resetPassword}
        />
        <ToastHost />
      </>
    )
  }

  if (screen === 'create') {
    return (
      <>
        <CreateRoomScreen
          onCreate={async (videoUrl, title, discoverable, password, maxMembers, scheduledAt) => {
            const code = await createRoom(videoUrl, user.displayName, title, discoverable, password, maxMembers, scheduledAt)
            setActiveRoomId(code); setScreen('watch')
            return code
          }}
          onBack={() => setScreen('home')}
        />
        <ToastHost />
      </>
    )
  }

  if (screen === 'join') {
    return (
      <>
        <JoinRoomScreen
          initialCode={inviteJoinCode ?? undefined}
          onJoin={async (code, password) => {
            const result = await joinRoom(code, password)
            if (result === 'ok') {
              setInviteJoinCode(null)
              setActiveRoomId(code.toUpperCase())
              setScreen('watch')
            }
            return result
          }}
          onBack={() => { setInviteJoinCode(null); setScreen('home') }}
        />
        <ToastHost />
      </>
    )
  }

  if (screen === 'watch' && activeRoomId && activeRoom) {
    return (
      <>
        <WatchRoomScreen
          roomId={activeRoomId}
          currentUser={user}
          room={activeRoom}
          messages={roomMessages}
          friends={friends}
          isHost={activeRoom.hostUid === user.uid}
          onSendMessage={(text) => sendMessage(activeRoomId, text, user.displayName, user.photoBase64 ?? '')}
          onUpdateVideo={(playing, pos) => updateVideoState(activeRoomId, playing, pos)}
          onUpdateVideoUrl={(url) => updateVideoUrl(activeRoomId, url)}
          onSetTyping={() => setTyping(activeRoomId)}
          onSetPresence={() => setPresence(activeRoomId, user.displayName)}
          onClearPresence={() => clearPresence(activeRoomId)}
          onSendReaction={(emoji) => sendReaction(activeRoomId, emoji)}
          onInviteFriend={(friendUid) => sendRoomInvite(friendUid, user.displayName, activeRoomId)}
          onTogglePublic={(discoverable) => togglePublic(activeRoomId, discoverable)}
          onDeleteRoom={async () => { await deleteRoom(activeRoomId); setActiveRoomId(null); setScreen('home'); finishWatchSession() }}
          onLeaveRoom={async () => { await leaveRoom(activeRoomId); setActiveRoomId(null); setScreen('home'); finishWatchSession() }}
          onBlockUser={async (uid) => blockUser(uid)}
          onCreatePoll={(q, opts) => createPoll(activeRoomId, q, opts)}
          onVotePoll={(idx) => votePoll(activeRoomId, idx).catch(() => {})}
          onClearPoll={() => clearPoll(activeRoomId)}
          onAddUrlToQueue={(url) => addUrlToQueue(activeRoomId, url, user.displayName)}
          onAddSearchToQueue={(r) => addSearchResultToQueue(activeRoomId, r, user.displayName)}
          onPlayQueueItem={(item) => playFromQueue(activeRoomId, item)}
          onRemoveQueueItem={(item) => removeFromQueue(activeRoomId, item)}
          onAdvanceQueue={() => advanceQueue(activeRoomId)}
          onToggleReaction={(msgId, emoji) => toggleMessageReaction(activeRoomId, msgId, emoji)}
          onSetModerator={(uid, make) => setModerator(activeRoomId, uid, make)}
          onTransferHost={(uid) => transferHost(activeRoomId, uid)}
          onBack={() => { setScreen('home'); finishWatchSession() }}
        />
        {showTour && <FirstLaunchTour onDone={() => setShowTour(false)} />}
        {showHelp && <HelpModal t={t} onClose={() => setShowHelp(false)} />}
        <ToastHost />
        {showProfile && (
          <ProfileModal user={user} history={history}
            onUpdateName={updateDisplayName} onUpdatePhoto={updatePhoto} onRemovePhoto={removePhoto}
            onDeleteHistory={deleteHistory} onUnblockUser={unblockUser}
            onDeleteAccount={handleDeleteAccount}
            onChangePassword={(cur, neu) => changePassword(cur, neu)}
            onReplayTour={() => setShowTour(true)}
            onOpenHelp={() => setShowHelp(true)}
            onClose={() => setShowProfile(false)} />
        )}
      </>
    )
  }

  if (screen === 'admin' && isAdmin) {
    return (
      <>
        <AdminScreen onBack={() => setScreen('home')} />
        <ToastHost />
      </>
    )
  }

  if (screen === 'dm' && activeDmId && activeDmUid) {
    return (
      <>
        <DmScreen
          dmId={activeDmId}
          otherName={activeDmFriend?.displayName ?? '?'}
          myUid={user.uid}
          messages={dmMessages}
          onSend={(text) => sendDm(activeDmId, text, user.displayName, user.photoBase64 ?? '')}
          onDelete={(msgId) => deleteDmMsg(activeDmId, msgId)}
          onReaction={(msgId, emoji) => toggleReaction(activeDmId, msgId, emoji)}
          onClearUnread={() => clearUnread(activeDmId)}
          onBack={() => { setActiveDmId(null); setActiveDmUid(null); setScreen('home') }}
        />
        {showTour && <FirstLaunchTour onDone={() => setShowTour(false)} />}
        {showHelp && <HelpModal t={t} onClose={() => setShowHelp(false)} />}
        <ToastHost />
        {showProfile && (
          <ProfileModal user={user} history={history}
            onUpdateName={updateDisplayName} onUpdatePhoto={updatePhoto} onRemovePhoto={removePhoto}
            onDeleteHistory={deleteHistory} onUnblockUser={unblockUser}
            onDeleteAccount={handleDeleteAccount}
            onChangePassword={(cur, neu) => changePassword(cur, neu)}
            onReplayTour={() => setShowTour(true)}
            onOpenHelp={() => setShowHelp(true)}
            onClose={() => setShowProfile(false)} />
        )}
      </>
    )
  }

  return (
    <>
      <HomeScreen
        currentUser={user}
        rooms={rooms}
        publicRooms={publicRooms}
        friends={friends}
        incomingRequests={incomingRequests}
        dmConversations={conversations}
        totalUnread={totalUnread}
        tabOverride={homeTabOverride}
        onTabOverrideConsumed={() => setHomeTabOverride(null)}
        onCreateRoom={() => setScreen('create')}
        onJoinRoom={() => setScreen('join')}
        onOpenRoom={(id) => { setActiveRoomId(id); setScreen('watch') }}
        onJoinPublicRoom={async (id, password = '') => {
          const result = await joinRoom(id, password)
          if (result !== 'ok' && result !== 'already_member') {
            // 'not_found' | 'wrong_password' | 'full'
            showToast(
              result === 'wrong_password' ? t('toast_wrong_password')
              : result === 'full' ? t('toast_room_full')
              : t('toast_room_not_found'),
              'error'
            )
            return
          }
          // Firestore listener tetiklenene kadar oda verisini doğrudan çek
          const snap = await getDoc(doc(db, 'rooms', id))
          if (snap.exists()) {
            setPendingRoom({ id: snap.id, ...snap.data() } as import('./types').Room)
          }
          setActiveRoomId(id)
          setScreen('watch')
        }}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={leaveRoom}
        onTogglePublic={togglePublic}
        onSendFriendRequest={(email) => sendFriendRequest(email, user.displayName)}
        onAcceptRequest={handleAcceptRequest}
        onRejectRequest={rejectRequest}
        onOpenDm={handleOpenDm}
        onRemoveFriend={handleRemoveFriend}
        onOpenProfile={() => setShowProfile(true)}
        isAdmin={isAdmin}
        onOpenAdmin={() => setScreen('admin')}
        onLogout={async () => {
          // Logout'ta tüm yerel state'i sıfırla — bir sonraki kullanıcı eski veriyi görmesin
          setScreen('home')
          setActiveRoomId(null)
          setActiveDmId(null)
          setActiveDmUid(null)
          setFullUser(null)
          setPendingRoom(null)
          setShowProfile(false)
          await logout()
        }}
      />
      {showTour && <FirstLaunchTour onDone={() => setShowTour(false)} />}
      {showHelp && <HelpModal t={t} onClose={() => setShowHelp(false)} />}
      <ToastHost />
      {showProfile && (
        <ProfileModal user={user} history={history}
          onUpdateName={updateDisplayName} onUpdatePhoto={updatePhoto} onRemovePhoto={removePhoto}
          onDeleteHistory={deleteHistory} onUnblockUser={unblockUser}
          onDeleteAccount={handleDeleteAccount}
          onChangePassword={(cur, neu) => changePassword(cur, neu)}
          onReplayTour={() => setShowTour(true)}
          onOpenHelp={() => setShowHelp(true)}
          onClose={() => setShowProfile(false)} />
      )}
    </>
  )
}
