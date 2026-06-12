import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

export interface YtViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface YtViewEvent {
  type: 'YT_READY' | 'YT_STATE' | 'YT_ERROR' | 'YT_ENDED' | 'YT_PROGRESS'
  state?: number
  time?: number
  code?: number
  current?: number
  duration?: number
}

interface YtViewAPI {
  show: (url: string, bounds: YtViewBounds) => Promise<void>
  hide: () => Promise<void>
  setBounds: (bounds: YtViewBounds) => Promise<void>
  sendCmd: (cmd: { cmd: 'play' | 'pause' | 'seek' | 'applyRemote'; pos: number; force?: boolean; doSeek?: boolean; isPlaying?: boolean }) => Promise<void>
  reload: (url: string) => Promise<void>
  onEvent: (cb: (data: YtViewEvent) => void) => () => void
}

function getYtViewApi(): YtViewAPI | null {
  return (window as { electronAPI?: { ytView?: YtViewAPI } }).electronAPI?.ytView ?? null
}

function measureBounds(el: HTMLElement, minTop = 0, maxBottom = 0): YtViewBounds {
  const rect = el.getBoundingClientRect()
  let y = Math.round(rect.top)
  let height = Math.round(rect.height)
  if (minTop > 0 && y < minTop) {
    height -= minTop - y
    y = minTop
  }
  if (maxBottom > 0 && y + height > maxBottom) {
    height = maxBottom - y
  }
  return {
    x: Math.round(rect.left),
    y,
    width: Math.round(rect.width),
    height: Math.max(0, height)
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
  /** Üst bar (room-header) altına taşmayı kes — BrowserView native katmandır. */
  clipTopRef?: React.RefObject<HTMLElement | null>
  /** Alt kontrol şeridi üstünde bitir (fullscreen vb.). */
  clipBottomRef?: React.RefObject<HTMLElement | null>
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

  const clipLimits = useCallback(() => {
    const fsEl = document.fullscreenElement
    const slot = opts.slotRef.current
    if (fsEl && slot && fsEl.contains(slot)) {
      return { minTop: 0, maxBottom: 0 }
    }
    const minTop = opts.clipTopRef?.current
      ? Math.round(opts.clipTopRef.current.getBoundingClientRect().bottom)
      : 0
    const maxBottom = opts.clipBottomRef?.current
      ? Math.round(opts.clipBottomRef.current.getBoundingClientRect().top)
      : 0
    return { minTop, maxBottom }
  }, [opts.clipTopRef, opts.clipBottomRef, opts.slotRef])

  const syncBounds = useCallback(() => {
    const el = opts.slotRef.current
    if (!api || !visibleRef.current || !el) return
    const { minTop, maxBottom } = clipLimits()
    const bounds = measureBounds(el, minTop, maxBottom)
    if (bounds.width < 2 || bounds.height < 2) return
    api.setBounds(bounds).catch(() => {})
  }, [api, opts.slotRef, clipLimits])

  const syncBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSyncBounds = useCallback(() => {
    if (syncBoundsTimerRef.current) clearTimeout(syncBoundsTimerRef.current)
    syncBoundsTimerRef.current = setTimeout(() => {
      syncBoundsTimerRef.current = null
      syncBounds()
    }, 48)
  }, [syncBounds])

  const postCmd = useCallback((cmd: 'play' | 'pause' | 'seek' | 'applyRemote', pos: number, opts?: { force?: boolean; doSeek?: boolean; isPlaying?: boolean }) => {
    if (!api) return
    if (cmd === 'applyRemote') {
      api.sendCmd({ cmd, pos, isPlaying: opts?.isPlaying, doSeek: opts?.doSeek, force: opts?.force }).catch(() => {})
      return
    }
    api.sendCmd({ cmd, pos, force: opts?.force, doSeek: opts?.doSeek }).catch(() => {})
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

    const { minTop, maxBottom } = clipLimits()
    const bounds = measureBounds(el, minTop, maxBottom)
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
      scheduleSyncBounds()
    } else {
      scheduleSyncBounds()
    }
  }, [api, opts.active, opts.url, opts.slotRef, scheduleSyncBounds, hideView, clipLimits])

  // Boyut / layout değişimlerini izle
  useEffect(() => {
    if (!api || !opts.active) return
    const el = opts.slotRef.current
    if (!el) return

    const ro = new ResizeObserver(() => scheduleSyncBounds())
    ro.observe(el)
    const clipTop = opts.clipTopRef?.current
    const clipBottom = opts.clipBottomRef?.current
    if (clipTop) ro.observe(clipTop)
    if (clipBottom) ro.observe(clipBottom)

    const onWinResize = () => scheduleSyncBounds()
    window.addEventListener('resize', onWinResize)
    const onFs = () => setTimeout(scheduleSyncBounds, 50)
    document.addEventListener('fullscreenchange', onFs)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      document.removeEventListener('fullscreenchange', onFs)
      if (syncBoundsTimerRef.current) clearTimeout(syncBoundsTimerRef.current)
    }
  }, [api, opts.active, opts.slotRef, opts.clipTopRef, opts.clipBottomRef, scheduleSyncBounds])

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
