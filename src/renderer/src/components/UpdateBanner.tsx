import React from 'react'
import type { AppUpdateInfo } from '../hooks/useAppUpdate'
import type { LocaleKey } from '../locales/tr'

type Props = {
  update: AppUpdateInfo
  t: (key: LocaleKey, ...args: (string | number)[]) => string
  onDownload: () => void
  onDismiss: () => void
}

export default function UpdateBanner({ update, t, onDownload, onDismiss }: Props) {
  return (
    <div className="app-update-banner" role="status">
      <div className="app-update-banner__content">
        <span className="app-update-banner__icon" aria-hidden>⬆</span>
        <div className="app-update-banner__text">
          <strong>{t('update_available_title', update.version)}</strong>
          <span>{t('update_available_body')}</span>
        </div>
      </div>
      <div className="app-update-banner__actions">
        <button type="button" className="btn-primary btn-sm" onClick={onDownload}>
          {t('update_download')}
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onDismiss}>
          {t('update_later')}
        </button>
      </div>
    </div>
  )
}
