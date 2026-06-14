import { useCallback, useEffect, useState } from 'react'
import { isNewerVersion } from '../utils/versionCompare'

const MANIFEST_URL = 'https://watchtofriend.web.app/downloads.json'
const DISMISS_KEY = 'wtf_update_dismissed'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type AppUpdateInfo = {
  version: string
  url: string
  filename: string
}

type DownloadsManifest = {
  windows?: {
    version?: string
    url?: string
    filename?: string
  }
}

function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function dismissAppUpdate(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version)
  } catch { /* yut */ }
}

export function useAppUpdate(enabled: boolean) {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null)

  const check = useCallback(async () => {
    if (!enabled) return
    try {
      const api = (window as { electronAPI?: { getAppVersion?: () => Promise<string> } }).electronAPI
      const current = await api?.getAppVersion?.()
      if (!current) return

      const res = await fetch(MANIFEST_URL, { cache: 'no-store' })
      if (!res.ok) return
      const manifest = (await res.json()) as DownloadsManifest
      const remote = manifest.windows?.version?.trim()
      const url = manifest.windows?.url?.trim()
      if (!remote || !url || !isNewerVersion(remote, current)) {
        setUpdate(null)
        return
      }
      if (getDismissedVersion() === remote) {
        setUpdate(null)
        return
      }
      setUpdate({
        version: remote,
        url,
        filename: manifest.windows?.filename?.trim() ?? `WatchToFriend-${remote}.zip`
      })
    } catch {
      setUpdate(null)
    }
  }, [enabled])

  useEffect(() => {
    void check()
    const timer = window.setInterval(() => { void check() }, CHECK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [check])

  const dismiss = useCallback(() => {
    if (!update) return
    dismissAppUpdate(update.version)
    setUpdate(null)
  }, [update])

  return { update, dismiss, recheck: check }
}
