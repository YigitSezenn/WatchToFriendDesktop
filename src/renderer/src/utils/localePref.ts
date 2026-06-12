export type AppLocale = 'system' | 'tr' | 'en'

const KEY = 'wtf_locale'
/** Electron app.getLocale() — Windows sistem dili */
let nativeSystemLocale: string | null = null

export function setNativeSystemLocale(tag: string): void {
  nativeSystemLocale = tag
  if (getLocalePref() === 'system') {
    window.dispatchEvent(new Event('wtf-locale-changed'))
  }
}

export function getLocalePref(): AppLocale {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'tr' || v === 'en' || v === 'system') return v
  } catch { /* yut */ }
  return 'system'
}

export function setLocalePref(locale: AppLocale): void {
  try { localStorage.setItem(KEY, locale) } catch { /* yut */ }
}

function tagFromLanguage(lang: string): 'tr' | 'en' {
  const l = lang.toLowerCase()
  return l.startsWith('tr') ? 'tr' : 'en'
}

function resolveSystemLocaleTag(): 'tr' | 'en' {
  if (nativeSystemLocale) return tagFromLanguage(nativeSystemLocale)
  for (const lang of navigator.languages ?? []) {
    if (lang.toLowerCase().startsWith('tr')) return 'tr'
  }
  return tagFromLanguage(navigator.language || 'en')
}

export function resolveLocaleTag(): 'tr' | 'en' {
  const pref = getLocalePref()
  if (pref === 'tr' || pref === 'en') return pref
  return resolveSystemLocaleTag()
}
