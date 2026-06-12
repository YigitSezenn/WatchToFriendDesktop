import React, { useState, useEffect, useRef } from 'react'
import { useLocale } from '../hooks/useLocale'
import type { Message } from '../types'

const EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢']

interface Props {
  messages: Message[]
  myUid: string
  onSend: (text: string) => void | boolean | Promise<void | boolean>
  onTyping?: () => void
  onReaction?: (msgId: string, emoji: string) => void
  searchQuery?: string
  typingLabel?: string | null
}

export default function ChatPanel({
  messages, myUid, onSend, onTyping, onReaction, searchQuery = '', typingLabel
}: Props) {
  const { t } = useLocale()
  const [text, setText] = useState('')
  const [reactionTarget, setReactionTarget] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const msg = text.trim()
    if (!msg) return
    const ok = await Promise.resolve(onSend(msg))
    if (ok !== false) setText('')
  }

  const emptyLines = t('watch_chat_empty').split('\n')

  return (
    <div className="chat-panel">
      <div className="chat-header">{t('watch_chat_header')}</div>
      <div className="chat-messages" onClick={() => setReactionTarget(null)}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, marginTop: 32, opacity: 0.7 }}>
            {emptyLines.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}
        {messages.filter(m => !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg) => {
          if (msg.system) {
            return (
              <div key={msg.id} className="chat-system-msg">{msg.text}</div>
            )
          }
          const isMe = msg.senderUid === myUid
          const reactions: Record<string, string> = msg.reactions ?? {}
          const emojiGroups: Record<string, { count: number; mine: boolean }> = {}
          for (const [uid, emoji] of Object.entries(reactions)) {
            if (!emojiGroups[emoji]) emojiGroups[emoji] = { count: 0, mine: false }
            emojiGroups[emoji].count++
            if (uid === myUid) emojiGroups[emoji].mine = true
          }
          return (
            <div key={msg.id} className={`chat-bubble-wrap ${isMe ? 'me' : 'other'}`}>
              {!isMe && <div className="chat-sender">{msg.senderName}</div>}
              <div
                className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-other'}`}
                onContextMenu={(e) => {
                  if (!onReaction) return
                  e.preventDefault()
                  setReactionTarget(msg.id)
                }}
              >
                {msg.text}
                {Object.keys(emojiGroups).length > 0 && (
                  <div className="dm-reactions">
                    {Object.entries(emojiGroups).map(([emoji, { count, mine }]) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`reaction-chip ${mine ? 'mine' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onReaction?.(msg.id, emoji)
                        }}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
                {reactionTarget === msg.id && onReaction && (
                  <div className={`dm-context ${isMe ? 'ctx-me' : 'ctx-other'}`} onClick={(e) => e.stopPropagation()}>
                    <div className="emoji-row">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="emoji-btn"
                          onClick={() => { onReaction(msg.id, e); setReactionTarget(null) }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {typingLabel && <div className="chat-typing">{typingLabel}</div>}
      <div className="chat-input">
        <input
          type="text"
          placeholder={t('watch_chat_placeholder')}
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping?.() }}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button type="button" className="btn-send" onClick={handleSend}>➤</button>
      </div>
    </div>
  )
}
