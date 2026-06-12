import React, { useState, useEffect, useRef } from 'react'
import { useLocale } from '../hooks/useLocale'
import type { Message } from '../types'

const EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢']

interface Props {
  dmId: string
  otherName: string
  myUid: string
  messages: Message[]
  onSend: (text: string) => void | boolean | Promise<void | boolean>
  onDelete: (msgId: string) => void
  onReaction: (msgId: string, emoji: string) => void
  onClearUnread: () => void
  onBack: () => void
}

export default function DmScreen({
  dmId, otherName, myUid, messages,
  onSend, onDelete, onReaction, onClearUnread, onBack
}: Props) {
  const { t } = useLocale()
  const [text, setText] = useState('')
  const [reactionTarget, setReactionTarget] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onClearUnread()
  }, [dmId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const msg = text.trim()
    if (!msg) return
    const ok = await Promise.resolve(onSend(msg))
    if (ok !== false) setText('')
  }

  return (
    <div className="dm-screen">
      <div className="dm-topbar">
        <button className="btn-back" onClick={onBack}>← {t('common_back')}</button>
        <div className="dm-other-name">{otherName}</div>
      </div>

      <div className="dm-messages" onClick={() => setReactionTarget(null)}>
        {messages.length === 0 && (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <p>{t('dm_empty_title')}</p>
            <p>{t('dm_empty_sub', otherName)}</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderUid === myUid
          const reactions: Record<string, string> = (msg as { reactions?: Record<string, string> }).reactions ?? {}
          const emojiGroups: Record<string, { count: number; mine: boolean }> = {}
          for (const [uid, emoji] of Object.entries(reactions)) {
            if (!emojiGroups[emoji]) emojiGroups[emoji] = { count: 0, mine: false }
            emojiGroups[emoji].count++
            if (uid === myUid) emojiGroups[emoji].mine = true
          }
          return (
            <div key={msg.id} className={`dm-bubble-wrap ${isMe ? 'me' : 'other'}`}>
              {!isMe && <div className="chat-sender">{msg.senderName}</div>}
              <div
                className={`dm-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`}
                onContextMenu={(e) => { e.preventDefault(); setReactionTarget(msg.id) }}
              >
                {msg.text}

                {Object.keys(emojiGroups).length > 0 && (
                  <div className="dm-reactions">
                    {Object.entries(emojiGroups).map(([emoji, { count, mine }]) => (
                      <button
                        key={emoji}
                        className={`reaction-chip ${mine ? 'mine' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onReaction(msg.id, emoji) }}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}

                {reactionTarget === msg.id && (
                  <div className={`dm-context ${isMe ? 'ctx-me' : 'ctx-other'}`} onClick={(e) => e.stopPropagation()}>
                    <div className="emoji-row">
                      {EMOJIS.map((e) => (
                        <button key={e} className="emoji-btn" onClick={() => { onReaction(msg.id, e); setReactionTarget(null) }}>{e}</button>
                      ))}
                    </div>
                    {isMe && (
                      <button className="ctx-delete" onClick={() => { onDelete(msg.id); setReactionTarget(null) }}>{t('dm_delete')}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="dm-input">
        <input
          type="text"
          placeholder={t('dm_input_placeholder', otherName)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          autoFocus
        />
        <button className="btn-send" onClick={handleSend}>➤</button>
      </div>
    </div>
  )
}
