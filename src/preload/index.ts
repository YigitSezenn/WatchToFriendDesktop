import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onInviteLink: (cb: (code: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, code: string) => cb(code)
    ipcRenderer.on('invite-link', listener)
    return () => ipcRenderer.removeListener('invite-link', listener)
  },
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (id: string) => ipcRenderer.invoke('select-source', id),
  getTurnCredentials: () => ipcRenderer.invoke('get-turn-credentials'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemDark: () => ipcRenderer.invoke('theme:system-dark') as Promise<boolean>,
  onSystemThemeChanged: (cb: (dark: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, dark: boolean) => cb(dark)
    ipcRenderer.on('theme:system-changed', listener)
    return () => ipcRenderer.removeListener('theme:system-changed', listener)
  },
  getSystemLocale: () => ipcRenderer.invoke('app:system-locale') as Promise<string>,
  onSystemLocaleChanged: (cb: (locale: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, locale: string) => cb(locale)
    ipcRenderer.on('app:system-locale-changed', listener)
    return () => ipcRenderer.removeListener('app:system-locale-changed', listener)
  },
  ytView: {
    show: (url: string, bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('yt-view:show', { url, bounds }),
    hide: () => ipcRenderer.invoke('yt-view:hide'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('yt-view:set-bounds', bounds),
    sendCmd: (cmd: { cmd: string; pos: number; force?: boolean; doSeek?: boolean; isPlaying?: boolean }) => ipcRenderer.invoke('yt-view:cmd', cmd),
    reload: (url: string) => ipcRenderer.invoke('yt-view:reload', url),
    onEvent: (cb: (data: Record<string, unknown>) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => cb(data)
      ipcRenderer.on('yt-view:event', listener)
      return () => ipcRenderer.removeListener('yt-view:event', listener)
    }
  },
  notifications: {
    show: (payload: { title: string; body: string; data: Record<string, unknown> }) =>
      ipcRenderer.invoke('notification:show', payload),
    setBadge: (count: number) => ipcRenderer.invoke('notification:set-badge', count),
    onClick: (cb: (data: Record<string, unknown>) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: Record<string, unknown>) => cb(data)
      ipcRenderer.on('notification:click', listener)
      return () => ipcRenderer.removeListener('notification:click', listener)
    }
  }
})
