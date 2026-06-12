import React, { useState } from 'react'
import { useLocale } from '../../hooks/useLocale'
import type { YtSearchResult } from '../../types'
import { searchYouTube } from '../../utils/youtubeSearch'

type Tab = 'search' | 'link'

interface Props {
  onClose: () => void
  onChangeUrl: (url: string) => void | Promise<void>
}

export default function VideoChangeModal({ onClose, onChangeUrl }: Props) {
  const { t } = useLocale()
  const [tab, setTab] = useState<Tab>('search')
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
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  async function applyUrl(url: string) {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) return
    await onChangeUrl(trimmed)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal queue-modal" onClick={e => e.stopPropagation()}>
        <h3>🔗 {t('watch_change_video')}</h3>
        <p className="queue-modal__sub">{t('watch_change_video_sub')}</p>

        <div className="queue-modal__tabs" style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
          <button
            type="button"
            className={tab === 'search' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}
            onClick={() => setTab('search')}
          >
            🔍 {t('common_search')}
          </button>
          <button
            type="button"
            className={tab === 'link' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}
            onClick={() => setTab('link')}
          >
            🔗 {t('video_url_placeholder')}
          </button>
        </div>

        {tab === 'link' && (
          <>
            <div className="form-group">
              <input
                type="url"
                placeholder={t('video_url_ph')}
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && urlInput.trim()) {
                    void runAction(() => applyUrl(urlInput))
                  }
                }}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common_cancel')}</button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !urlInput.trim()}
                onClick={() => void runAction(() => applyUrl(urlInput))}
              >
                {t('common_change')}
              </button>
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="queue-modal__search-row">
              <input
                type="search"
                placeholder={t('video_search_ph')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSearch()}
                autoFocus
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={searching || !searchQuery.trim()}
                onClick={() => void handleSearch()}
              >
                {searching ? '…' : t('common_search')}
              </button>
            </div>
            {results.length > 0 && (
              <div className="queue-modal__results" style={{ maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
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
                      onClick={() => void runAction(() => applyUrl(`https://www.youtube.com/watch?v=${r.videoId}`))}
                    >
                      {t('common_play_now')}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common_cancel')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
