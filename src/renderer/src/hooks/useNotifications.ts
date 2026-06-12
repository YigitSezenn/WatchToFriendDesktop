import { useEffect, useRef } from 'react'
import {
  collection, limit, onSnapshot, orderBy, query
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { translate } from '../locales/translate'
import { badgeNumber } from '../utils/formatBadge'
import { resolveDmId } from '../utils/dmId'
import type { DmConversation, Request, Room } from '../types'

export type NotifScreen = 'home' | 'create' | 'join' | 'watch' | 'dm' | 'admin'

export interface NotificationNavigateAction {
  type: 'friend' | 'room_invite' | 'dm' | 'room_message'
  roomId?: string
  dmId?: string
  friendUid?: string
  homeTab?: 'friends' | 'dm'
}

interface NotificationAPI {
  show: (payload: { title: string; body: string; data: NotificationNavigateAction }) => Promise<boolean>
  setBadge: (count: number) => Promise<number>
  onClick: (cb: (data: NotificationNavigateAction) => void) => () => void
}

function getNotificationApi(): NotificationAPI | null {
  return (window as { electronAPI?: { notifications?: NotificationAPI } }).electronAPI?.notifications ?? null
}

function shouldSuppressDm(screen: NotifScreen, activeDmId: string | null, dmId: string): boolean {
  return screen === 'dm' && activeDmId === dmId
}

function shouldSuppressRoom(screen: NotifScreen, activeRoomId: string | null, roomId: string): boolean {
  return screen === 'watch' && activeRoomId === roomId
}

async function showNotification(
  title: string,
  body: string,
  data: NotificationNavigateAction
): Promise<void> {
  const api = getNotificationApi()
  if (api) {
    await api.show({ title, body, data }).catch(() => {})
    return
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const n = new Notification(title, { body })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  }
}

export function useNotifications(opts: {
  uid: string
  screen: NotifScreen
  activeRoomId: string | null
  activeDmId: string | null
  conversations: DmConversation[]
  incomingRequests: Request[]
  rooms: Room[]
  totalUnread: number
  pendingCount: number
  onNavigate: (action: NotificationNavigateAction) => void
}) {
  const onNavigateRef = useRef(opts.onNavigate)
  onNavigateRef.current = opts.onNavigate

  const seenRequestIds = useRef<Set<string>>(new Set())
  const requestsInitial = useRef(true)
  const lastDmMsgTs = useRef<Map<string, number>>(new Map())
  const dmMsgSeeded = useRef<Set<string>>(new Set())
  const lastRoomMsgTs = useRef<Map<string, number>>(new Map())
  const roomMsgSeeded = useRef<Set<string>>(new Set())

  // Rozet — okunmamış DM + bekleyen istek (mobil rail toplamı)
  useEffect(() => {
    const badge = badgeNumber(opts.totalUnread + opts.pendingCount)
    getNotificationApi()?.setBadge(badge).catch(() => {})
  }, [opts.totalUnread, opts.pendingCount])

  // Bildirime tıklanınca yönlendir
  useEffect(() => {
    const api = getNotificationApi()
    if (!api) return
    return api.onClick((data) => onNavigateRef.current(data))
  }, [])

  // Arkadaşlık / oda daveti
  useEffect(() => {
    if (!opts.uid) return
    if (requestsInitial.current) {
      seenRequestIds.current = new Set(opts.incomingRequests.map((r) => r.id))
      requestsInitial.current = false
      return
    }
    for (const req of opts.incomingRequests) {
      if (seenRequestIds.current.has(req.id)) continue
      seenRequestIds.current.add(req.id)
      if (req.type === 'friend') {
        void showNotification(
          translate('notif_friend_request'),
          translate('notif_friend_request_body', req.fromName),
          { type: 'friend', homeTab: 'friends' }
        )
      } else if (req.type === 'room') {
        void showNotification(
          translate('notif_room_invite'),
          translate('notif_room_invite_body', req.fromName),
          { type: 'room_invite', roomId: req.roomId, homeTab: 'friends' }
        )
      }
    }
  }, [opts.incomingRequests, opts.uid])

  // Özel mesaj — son mesaj dinleyicisi (oda sohbeti ile aynı; unreadCount tek başına güvenilir değil)
  useEffect(() => {
    if (!opts.uid) {
      dmMsgSeeded.current.clear()
      lastDmMsgTs.current.clear()
      return
    }
    if (opts.conversations.length === 0) return

    const unsubs = opts.conversations.map((conv) => {
      const convId = resolveDmId(conv, opts.uid)
      if (!convId) return () => {}

      const q = query(
        collection(db, 'dms', convId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
      return onSnapshot(q, (snap) => {
        const doc = snap.docs[0]
        if (!doc) return
        const data = doc.data()
        const ts = Number(data.timestamp ?? 0)
        const senderUid = String(data.senderUid ?? '')

        if (!dmMsgSeeded.current.has(convId)) {
          dmMsgSeeded.current.add(convId)
          lastDmMsgTs.current.set(convId, ts)
          return
        }

        const lastSeen = lastDmMsgTs.current.get(convId) ?? 0
        if (!senderUid || senderUid === opts.uid || ts <= lastSeen) {
          lastDmMsgTs.current.set(convId, ts)
          return
        }
        if (shouldSuppressDm(opts.screen, opts.activeDmId, convId)) {
          lastDmMsgTs.current.set(convId, ts)
          return
        }

        const otherUid = conv.participantUids.find((u) => u !== opts.uid) ?? senderUid
        const name = String(data.senderName ?? conv.participantNames[senderUid] ?? translate('common_someone'))
        const preview = String(data.text ?? conv.lastMessage ?? translate('notif_new_message')).slice(0, 100)
        void showNotification(name, preview, {
          type: 'dm',
          dmId: convId,
          friendUid: otherUid,
          homeTab: 'dm'
        })
        lastDmMsgTs.current.set(convId, ts)
      }, () => {})
    })

    return () => unsubs.forEach((u) => u())
  }, [opts.conversations, opts.uid, opts.screen, opts.activeDmId])

  // Oda sohbet mesajları — son mesaj dinleyicisi (mobil NotificationWorker parity)
  useEffect(() => {
    if (!opts.uid || opts.rooms.length === 0) return

    const unsubs = opts.rooms.map((room) => {
      const q = query(
        collection(db, 'rooms', room.id, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
      return onSnapshot(q, (snap) => {
        const doc = snap.docs[0]
        if (!doc) return
        const data = doc.data()
        const ts = Number(data.timestamp ?? 0)
        const senderUid = String(data.senderUid ?? '')
        const system = Boolean(data.system)

        if (!roomMsgSeeded.current.has(room.id)) {
          roomMsgSeeded.current.add(room.id)
          lastRoomMsgTs.current.set(room.id, ts)
          return
        }

        const lastSeen = lastRoomMsgTs.current.get(room.id) ?? 0
        if (system || senderUid === opts.uid || ts <= lastSeen) {
          lastRoomMsgTs.current.set(room.id, ts)
          return
        }
        if (shouldSuppressRoom(opts.screen, opts.activeRoomId, room.id)) {
          lastRoomMsgTs.current.set(room.id, ts)
          return
        }

        const senderName = String(data.senderName ?? translate('common_someone'))
        const text = String(data.text ?? '').slice(0, 120)
        const title = room.title || translate('notif_room_default')
        void showNotification(title, `${senderName}: ${text}`, {
          type: 'room_message',
          roomId: room.id
        })
        lastRoomMsgTs.current.set(room.id, ts)
      }, () => {})
    })

    return () => unsubs.forEach((u) => u())
  }, [opts.rooms, opts.uid, opts.screen, opts.activeRoomId])
}
