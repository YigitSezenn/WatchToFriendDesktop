import { useCallback, useEffect, useState } from 'react'
import { en } from '../locales/en'
import { formatLocale } from '../locales/format'
import { tr, type LocaleKey } from '../locales/tr'
import {
  getLocalePref,
  resolveLocaleTag,
  setLocalePref,
  setNativeSystemLocale,
  type AppLocale
} from '../utils/localePref'

export function dateLocaleTag(locale: 'tr' | 'en'): string {
  return locale === 'en' ? 'en-US' : 'tr-TR'
}

export function useLocale() {
  const [locale, setLocaleState] = useState<'tr' | 'en'>(resolveLocaleTag)
  const [pref, setPrefState] = useState<AppLocale>(() => getLocalePref())

  useEffect(() => {
    const refresh = () => {
      setPrefState(getLocalePref())
      setLocaleState(resolveLocaleTag())
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('wtf-locale-changed', refresh)

    const api = (window as {
      electronAPI?: {
        getSystemLocale?: () => Promise<string>
        onSystemLocaleChanged?: (cb: (loc: string) => void) => () => void
      }
    }).electronAPI

    let unsubLocale: (() => void) | undefined
    if (api?.getSystemLocale) {
      void api.getSystemLocale().then((loc) => setNativeSystemLocale(loc))
    }
    if (api?.onSystemLocaleChanged) {
      unsubLocale = api.onSystemLocaleChanged((loc) => setNativeSystemLocale(loc))
    }

    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('wtf-locale-changed', refresh)
      unsubLocale?.()
    }
  }, [])

  const t = useCallback((key: LocaleKey, ...args: (string | number)[]): string => {
    const raw = (locale === 'en' ? en : tr)[key]
    return args.length ? formatLocale(raw, ...args) : raw
  }, [locale])

  const dateLocale = dateLocaleTag(locale)

  function setLocale(next: AppLocale) {
    setLocalePref(next)
    setPrefState(next)
    setLocaleState(resolveLocaleTag())
    window.dispatchEvent(new Event('wtf-locale-changed'))
  }

  return { locale, dateLocale, pref, t, setLocale }
}
