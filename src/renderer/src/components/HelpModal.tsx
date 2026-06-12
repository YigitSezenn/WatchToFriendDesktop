import React from 'react'
import type { LocaleKey } from '../locales/tr'

interface Props {
  t: (key: LocaleKey) => string
  onClose: () => void
}

const FAQ_KEYS: Array<[LocaleKey, LocaleKey]> = [
  ['help_q1', 'help_a1'],
  ['help_q2', 'help_a2'],
  ['help_q3', 'help_a3'],
  ['help_q4', 'help_a4'],
  ['help_q5', 'help_a5'],
  ['help_q6', 'help_a6']
]

export default function HelpModal({ t, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{t('help_title')}</h2>
        <div className="help-faq-list">
          {FAQ_KEYS.map(([q, a]) => (
            <div key={q} className="help-faq-item">
              <div className="help-faq-q">{t(q)}</div>
              <div className="help-faq-a">{t(a)}</div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          {t('help_close')}
        </button>
      </div>
    </div>
  )
}
