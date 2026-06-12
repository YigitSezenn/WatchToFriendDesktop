import { useCallback, useEffect, useState } from 'react'
import { dateLocaleTag } from './useLocale'
import { translate } from '../locales/translate'
import { resolveLocaleTag } from '../utils/localePref'
import { collection, getDocs, getCountFromServer } from 'firebase/firestore'
import { ref, get } from 'firebase/database'
import { db, rtdb } from '../firebase/config'

export interface AdminUserRow {
  uid: string
  displayName: string
  email: string
  friendCount: number
  lastActive: number
  online: boolean
}

export interface AdminRoomRow {
  id: string
  title: string
  hostUid: string
  activeUsers: number
  memberCount: number
  hasVideo: boolean
  isSharing: boolean
  voiceCount: number
  createdAt: number
}

export interface AdminStats {
  totalUsers: number
  totalRooms: number
  activeUsers: number
  activeRooms: number
  sharingCount: number
  dmCount: number
  reportCount: number
  rtdbNodes: number
  users: AdminUserRow[]
  rooms: AdminRoomRow[]
  lastRefresh: string
  error: string | null
}

const EMPTY: AdminStats = {
  totalUsers: 0,
  totalRooms: 0,
  activeUsers: 0,
  activeRooms: 0,
  sharingCount: 0,
  dmCount: 0,
  reportCount: 0,
  rtdbNodes: 0,
  users: [],
  rooms: [],
  lastRefresh: '',
  error: null
}

export function useAdminStats(enabled: boolean) {
  const [stats, setStats] = useState<AdminStats>(EMPTY)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const now = Date.now()
      const [userSnap, roomSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'rooms'))
      ])

      let dmCount = 0
      try {
        const dmSnap = await getDocs(collection(db, 'dms'))
        dmCount = dmSnap.size
      } catch {
        dmCount = -1
      }

      let reportCount = 0
      try {
        const reportCountSnap = await getCountFromServer(collection(db, 'reports'))
        reportCount = reportCountSnap.data().count
      } catch {
        reportCount = -1
      }

      let rtdbNodes = 0
      try {
        const rtdbSnap = await get(ref(rtdb, 'screenShare'))
        rtdbNodes = rtdbSnap.exists() ? Object.keys(rtdbSnap.val() as object).length : 0
      } catch {
        rtdbNodes = -1
      }

      const users: AdminUserRow[] = userSnap.docs.map((d) => {
        const data = d.data()
        const lastActive = (data.lastActive as number | undefined) ?? 0
        return {
          uid: d.id,
          displayName: (data.displayName as string) || '—',
          email: (data.email as string) || '—',
          friendCount: ((data.friendIds as string[] | undefined) ?? []).length,
          lastActive,
          online: lastActive > 0 && now - lastActive < 5 * 60_000
        }
      }).sort((a, b) => b.lastActive - a.lastActive)

      const rooms: AdminRoomRow[] = await Promise.all(
        roomSnap.docs.map(async (doc) => {
          const data = doc.data()
          const presence = (data.presence as Record<string, number> | undefined) ?? {}
          const activeUsers = Object.values(presence).filter((ts) => now - ts < 60_000).length
          const memberUids = (data.memberUids as string[] | undefined) ?? []
          let voiceCount = 0
          if (activeUsers > 0) {
            try {
              const voiceSnap = await getDocs(collection(db, 'rooms', doc.id, 'voicePeers'))
              voiceCount = voiceSnap.size
            } catch { /* ignore */ }
          }
          return {
            id: doc.id,
            title: (data.title as string) || doc.id,
            hostUid: (data.hostUid as string) || '',
            activeUsers,
            memberCount: memberUids.length,
            hasVideo: Boolean((data.videoUrl as string | undefined)?.trim()),
            isSharing: Boolean((data.screenShareUid as string | undefined)?.trim()),
            voiceCount,
            createdAt: (data.createdAt as number | undefined) ?? 0
          }
        })
      )

      rooms.sort((a, b) => b.activeUsers - a.activeUsers || b.memberCount - a.memberCount)

      const activeUsers = rooms.reduce((s, r) => s + r.activeUsers, 0)
      const activeRooms = rooms.filter((r) => r.activeUsers > 0).length
      const sharingCount = rooms.filter((r) => r.isSharing).length
      setStats({
        totalUsers: users.length,
        totalRooms: rooms.length,
        activeUsers,
        activeRooms,
        sharingCount,
        dmCount,
        reportCount,
        rtdbNodes,
        users,
        rooms,
        lastRefresh: new Date().toLocaleTimeString(dateLocaleTag(resolveLocaleTag())),
        error: null
      })
    } catch (e) {
      setStats((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : translate('admin_load_failed'),
        lastRefresh: new Date().toLocaleTimeString(dateLocaleTag(resolveLocaleTag()))
      }))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [enabled, refresh])

  return { stats, loading, refresh }
}
