import { app, BrowserWindow, ipcMain, Notification } from 'electron'

export interface DesktopNotificationData {
  type: 'friend' | 'room_invite' | 'dm' | 'room_message'
  roomId?: string
  dmId?: string
  friendUid?: string
  homeTab?: 'friends' | 'dm'
}

let mainWindow: BrowserWindow | null = null

export function bindNotificationWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function registerNotificationIpc(): void {
  ipcMain.handle(
    'notification:show',
    (_event, payload: { title: string; body: string; data: DesktopNotificationData }) => {
      if (!Notification.isSupported()) return false
      const n = new Notification({
        title: payload.title,
        body: payload.body
      })
      n.on('click', () => {
        const win = mainWindow
        if (!win || win.isDestroyed()) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('notification:click', payload.data)
      })
      n.show()
      return true
    }
  )

  ipcMain.handle('notification:set-badge', (_event, count: number) => {
    const n = Math.max(0, Math.floor(count))
    try {
      app.setBadgeCount(n)
    } catch {
      /* Windows eski sürümlerde desteklenmeyebilir */
    }
    const win = mainWindow
    if (win && !win.isDestroyed() && n > 0 && !win.isFocused()) {
      win.flashFrame(true)
    }
    return n
  })
}
