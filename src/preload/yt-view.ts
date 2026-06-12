import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ytBridge', {
  postEvent: (data: Record<string, unknown>) => ipcRenderer.send('yt-view:event', data),
  onCmd: (handler: (cmd: { cmd: string; pos: number; force?: boolean; doSeek?: boolean; isPlaying?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, cmd: { cmd: string; pos: number; force?: boolean; doSeek?: boolean; isPlaying?: boolean }) => handler(cmd)
    ipcRenderer.on('yt-view:cmd', listener)
    return () => ipcRenderer.removeListener('yt-view:cmd', listener)
  }
})
