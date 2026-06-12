import React, { useState } from 'react'
import { useLocale } from '../../hooks/useLocale'
import type { QueueItem, YtSearchResult } from '../../types'
import { searchYouTube } from '../../utils/youtubeSearch'

interface Props {
  queue: QueueItem[]
  canControl: boolean
  myUid: string
  onClose: () => void
  onAddUrl: (url: string) => void | Promise<void>
  onAddResult: (r: YtSearchResult) => void | Promise<void>
  onPlayItem: (item: QueueItem) => void | Promise<void>
  onRemoveItem: (item: QueueItem) => void | Promise<void>
}

export default function QueueModal({
  queue, canControl, myUid, onClose,
  onAddUrl, onAddResult, onPlayItem, onRemoveItem
}: Props) {
  const { t } = useLocale()
  const [showAdd, setShowAdd] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<YtSearchResult[]>([])
  const [busy, setBusy] = useState(false)

  async function handleSearch() {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setResults(await searchYouTube(q))
    setSearching(false)
  }

  async function runAction(fn: () => void | Promise<void>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const queueTitle = queue.length > 0 ? t('video_queue_title_count', queue.length) : t('video_queue_title')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal queue-modal" onClick={e => e.stopPropagation()}>
        <div className="queue-modal__head">
          <h3>📋 {queueTitle}</h3>
          <button type="button" className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setShowAdd(v => !v)}>
            {showAdd ? t('common_close') : `+ ${t('common_add')}`}
          </button>
        </div>

        {showAdd && (
          <div className="queue-modal__add">
            <div className="form-group">
              <input
                type="url"
                placeholder={t('video_url_placeholder')}
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && urlInput.trim()) {
                    void runAction(async () => {
                      await onAddUrl(urlInput.trim())
                      setUrlInput('')
                    })
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginBottom: 12 }}
              disabled={busy || !urlInput.trim()}
              onClick={() => void runAction(async () => {
                await onAddUrl(urlInput.trim())
                setUrlInput('')
              })}
            >
              {t('video_queue_add')}
            </button>
            <div className="queue-modal__search-row">
              <input
                type="search"
                placeholder={t('video_search_ph')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSearch()}
              />
              <button type="button" className="btn-secondary" disabled={searching || !searchQuery.trim()} onClick={() => void handleSearch()}>
                {searching ? '…' : t('common_search')}
              </button>
            </div>
            {results.length > 0 && (
              <div className="queue-modal__results">
                {results.map(r => (
                  <div key={r.videoId} className="queue-modal__result">
                    {r.thumbnailUrl && <img src={r.thumbnailUrl} alt="" />}
                    <div className="queue-modal__result-info">
                      <div className="queue-modal__result-title">{r.title}</div>
                      <div className="queue-modal__result-channel">{r.channelTitle}</div>
                    </div>
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busy}
                      onClick={() => void runAction(() => onAddResult(r))}
                    >
                      {t('video_add_queue_short')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {queue.length === 0 ? (
          <div className="queue-modal__empty">
            <p>{t('video_queue_empty')}</p>
            <p className="queue-modal__empty-sub">{t('video_queue_empty_sub')}</p>
          </div>
        ) : (
          <div className="queue-modal__list">
            {queue.map((item, idx) => {
              const canRemove = canControl || item.addedBy === myUid
              return (
                <div key={item.id || `${item.url}-${idx}`} className="queue-modal__item">
                  <span className="queue-modal__index">{idx + 1}</span>
                  <div className="queue-modal__item-body">
                    <div className="queue-modal__item-title">{(item.title || item.url).slice(0, 60)}</div>
                    <div className="queue-modal__item-meta">{item.addedByName || '?'}</div>
                  </div>
                  {canControl && (
                    <button type="button" className="queue-modal__play" title={t('common_play_now')} onClick={() => void runAction(() => onPlayItem(item))}>
                      ▶
                    </button>
                  )}
                  {canRemove && (
                    <button type="button" className="queue-modal__remove" title={t('common_remove')} onClick={() => void runAction(() => onRemoveItem(item))}>
                      🗑
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          {t('common_close')}
        </button>
      </div>
    </div>
  )
}
