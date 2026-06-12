import React, { useEffect, useState } from 'react'
import { useLocale } from '../hooks/useLocale'

interface Source {
  id: string
  name: string
  thumbnail: string
  isScreen?: boolean
}

interface Props {
  onSelect: (sourceId: string) => void
  onCancel: () => void
}

export default function SourcePickerModal({ onSelect, onCancel }: Props) {
  const { t } = useLocale()
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)
  const [tab, setTab] = useState<'screen' | 'window'>('screen')

  function loadSources() {
    setLoading(true)
    ;(window as { electronAPI?: { getSources: () => Promise<Source[]> } }).electronAPI?.getSources().then((srcs: Source[]) => {
      setSources(srcs)
      setLoading(false)
    })
  }

  useEffect(() => { loadSources() }, [])

  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => s.id.startsWith('window:'))
  const list = tab === 'screen' ? screens : windows

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="source-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="source-picker-header">
          <h3>{t('screen_picker_title')}</h3>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button className="btn-secondary" style={{ padding:'4px 10px', fontSize:12 }} onClick={loadSources} title={t('common_refresh')}>↻ {t('common_refresh')}</button>
            <button className="btn-icon" onClick={onCancel}>✕</button>
          </div>
        </div>

        <div className="source-picker-tabs">
          <button
            className={`source-tab ${tab === 'screen' ? 'active' : ''}`}
            onClick={() => setTab('screen')}
          >
            🖥️ {t('screen_picker_screens')} ({screens.length})
          </button>
          <button
            className={`source-tab ${tab === 'window' ? 'active' : ''}`}
            onClick={() => setTab('window')}
          >
            🪟 {t('screen_picker_windows')} ({windows.length})
          </button>
        </div>

        {loading ? (
          <div className="source-picker-loading">
            <div className="spinner" />
            <p>{t('screen_picker_loading')}</p>
          </div>
        ) : list.length === 0 ? (
          <div className="source-picker-loading">
            <p>{t('screen_picker_not_found')}</p>
            {tab === 'window' && (
              <p style={{ fontSize:12, color:'var(--text2)', marginTop:8, textAlign:'center' }}>
                {t('screen_picker_refresh_hint')}
              </p>
            )}
          </div>
        ) : (
          <div className="source-picker-grid">
            {list.map((src) => (
              <button
                key={src.id}
                className={`source-card ${hovered === src.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHovered(src.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(src.id)}
              >
                <div className="source-thumb">
                  {src.thumbnail ? (
                    <img src={src.thumbnail} alt={src.name} />
                  ) : (
                    <div className="source-thumb-empty">📺</div>
                  )}
                </div>
                <div className="source-name" title={src.name}>{src.name}</div>
              </button>
            ))}
          </div>
        )}

        <div className="source-picker-footer">
          <button className="btn-secondary" onClick={onCancel}>{t('common_cancel')}</button>
        </div>
      </div>
    </div>
  )
}
