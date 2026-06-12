import React from 'react'
import { useLocale } from '../../hooks/useLocale'
import type { Room } from '../../types'

interface Props {
  room: Room
  myUid: string
  isHost: boolean
  onVote: (optionIndex: number) => void
  onClear: () => void
}

export default function PollPanel({ room, myUid, isHost, onVote, onClear }: Props) {
  const { t } = useLocale()
  const question = room.pollQuestion?.trim()
  if (!question) return null

  const options = room.pollOptions ?? []
  const pollVotes = room.pollVotes ?? {}
  const myVote = room.pollVoterChoice?.[myUid]
  const totalVotes = Math.max(1, Object.values(pollVotes).reduce((s, n) => s + n, 0))

  return (
    <div className="poll-panel">
      <div className="poll-panel__head">
        <span className="poll-panel__label">{t('watch_poll')}</span>
        {isHost && (
          <button type="button" className="poll-panel__close" onClick={onClear} title={t('watch_poll_end')}>
            ✕
          </button>
        )}
      </div>
      <p className="poll-panel__question">{question}</p>
      <div className="poll-panel__options">
        {options.map((opt, idx) => {
          const votes = pollVotes[String(idx)] ?? 0
          const pct = Math.round((votes * 100) / totalVotes)
          const selected = myVote === idx
          return (
            <button
              key={idx}
              type="button"
              className={`poll-panel__option${selected ? ' poll-panel__option--selected' : ''}`}
              onClick={() => onVote(idx)}
            >
              <span className="poll-panel__option-text">{opt}</span>
              <span className="poll-panel__option-votes">{votes} ({pct}%)</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
