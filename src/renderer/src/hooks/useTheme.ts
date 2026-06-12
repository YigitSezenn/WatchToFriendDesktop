import { useEffect, useState } from 'react'
import {
  applyTheme,
  getThemeMode,
  setNativeSystemDark,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode
} from '../utils/themePref'

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode())

  useEffect(() => {
    applyTheme(mode)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => {
      if (getThemeMode() !== 0) return
      applyTheme(0)
    }
    mq.addEventListener('change', onMq)

    const api = (window as {
      electronAPI?: {
        getSystemDark?: () => Promise<boolean>
        onSystemThemeChanged?: (cb: (dark: boolean) => void) => () => void
      }
    }).electronAPI

    let unsubNative: (() => void) | undefined
    if (api?.getSystemDark) {
      void api.getSystemDark().then((dark) => setNativeSystemDark(dark))
    }
    if (api?.onSystemThemeChanged) {
      unsubNative = api.onSystemThemeChanged((dark) => setNativeSystemDark(dark))
    }

    return () => {
      mq.removeEventListener('change', onMq)
      unsubNative?.()
    }
  }, [mode])

  useEffect(() => subscribeThemeMode(setMode), [])

  return {
    mode,
    setMode: (m: ThemeMode) => setThemeMode(m)
  }
}
