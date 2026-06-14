export interface User {
  uid: string
  email: string
  displayName: string
  friendIds: string[]
  friendCode?: string
  photoBase64?: string
  bannerBase64?: string
  nameColor?: string
  bio?: string
  lastActive?: number
  blockedIds?: string[]
}

export interface Room {
  id: string
  roomId: string
  hostUid: string
  hostName?: string
  title: string
  videoUrl: string
  isPlaying: boolean
  currentPositionMs: number
  updatedAt: number
  videoVersion: number
  memberUids: string[]
  moderators: string[]
  lastUpdatedBy: string
  // Herkese açık
  discoverable: boolean
  password: string
  maxMembers: number
  // Zamanlama
  scheduledAt: number
  // Presence
  presence: Record<string, number>
  presenceNames: Record<string, string>
  // Yazıyor
  typing: Record<string, number>
  // Emoji tepkisi
  reaction: string
  reactionAt: number
  reactionBy: string
  // Kontrol isteği
  ctrlReqAt: number
  ctrlReqBy: string
  ctrlReqName: string
  ctrlReqAction: string
  // Sabitlenmiş mesaj
  pinnedMessage: string
  pinnedMessageSenderName: string
  // Oylama
  pollQuestion: string
  pollOptions: string[]
  pollVotes: Record<string, number>
  pollVoterChoice: Record<string, number>
  // Ekran paylaşımı
  screenShareUid: string
  // Tıklama yansıtma
  clickSel: string
  clickAt: number
  clickBy: string
  // Paylaşımlı sıra (playlist)
  queue?: QueueItem[]
}

export interface Message {
  id: string
  senderUid: string
  senderName: string
  senderPhoto?: string
  text: string
  timestamp: number
  roomId?: string
  system?: boolean
  reactions?: Record<string, string>
}

export interface Request {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  type: 'friend' | 'room'
  roomId?: string
  timestamp: number
}

export interface DmConversation {
  id: string
  participantUids: string[]
  participantNames: Record<string, string>
  participantPhotos: Record<string, string>
  lastMessage: string
  lastMessageAt: number
  lastSenderUid: string
  unreadCount: Record<string, number>
}

export interface WatchHistory {
  id: string
  videoUrl: string
  roomId: string
  watchedAt: number
}

export interface QueueItem {
  id: string
  url: string
  title: string
  addedBy: string
  addedByName: string
}

export interface YtSearchResult {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
}

export interface ScreenSource {
  id: string
  name: string
  thumbnail: string
}
