import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

export interface YtViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface YtViewEvent {
  type: 'YT_READY' | 'YT_STATE' | 'YT_ERROR'
  state?: number
  time?: number
  code?: number
}

interface YtViewAPI {
  show: (url: string, bounds: YtViewBounds) => Promise<void>
  hide: () => Promise<void>
  setBounds: (bounds: YtViewBounds) => Promise<void>
  sendCmd: (cmd: { cmd: 'play' | 'pause' | 'seek'; pos: number }) => Promise<void>
  reload: (url: string) => Promise<void>
  onEvent: (cb: (data: YtViewEvent) => void) => () => void
}

function getYtViewApi(): YtViewAPI | null {
  return (window as { electronAPI?: { ytView?: YtViewAPI } }).electronAPI?.ytView ?? null
}

function measureBounds(el: HTMLElement): YtViewBounds {
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

export function isYtBrowserViewAvailable(): boolean {
  return getYtViewApi() != null
}

/** Menü/modal açılmadan önce senkron gizleme (BrowserView native katman). */
export function hideYtBrowserViewNow(): void {
  getYtViewApi()?.hide().catch(() => {})
}

export function useYtBrowserView(opts: {
  active: boolean
  url: string | null
  slotRef: React.RefObject<HTMLElement | null>
  onEvent: (event: YtViewEvent) => void
}) {
  const api = getYtViewApi()
  const visibleRef = useRef(false)
  const urlRef = useRef<string | null>(null)
  const showGenRef = useRef(0)
  const activeRef = useRef(opts.active)
  activeRef.current = opts.active
  const onEventRef = useRef(opts.onEvent)
  onEventRef.current = opts.onEvent

  const syncBounds = useCallback(() => {
    const el = opts.slotRef.current
    if (!api || !visibleRef.current || !el) return
    const bounds = measureBounds(el)
    if (bounds.width < 2 || bounds.height < 2) return
    api.setBounds(bounds).catch(() => {})
  }, [api, opts.slotRef])

  const postCmd = useCallback((cmd: 'play' | 'pause' | 'seek', pos: number) => {
    if (!api) return
    api.sendCmd({ cmd, pos }).catch(() => {})
  }, [api])

  const hideView = useCallback(() => {
    if (!api) return
    showGenRef.current += 1
    visibleRef.current = false
    urlRef.current = null
    api.hide().catch(() => {})
  }, [api])

  // Gizleme paint'ten önce — pencere modunda menü tıklanabilirliği
  useLayoutEffect(() => {
    if (!api) return
    const el = opts.slotRef.current
    const shouldShow = opts.active && !!opts.url && !!el
    if (!shouldShow) {
      if (visibleRef.current) hideView()
      return
    }

    const bounds = measureBounds(el)
    if (bounds.width < 2 || bounds.height < 2) return

    const gen = showGenRef.current
    const show = async () => {
      await api.show(opts.url!, bounds)
      if (gen !== showGenRef.current || !activeRef.current) {
        api.hide().catch(() => {})
        return
      }
      visibleRef.current = true
      urlRef.current = opts.url
    }

    if (!visibleRef.current) {
      show().catch(() => {})
    } else if (urlRef.current !== opts.url) {
      urlRef.current = opts.url
      api.reload(opts.url!).catch(() => {})
      syncBounds()
    } else {
      syncBounds()
    }
  }, [api, opts.active, opts.url, opts.slotRef, syncBounds, hideView])

  // Boyut / layout değişimlerini izle
  useEffect(() => {
    if (!api || !opts.active) return
    const el = opts.slotRef.current
    if (!el) return

    const ro = new ResizeObserver(() => syncBounds())
    ro.observe(el)

    const onWinResize = () => syncBounds()
    window.addEventListener('resize', onWinResize)
    const onFs = () => setTimeout(syncBounds, 50)
    document.addEventListener('fullscreenchange', onFs)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [api, opts.active, opts.slotRef, syncBounds])

  // YT olaylarını dinle
  useEffect(() => {
    if (!api) return
    return api.onEvent((data) => onEventRef.current(data))
  }, [api])

  // Unmount — view'ı kapat
  useEffect(() => {
    return () => hideView()
  }, [hideView])

  return { postCmd, available: !!api, hide: hideView }
}
