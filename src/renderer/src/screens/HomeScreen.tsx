import React, { useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import BrandLogo from '../components/BrandLogo'
import { photoSrc } from '../utils/photo'
import type { Room, User, Request, DmConversation } from '../types'

interface Props {
  currentUser: User
  rooms: Room[]
  publicRooms: Room[]
  friends: User[]
  incomingRequests: Request[]
  dmConversations: DmConversation[]
  totalUnread: number
  onCreateRoom: () => void
  onJoinRoom: () => void
  onOpenRoom: (roomId: string) => void
  onJoinPublicRoom: (roomId: string, password?: string) => void
  onDeleteRoom: (roomId: string) => void
  onLeaveRoom: (roomId: string) => void
  onTogglePublic: (roomId: string, isPublic: boolean) => void
  onSendFriendRequest: (email: string) => Promise<string>
  onAcceptRequest: (req: Request) => void
  onRejectRequest: (reqId: string) => void
  onOpenDm: (friendUid: string) => void
  onOpenProfile: () => void
  isAdmin?: boolean
  onOpenAdmin?: () => void
  onLogout: () => void
}

export default function HomeScreen({
  currentUser, rooms, publicRooms, friends, incomingRequests,
  dmConversations, totalUnread,
  onCreateRoom, onJoinRoom, onOpenRoom, onJoinPublicRoom, onDeleteRoom, onLeaveRoom,
  onTogglePublic, onSendFriendRequest, onAcceptRequest, onRejectRequest,
  onOpenDm, onOpenProfile, isAdmin = false, onOpenAdmin, onLogout
}: Props) {
  const { t, dateLocale } = useLocale()
  const [tab, setTab] = useState<'rooms' | 'discover' | 'friends' | 'dm'>('rooms')
  const [friendInput, setFriendInput] = useState('')
  const [friendMsg, setFriendMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [passwordRoom, setPasswordRoom] = useState<Room | null>(null)
  const [passwordInput, setPasswordInput] = useState('')

  async function handleAddFriend() {
    const raw = friendInput.trim().replace(/^#/, '')
    if (!raw) return
    const result = await onSendFriendRequest(raw)
    setFriendMsg(result === 'ok' ? t('home_friend_request_sent') : result)
    setFriendInput('')
    setTimeout(() => setFriendMsg(''), 3000)
  }

  const pendingCount = incomingRequests.length
  const sectionTitle = tab === 'rooms' ? t('tab_rooms')
    : tab === 'discover' ? t('tab_discover')
    : tab === 'friends' ? t('tab_friends')
    : t('tab_messages')

  function formatSchedule(room: Room) {
    const d = new Date(room.scheduledAt)
    const diff = room.scheduledAt - Date.now()
    const isPast = diff <= 0
    const dateStr = `${d.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`
    return (
      <div style={{ fontSize: 11, fontWeight: 600, color: isPast ? '#4ade80' : '#60a5fa', marginTop: 2 }}>
        {isPast ? t('home_started') : '🕐 '}
        {dateStr}
        {!isPast && t('home_scheduled_in', Math.ceil(diff / 60000))}
      </div>
    )
  }

  return (
    <div className="home-container">
      <nav className="server-rail" aria-label={t('home_nav_aria')}>
        <div className="server-logo" title="WatchToFriend">
          <BrandLogo size={48} />
        </div>
        <button className={`rail-btn ${tab === 'rooms' ? 'active' : ''}`} onClick={() => setTab('rooms')} title={t('tab_rooms')}>🏠</button>
        <button className={`rail-btn ${tab === 'discover' ? 'active' : ''}`} onClick={() => setTab('discover')} title={t('tab_discover')}>
          🌍
          {publicRooms.length > 0 && <span className="rail-badge">{publicRooms.length}</span>}
        </button>
        <button className={`rail-btn ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')} title={t('tab_friends')}>
          👥
          {pendingCount > 0 && <span className="rail-badge">{pendingCount}</span>}
        </button>
        <button className={`rail-btn ${tab === 'dm' ? 'active' : ''}`} onClick={() => setTab('dm')} title={t('tab_messages')}>
          💬
          {totalUnread > 0 && <span className="rail-badge">{totalUnread}</span>}
        </button>
        <div className="rail-spacer" />
        {isAdmin && onOpenAdmin && (
          <button className="rail-btn" onClick={onOpenAdmin} title={t('common_admin')}>⚙</button>
        )}
        <button className="rail-btn" onClick={onLogout} title={t('common_logout')} style={{ fontSize: 16 }}>⎋</button>
        <div className="rail-profile topbar-avatar" onClick={onOpenProfile} title={t('profile_display_name')}>
          {photoSrc(currentUser.photoBase64)
            ? <img src={photoSrc(currentUser.photoBase64)!} className="topbar-avatar-img" alt="" />
            : <div className="topbar-avatar-letter">{(currentUser.displayName?.[0] ?? '?').toUpperCase()}</div>
          }
        </div>
      </nav>

      <div className="home-main">
        <header className="channel-header">
          <span className="channel-hash">#</span>
          <h2>{sectionTitle}</h2>
          <div className="topbar-user">
            <span style={{ cursor: 'pointer' }} onClick={onOpenProfile}>{currentUser.displayName || t('common_user')}</span>
          </div>
        </header>

      {tab === 'rooms' && (
        <div className="tab-content">
          <div className="room-actions">
            <button className="btn-primary" onClick={onCreateRoom}>+ {t('home_fab_create')}</button>
            <button className="btn-secondary" onClick={onJoinRoom}>{t('home_fab_join')}</button>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-state">
              <p>{t('home_empty_rooms_title')}</p>
              <p>{t('home_empty_rooms_sub')}</p>
            </div>
          ) : (
            <div className="room-list">
              {rooms.map((room) => (
                <div key={room.id} className="room-card">
                  <div className="room-card-info" onClick={() => onOpenRoom(room.id)}>
                    <div className="room-code">
                      {room.title?.trim() || room.id}
                    </div>
                    <div className="room-url" style={{ fontSize: 11, color: 'var(--text2)' }}>
                      🔑 {room.id}
                    </div>
                    <div className="room-url">{room.videoUrl}</div>
                    {room.scheduledAt > 0 && formatSchedule(room)}
                    <div className="room-meta">
                      {t('home_members_meta', room.memberUids?.length ?? 0)} •{' '}
                      {room.hostUid === currentUser.uid ? t('home_host_badge') : t('home_guest_badge')}
                    </div>
                  </div>
                  <div className="room-card-actions">
                    {room.hostUid === currentUser.uid && (
                      <button
                        className={`btn-icon ${room.discoverable ? 'active-icon' : ''}`}
                        onClick={() => onTogglePublic(room.id, !room.discoverable)}
                        title={room.discoverable ? t('home_public_on') : t('home_public_off')}
                      >{room.discoverable ? '🌍' : '🔒'}</button>
                    )}
                    <button className="btn-icon enter" onClick={() => onOpenRoom(room.id)} title={t('common_enter')}>▶</button>
                    {room.hostUid === currentUser.uid ? (
                      <button
                        className="btn-icon danger"
                        onClick={() => setDeleteConfirm(room.id)}
                        title={t('watch_delete_room')}
                      >🗑</button>
                    ) : (
                      <button
                        className="btn-icon danger"
                        onClick={() => onLeaveRoom(room.id)}
                        title={t('watch_leave_room')}
                      >✖</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'discover' && (
        <div className="tab-content">
          <h3 style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: 12 }}>
            {t('home_discover_section')}
          </h3>
          {publicRooms.length === 0 ? (
            <div className="empty-state">
              <p>{t('home_empty_discover_title')}</p>
              <p>{t('home_empty_discover_sub')}</p>
            </div>
          ) : (
            <div className="room-list">
              {publicRooms.map((room) => {
                const isMember = room.memberUids?.includes(currentUser.uid)
                const isOwn = room.hostUid === currentUser.uid
                return (
                  <div key={room.id} className="room-card">
                    <div className="room-card-info">
                      <div className="room-code">
                        🌍 {room.title?.trim() || room.id}
                        {room.password && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text2)' }}>🔒</span>}
                        {isOwn && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text2)', background: 'rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: 8 }}>{t('home_discover_own_room')}</span>}
                      </div>
                      <div className="room-url" style={{ fontSize: 11, color: 'var(--text2)' }}>🔑 {room.id}</div>
                      <div className="room-url">{room.videoUrl || <span style={{ color:'var(--text2)', fontStyle:'italic' }}>{t('home_no_video')}</span>}</div>
                      {room.scheduledAt > 0 && formatSchedule(room)}
                      <div className="room-meta">
                        {t('home_host_label')} {room.hostName ?? '?'} · {t('home_members_meta', room.memberUids?.length ?? 0)}
                      </div>
                    </div>
                    {isMember ? (
                      <button className="btn-secondary" onClick={() => onOpenRoom(room.id)}>{t('home_enter_btn')}</button>
                    ) : (
                      <button className="btn-primary" onClick={() => {
                        if (room.password) { setPasswordInput(''); setPasswordRoom(room) }
                        else onJoinPublicRoom(room.id)
                      }}>{t('common_join')}</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'dm' && (
        <div className="tab-content">
          <h3 style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: 12 }}>
            {t('home_dm_section')}
          </h3>
          {dmConversations.length === 0 ? (
            <div className="empty-state">
              <p>{t('home_empty_dm_title')}</p>
              <p>{t('home_empty_dm_sub')}</p>
            </div>
          ) : (
            <div className="dm-list">
              {dmConversations.map((conv) => {
                const otherUid = conv.participantUids.find((u) => u !== currentUser.uid) ?? ''
                const otherName = conv.participantNames[otherUid] ?? '?'
                const otherPhoto = conv.participantPhotos?.[otherUid]
                const unread = conv.unreadCount?.[currentUser.uid] ?? 0
                return (
                  <div key={conv.id} className="dm-conv-card" onClick={() => onOpenDm(otherUid)}>
                    <div className="friend-avatar" style={{ flexShrink: 0 }}>
                      {otherPhoto
                        ? <img src={otherPhoto} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                        : (otherName?.[0] ?? '?').toUpperCase()
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="friend-name">{otherName}</div>
                      <div className="dm-last-msg">{conv.lastMessage || t('home_no_messages_yet')}</div>
                    </div>
                    {unread > 0 && <span className="badge">{unread}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'friends' && (
        <div className="tab-content">
          {currentUser.friendCode && (
            <div className="friend-code-hint">
              {t('home_your_id', currentUser.friendCode)}
            </div>
          )}
          <div className="add-friend-bar">
            <input
              type="text"
              placeholder={t('home_friend_search_placeholder')}
              value={friendInput}
              onChange={(e) => setFriendInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
              autoCapitalize="characters"
            />
            <button className="btn-primary" onClick={handleAddFriend}>{t('home_send_friend_request')}</button>
          </div>
          {friendMsg && <div className="info-msg">{friendMsg}</div>}

          {incomingRequests.length > 0 && (
            <div className="requests-section">
              <h3>{t('home_incoming_requests')}</h3>
              {incomingRequests.map((req) => (
                <div key={req.id} className="request-card">
                  <div className="request-info">
                    <span className="request-name">{req.fromName}</span>
                    <span className="request-type">
                      {req.type === 'friend' ? t('home_request_friend') : t('home_request_room_invite')}
                    </span>
                  </div>
                  <div className="request-actions">
                    <button className="btn-accept" onClick={() => onAcceptRequest(req)}>{t('common_accept')}</button>
                    <button className="btn-reject" onClick={() => onRejectRequest(req.id)}>{t('common_reject')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="friends-section">
            <h3>{t('home_friends_count', friends.length)}</h3>
            {friends.length === 0 ? (
              <div className="empty-state">
                <p>{t('home_empty_friends_title')}</p>
                <p>{t('home_empty_friends_sub')}</p>
              </div>
            ) : (
              friends.map((f) => (
                <div key={f.uid} className="friend-card">
                  <div className="friend-avatar">
                    {photoSrc(f.photoBase64)
                      ? <img src={photoSrc(f.photoBase64)!} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      : (f.displayName?.[0] ?? '?').toUpperCase()
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="friend-name">{f.displayName}</div>
                    <div className="friend-email">{f.email}</div>
                  </div>
                  <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => onOpenDm(f.uid)}>
                    💬 {t('home_send_message')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('home_delete_room_title')}</h3>
            <p>{t('home_delete_room_body', deleteConfirm)}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>{t('common_cancel')}</button>
              <button
                className="btn-danger"
                onClick={() => { onDeleteRoom(deleteConfirm); setDeleteConfirm(null) }}
              >
                {t('common_delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordRoom && (
        <div className="modal-overlay" onClick={() => setPasswordRoom(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔒 {t('home_password_room_title')}</h3>
            <p>{t('home_password_room_body', passwordRoom.title?.trim() || passwordRoom.id)}</p>
            <input
              type="password"
              placeholder={t('home_password_placeholder')}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && passwordInput.trim()) {
                  onJoinPublicRoom(passwordRoom!.id, passwordInput.trim())
                  setPasswordRoom(null)
                }
              }}
              autoFocus
              style={{ width: '100%', marginTop: 8, marginBottom: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPasswordRoom(null)}>{t('common_cancel')}</button>
              <button
                className="btn-primary"
                disabled={!passwordInput.trim()}
                onClick={() => { onJoinPublicRoom(passwordRoom!.id, passwordInput.trim()); setPasswordRoom(null) }}
              >
                {t('common_join')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
