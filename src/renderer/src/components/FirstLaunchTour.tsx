import React, { useState } from 'react'
import { useLocale } from '../hooks/useLocale'
import type { LocaleKey } from '../locales/tr'

const STORAGE_KEY = 'wtf_tour_v1_done'

const STEPS: Array<{ icon: string; titleKey: LocaleKey; bodyKey: LocaleKey }> = [
  { icon: '🎬', titleKey: 'tour_1_title', bodyKey: 'tour_1_body' },
  { icon: '🧭', titleKey: 'tour_2_title', bodyKey: 'tour_2_body' },
  { icon: '🔗', titleKey: 'tour_3_title', bodyKey: 'tour_3_body' },
  { icon: '🔊', titleKey: 'tour_4_title', bodyKey: 'tour_4_body' }
]

export function isTourDone(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return true }
}

export function resetTour(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* yut */ }
}

interface Props {
  onDone: () => void
}

export default function FirstLaunchTour({ onDone }: Props) {
  const { t } = useLocale()
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  function finish() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* yut */ }
    onDone()
  }

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="App tour">
      <div className="tour-card">
        <div className="tour-icon">{current.icon}</div>
        <h2 className="tour-title">{t(current.titleKey)}</h2>
        <p className="tour-body">{t(current.bodyKey)}</p>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`tour-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="btn-link tour-skip" onClick={finish}>
            {t('tour_skip')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
          >
            {isLast ? t('tour_start') : t('tour_next')}
          </button>
        </div>
      </div>
    </div>
  )
}
