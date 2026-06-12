import { app, shell, BrowserWindow, session, desktopCapturer, ipcMain, nativeImage, nativeTheme } from 'electron'
import { join, resolve } from 'path'
import { is } from '@electron-toolkit/utils'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import * as http from 'http'
import { registerYtBrowserViewIpc } from './ytBrowserView'

const YT_PORT = 7842
const YT_LOCAL_ORIGIN = `http://127.0.0.1:${YT_PORT}`

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizeInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().trim()
  if (code.length !== 6) return null
  if (![...code].every((c) => CODE_CHARS.includes(c))) return null
  return code
}

function parseInviteUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const q = parsed.searchParams.get('code')
    if (q) return normalizeInviteCode(q)
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'watchtofriend.app' || parsed.hostname === 'watchtofriend.web.app')
    ) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts[0] === 'join' && parts[1]) return normalizeInviteCode(parts[1])
    }
    if (parsed.protocol === 'watchtofriend:' && parsed.hostname === 'join') {
      const path = parsed.pathname.replace(/^\//, '').trim()
      if (path) return normalizeInviteCode(path)
    }
  } catch {
    // ignore
  }
  return null
}

let pendingInviteCode: string | null = null
let mainWindow: BrowserWindow | null = null

function resolveAppIcon(): Electron.NativeImage {
  const candidates = [
    is.dev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../build/icon.png')
  ]
  for (const iconPath of candidates) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) return image
  }
  return nativeImage.createEmpty()
}

function deliverInviteCode(code: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('invite-link', code)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingInviteCode = code
  }
}

function handleInviteArg(arg: string): void {
  const code = parseInviteUrl(arg)
  if (code) deliverInviteCode(code)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const inviteArg = argv.find(
      (a) =>
        a.startsWith('watchtofriend://') ||
        a.includes('watchtofriend.app/join') ||
        a.includes('watchtofriend.web.app/join')
    )
    if (inviteArg) handleInviteArg(inviteArg)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('watchtofriend', process.execPath, [resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('watchtofriend')
}

// Uygulama renderer'ı için CSP — YouTube / googlevideo sayfalarına asla enjekte edilmez.
const APP_RENDERER_CSP =
  "default-src 'self';" +
  " script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com;" +
  ` frame-src ${YT_LOCAL_ORIGIN} https://www.youtube.com https://www.youtube-nocookie.com;` +
  " connect-src 'self' ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*" +
  " https://*.googleapis.com https://*.googlevideo.com https://*.youtube.com https://www.youtube.com" +
  " https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com;" +
  " img-src 'self' data: https: blob:;" +
  " style-src 'self' 'unsafe-inline';" +
  " media-src 'self' blob: https:;"

let appCspRegistered = false

function isYouTubeOrCdnUrl(url: string): boolean {
  return (
    /\.(googlevideo|ytimg)\.com/i.test(url) ||
    /youtube(-nocookie)?\.com/i.test(url) ||
    /\.(google|gstatic)\.com/i.test(url)
  )
}

/** CSP yalnızca kendi renderer HTML/JS'ine; her pencerede değil, oturumda bir kez. */
function registerAppCspOnce(): void {
  if (appCspRegistered) return
  appCspRegistered = true

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url

    // Yerel YT sunucusu + tüm Google/YouTube kaynakları → dokunma
    if (url.startsWith(YT_LOCAL_ORIGIN) || isYouTubeOrCdnUrl(url)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    // Sadece kendi uygulama sayfaları (Vite dev / file:// paket)
    const isAppRenderer =
      url.startsWith('file://') ||
      /^https?:\/\/localhost(?::\d+)?\//i.test(url) ||
      /^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url)

    if (!isAppRenderer) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const headers = { ...details.responseHeaders }
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
        delete headers[key]
      }
    }
    headers['Content-Security-Policy'] = [APP_RENDERER_CSP]
    callback({ responseHeaders: headers })
  })

  console.log('[main] CSP: yalnızca uygulama renderer (YouTube/googlevideo hariç)')
}

// YouTube iframe'i bu local sunucudan yüklenir → origin eşleşir → Error 153 olmaz
http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${YT_PORT}`)
  const videoId = url.searchParams.get('v')
  if (!videoId) { res.writeHead(400); res.end('Missing v param'); return }

  if (!/^[a-zA-Z0-9_-]{1,20}$/.test(videoId)) {
    res.writeHead(400); res.end('Invalid video id'); return
  }

  const autoplay = url.searchParams.get('autoplay') === '1' ? 1 : 0
  const startSec = Math.max(0, Math.min(86400, parseInt(url.searchParams.get('start') ?? '0', 10) || 0))
  const showControls = url.searchParams.get('ctrl') !== '0' ? 1 : 0

  const html = buildYtPageHtml(videoId, autoplay, startSec, showControls)

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[YT] Port ${YT_PORT} zaten kullanımda — mevcut sunucu kullanılacak`)
    return
  }
  console.error('[YT] Sunucu hatası:', err)
}).listen(YT_PORT, '127.0.0.1')

function buildYtPageHtml(videoId: string, autoplay: number, startSec: number, showControls: number): string {
  return `<!DOCTYPE html>
<html><head>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;width:100vw;height:100vh;overflow:hidden}#player{width:100%;height:100%}</style>
</head><body>
<div id="player"></div>
<script>
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
var player=null,playerReady=false,pendingCmd=null,progressTimer=null;
function startProgressTimer(){
  if(progressTimer)return;
  progressTimer=setInterval(function(){
    if(!player||!playerReady)return;
    try{
      var c=player.getCurrentTime?player.getCurrentTime():0;
      var d=player.getDuration?player.getDuration():0;
      postToHost({type:'YT_PROGRESS',current:c||0,duration:d||0});
    }catch(e){}
  },1000);
}
function stopProgressTimer(){
  if(progressTimer){clearInterval(progressTimer);progressTimer=null;}
}
function postToHost(data){
  if(window.ytBridge){window.ytBridge.postEvent(data);}
  else if(window.parent&&window.parent!==window){window.parent.postMessage(data,'*');}
}
function runCmd(cmd){
  if(!player||!playerReady||!cmd)return;
  if(cmd.cmd==='play'){player.seekTo(cmd.pos,true);player.playVideo();}
  if(cmd.cmd==='pause'){player.pauseVideo();}
  if(cmd.cmd==='seek'){player.seekTo(cmd.pos,true);}
}
function handleCmd(cmd){
  if(!cmd||!cmd.cmd)return;
  var normalized={cmd:cmd.cmd,pos:typeof cmd.pos==='number'?cmd.pos:0};
  if(!playerReady){pendingCmd=normalized;return;}
  runCmd(normalized);
}
function onYouTubeIframeAPIReady(){
  player=new YT.Player('player',{
    videoId:'${videoId}',
    playerVars:{autoplay:${autoplay},controls:${showControls},disablekb:${showControls ? 0 : 1},enablejsapi:1,start:${startSec},origin:'http://127.0.0.1:${YT_PORT}',playsinline:1,rel:0,modestbranding:1},
    events:{
      onReady:function(){
        playerReady=true;
        postToHost({type:'YT_READY'});
        if(${autoplay}){player.seekTo(${startSec},true);player.playVideo();startProgressTimer();}
        if(pendingCmd){
          if(${autoplay} && pendingCmd.cmd==='pause'){pendingCmd=null;}
          else{runCmd(pendingCmd);pendingCmd=null;}
        }
      },
      onError:function(e){console.error('[YT iframe] error',e.data);postToHost({type:'YT_ERROR',code:e.data});},
      onStateChange:function(e){
        var t=player&&player.getCurrentTime?player.getCurrentTime():0;
        var d=player&&player.getDuration?player.getDuration():0;
        console.log('[YT iframe] state',e.data,'time',t);
        postToHost({type:'YT_STATE',state:e.data,time:t,duration:d});
        if(e.data===1)startProgressTimer();
        else if(e.data===2)stopProgressTimer();
        else if(e.data===0){stopProgressTimer();postToHost({type:'YT_ENDED'});}
      }
    }
  });
}
if(window.ytBridge){
  window.ytBridge.onCmd(function(cmd){handleCmd(cmd);});
}else{
  window.addEventListener('message',function(e){handleCmd(e.data);});
}
</script>
</body></html>`
}

// Kullanıcının seçtiği kaynak ID'si (SourcePickerModal → selectSource IPC → buraya)
// createWindow dışında tutulur: ikinci pencere oluşturulursa duplicate handler hatası olmaz.
let pendingSourceId: string | null = null

// Handler'lar uygulama başlangıcında bir kez kaydedilir.
// Cloudflare TURN yapılandırması.
// Değerler .env dosyasından electron-vite tarafından build zamanında gömülür.
// .env'de MAIN_VITE_ öneki kullanılmalıdır (örn. MAIN_VITE_CLOUDFLARE_TURN_TOKEN_ID).
const CF_TURN_TOKEN_ID: string =
  (import.meta.env.MAIN_VITE_CLOUDFLARE_TURN_TOKEN_ID as string | undefined) ?? ''
const CF_TURN_API_TOKEN: string =
  (import.meta.env.MAIN_VITE_CLOUDFLARE_TURN_API_TOKEN as string | undefined) ?? ''

function registerIpcHandlers() {
  ipcMain.handle('select-source', (_event, id: string) => {
    pendingSourceId = id
  })

  // Cloudflare TURN credential'larını main process'te üret — API token renderer'a hiç açılmaz
  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('theme:system-dark', () => nativeTheme.shouldUseDarkColors)

  ipcMain.handle('app:system-locale', () => app.getLocale())

  ipcMain.handle('get-turn-credentials', async () => {
    if (!CF_TURN_TOKEN_ID || !CF_TURN_API_TOKEN) {
      console.warn('[main] CLOUDFLARE_TURN_TOKEN_ID veya CLOUDFLARE_TURN_API_TOKEN tanımlı değil')
      return null
    }
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_TOKEN_ID}/credentials/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CF_TURN_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl: 86400 })
        }
      )
      return await res.json()
    } catch (e) {
      console.error('[main] TURN credential alınamadı:', e)
      return null
    }
  })

  // Ekran listesini renderer'a gönder (ekran seçici için)
  // fetchWindowIcons: tarayıcı / oyun pencereleri dahil tüm pencereleri listeler
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    return sources
      // Sistem/arka plan pencerelerini filtrele, kullanılabilir kaynakları göster
      .filter((s) => {
        const name = s.name.trim()
        if (!name) return false
        // Gizli/sistem pencerelerini atla
        if (name === 'WatchToFriend') return false // kendi penceremiz
        return true
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        // Ekran mı pencere mi ayırt et
        isScreen: s.id.startsWith('screen:')
      }))
  })
}

function createWindow(): BrowserWindow {
  const appIcon = resolveAppIcon()

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'WatchToFriend',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    backgroundColor: '#1E1F22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // Ekran paylaşımı için: renderer getDisplayMedia çağrısını yakala
  // useSystemPicker:false → kendi kaynak seçicimizi kullanırız (SourcePickerModal)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({
      types: ['screen', 'window'],
      fetchWindowIcons: true
    }).then((sources) => {
      const chosen = pendingSourceId
        ? (sources.find((s) => s.id === pendingSourceId) ?? sources[0])
        : sources[0]
      pendingSourceId = null
      // 'loopback' → sistem sesini (loopback) yakala; mobil izleyici film sesini duyar
      callback({ video: chosen, audio: 'loopback' as any })
    })
  }, { useSystemPicker: false })

  // Dış linkleri sistem tarayıcısında aç — sadece http/https izni ver
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Dev/preview: DevTools + terminal. Kurulu .exe için: WTF_DEBUG=1 ortam değişkeni.
  const debugYt = !app.isPackaged || process.env['WTF_DEBUG'] === '1'
  if (debugYt) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes('[YT]')) console.log('[renderer]', message)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('theme:system-changed', nativeTheme.shouldUseDarkColors)
    win.webContents.send('app:system-locale-changed', app.getLocale())
    if (pendingInviteCode) {
      win.webContents.send('invite-link', pendingInviteCode)
      pendingInviteCode = null
    }
  })

  return win
}

// WGC (Windows Graphics Capture) zorunlu etkinleştir.
// WGC olmadan GPU hızlandırmalı pencereler (Chrome, Edge, oyunlar) listede çıkmaz.
// ProcessFrame E_FAIL uyarıları WGC'nin son geçerli frame'i yeniden kullandığını
// gösterir — bu ölümcül değil, stream çalışmaya devam eder.
app.commandLine.appendSwitch('enable-features', 'WebRtcUseWGCDesktopCapturer')
// Ekran paylaşımında ses yakalamayı etkinleştir
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleInviteArg(url)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.watch.watchtofriend.desktop')
  const appIcon = resolveAppIcon()
  if (!appIcon.isEmpty()) {
    app.dock?.setIcon(appIcon)
  }
  nativeTheme.themeSource = 'system'
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('theme:system-changed', dark)
    })
  })
  registerAppCspOnce()
  registerYtBrowserViewIpc(join(__dirname, '../preload/yt-view.js'))
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  registerIpcHandlers()
  mainWindow = createWindow()
  const startupInvite = process.argv.find(
    (a) =>
      a.startsWith('watchtofriend://') ||
      a.includes('watchtofriend.app/join') ||
      a.includes('watchtofriend.web.app/join')
  )
  if (startupInvite) handleInviteArg(startupInvite)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Node.js unhandled promise rejection'ları yakala — sessiz crash'i önle
process.on('unhandledRejection', (reason, promise) => {
  console.error('[main] Unhandled Rejection at:', promise, 'reason:', reason)
  // Uygulamayı kapatma; hata loglansın, kullanıcıya görünmeden devam etsin
})
