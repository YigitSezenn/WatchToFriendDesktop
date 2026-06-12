import { BrowserView, BrowserWindow, ipcMain, Rectangle } from 'electron'
import { join } from 'path'
import { loadYtEmbedPage, parseYtEmbedUrl } from './ytPage'

export interface YtViewBounds {
  x: number
  y: number
  width: number
  height: number
}

interface YtViewState {
  view: BrowserView
  attached: boolean
  lastBounds: Rectangle
  lastUrl: string
}

const states = new WeakMap<BrowserWindow, YtViewState>()
let ipcRegistered = false

function getState(win: BrowserWindow, preloadPath: string): YtViewState {
  let state = states.get(win)
  if (!state) {
    const view = new BrowserView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    view.setBackgroundColor('#000000')
    view.setAutoResize({ width: false, height: false })
    view.webContents.on('console-message', (_event, _level, message) => {
      if (message.includes('[YT')) console.log('[yt-view]', message)
    })
    state = { view, attached: false, lastBounds: { x: 0, y: 0, width: 0, height: 0 }, lastUrl: '' }
    states.set(win, state)

    win.on('closed', () => {
      states.delete(win)
    })
  }
  return state
}

function senderWindow(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function clampBounds(win: BrowserWindow, bounds: Rectangle): Rectangle {
  const [cw, ch] = win.getContentSize()
  const x = Math.max(0, Math.min(bounds.x, Math.max(0, cw - 1)))
  const y = Math.max(0, Math.min(bounds.y, Math.max(0, ch - 1)))
  const width = Math.max(0, Math.min(bounds.width, cw - x))
  const height = Math.max(0, Math.min(bounds.height, ch - y))
  return { x, y, width, height }
}

async function loadYtViewUrl(state: YtViewState, url: string): Promise<void> {
  const params = parseYtEmbedUrl(url)
  if (params) {
    await loadYtEmbedPage(state.view.webContents, params)
    state.lastUrl = url
    return
  }
  await state.view.webContents.loadURL(url)
  state.lastUrl = url
}

export function registerYtBrowserViewIpc(preloadPath: string): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('yt-view:show', async (event, payload: { url: string; bounds: YtViewBounds }) => {
    const win = senderWindow(event)
    if (!win || !payload?.url || !payload.bounds) return
    const state = getState(win, preloadPath)
    const bounds = clampBounds(win, {
      x: Math.round(payload.bounds.x),
      y: Math.round(payload.bounds.y),
      width: Math.max(0, Math.round(payload.bounds.width)),
      height: Math.max(0, Math.round(payload.bounds.height))
    })
    Object.assign(state.lastBounds, bounds)
    if (!state.attached) {
      win.setBrowserView(state.view)
      state.attached = true
    }
    state.view.setBounds(bounds)
    if (state.lastUrl !== payload.url) {
      await loadYtViewUrl(state, payload.url)
    }
  })

  ipcMain.handle('yt-view:hide', (event) => {
    const win = senderWindow(event)
    if (!win) return
    const state = states.get(win)
    if (!state?.attached) return
    win.removeBrowserView(state.view)
    state.attached = false
  })

  ipcMain.handle('yt-view:set-bounds', (event, bounds: YtViewBounds) => {
    const win = senderWindow(event)
    if (!win || !bounds) return
    const state = states.get(win)
    if (!state?.attached) return
    const rect = clampBounds(win, {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height))
    })
    Object.assign(state.lastBounds, rect)
    state.view.setBounds(rect)
  })

  ipcMain.handle('yt-view:cmd', (event, cmd: { cmd: string; pos: number }) => {
    const win = senderWindow(event)
    if (!win || !cmd) return
    states.get(win)?.view.webContents.send('yt-view:cmd', cmd)
  })

  ipcMain.handle('yt-view:reload', async (event, url: string) => {
    const win = senderWindow(event)
    if (!win || !url) return
    const state = states.get(win)
    if (!state) return
    await loadYtViewUrl(state, url)
  })

  ipcMain.on('yt-view:event', (event, data: Record<string, unknown>) => {
    const win = BrowserWindow.getAllWindows().find((w) => {
      const state = states.get(w)
      return state?.view.webContents === event.sender
    })
    if (!win || !data) return
    win.webContents.send('yt-view:event', data)
  })

  console.log('[main] YouTube BrowserView IPC hazır (watchtofriend.app origin)')
}
