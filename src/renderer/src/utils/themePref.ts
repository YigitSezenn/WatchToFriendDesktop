export type ThemeMode = 0 | 1 | 2 // 0 = sistem, 1 = açık, 2 = koyu

const STORAGE_KEY = 'wtf_theme_mode'
const listeners = new Set<(mode: ThemeMode) => void>()
/** Electron nativeTheme — Windows'ta matchMedia yerine bunu kullan */
let nativeSystemDark: boolean | null = null

export function setNativeSystemDark(dark: boolean): void {
  nativeSystemDark = dark
  if (getThemeMode() === 0) applyTheme(0)
}

export function getThemeMode(): ThemeMode {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY) ?? '2', 10)
    if (v === 0 || v === 1 || v === 2) return v
  } catch { /* yut */ }
  return 2
}

export function isDarkResolved(mode: ThemeMode): boolean {
  if (mode === 1) return false
  if (mode === 2) return true
  if (nativeSystemDark !== null) return nativeSystemDark
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(mode: ThemeMode): void {
  const dark = isDarkResolved(mode)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setThemeMode(mode: ThemeMode): void {
  try { localStorage.setItem(STORAGE_KEY, String(mode)) } catch { /* yut */ }
  applyTheme(mode)
  listeners.forEach((fn) => fn(mode))
}

export function subscribeThemeMode(fn: (mode: ThemeMode) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** FOUC önleme — index.html inline script ile de çağrılır */
export function initTheme(): void {
  applyTheme(getThemeMode())
}
