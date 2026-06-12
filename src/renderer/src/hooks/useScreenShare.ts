import { useCallback, useEffect, useRef, useState } from 'react'
import { translate } from '../locales/translate'
import { showToast } from '../utils/toast'
import {
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
  collection,
  setDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore'
import {
  ref as dbRef,
  set as dbSet,
  remove as dbRemove,
  onValue,
  onDisconnect
} from 'firebase/database'
import { db, rtdb } from '../firebase/config'
import { getScreenShareAudioBitrate, setScreenShareActive } from './roomAudioRouter'

/**
 * Ekran paylaşımı — iki mod (Android ile tam uyumlu):
 *
 * 1. RTDB mod (varsayılan, fallback):
 *    rooms/{roomId}.screenShareUid  → kim paylaşıyor (Firestore)
 *    screenShare/{roomId}/frame     → base64 JPEG
 *    screenShare/{roomId}/ts        → number
 *    screenShare/{roomId}/online    → boolean
 *
 * 2. WebRTC mod (Electron + Cloudflare TURN):
 *    rooms/{roomId}/webrtc/meta     → { mode, sharerUid }
 *    rooms/{roomId}/webrtc/offer    → { sdp, type, fromUid }
 *    rooms/{roomId}/webrtc/answer   → { sdp, type, fromUid }
 *    rooms/{roomId}/webrtc/{uid}/candidates/{id} → { sdpMid, sdpMLineIndex, sdp }
 *
 * ICE adayları Android formatında yazılır: { sdpMid, sdpMLineIndex, sdp }
 * (Android IceCandidate(sdpMid, sdpMLineIndex, sdp) ile tam uyumlu)
 */

const FRAME_INTERVAL_MS = 150
const JPEG_QUALITY = 0.45
const CAPTURE_WIDTH = 960
const CAPTURE_HEIGHT = 540
const ICE_TIMEOUT_MS = 12000   // 12s içinde bağlanmazsa RTDB'ye düş

function webrtcMetaRef(roomId: string) { return doc(db, 'rooms', roomId, 'webrtc', 'meta') }
function webrtcOfferRef(roomId: string) { return doc(db, 'rooms', roomId, 'webrtc', 'offer') }
function webrtcAnswerRef(roomId: string) { return doc(db, 'rooms', roomId, 'webrtc', 'answer') }
function webrtcCandidatesRef(roomId: string, uid: string) {
  return collection(db, 'rooms', roomId, 'webrtc', uid, 'candidates')
}

// Cloudflare TURN credential'larını main process'ten al
async function fetchTurnCredentials(): Promise<RTCConfiguration | null> {
  const api = (window as any).electronAPI
  if (!api?.getTurnCredentials) return null
  try {
    const resp = await api.getTurnCredentials()
    if (!resp) return null
    // Cloudflare yanıtı: { iceServers: [...] } (dizi) veya { iceServers: {...} } (nesne)
    const servers = resp.iceServers
    if (!servers) return null
    return { iceServers: Array.isArray(servers) ? servers : [servers] }
  } catch {
    return null
  }
}

const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
}

/**
 * WebRTC SDP'ye Opus Discord-kalite parametreleri ekler.
 * 510 kbps + stereo + CBR + DTX-off → film/müzik sesi Discord seviyesinde gelir.
 * cbr=1: sabit bitrate → anlık ses geçişlerinde kalite düşmez
 * usedtx=0: DTX kapalı → sessizlik anlarında bile bant genişliği tutulur, artefakt olmaz
 */
/** Android ScreenShareManager.improveVideoSdp ile uyumlu — 2500 kbps video tavanı. */
function improveVideoSdp(sdp: string): string {
  const maxBitrate = 2500
  const lines = sdp.split(/\r?\n/)
  const result: string[] = []
  let inVideoSection = false
  for (const line of lines) {
    if (line.startsWith('m=video')) {
      inVideoSection = true
      result.push(line)
    } else if (line.startsWith('m=')) {
      inVideoSection = false
      result.push(line)
    } else if (inVideoSection && line.startsWith('c=')) {
      result.push(line)
      if (!result.some((l) => l.startsWith('b=AS:'))) {
        result.push(`b=AS:${maxBitrate}`)
      }
    } else if (inVideoSection && line.startsWith('a=rtpmap:')) {
      result.push(line)
      const payloadType = line.slice('a=rtpmap:'.length).split(' ')[0]
      const codecName = (line.split(' ')[1] ?? '').split('/')[0]?.toUpperCase() ?? ''
      if (['VP8', 'VP9', 'H264'].includes(codecName)) {
        const fmtp = `a=fmtp:${payloadType} x-google-max-bitrate=${maxBitrate};x-google-min-bitrate=300;x-google-start-bitrate=1000`
        if (!result.some((l) => l.startsWith(`a=fmtp:${payloadType} `))) {
          result.push(fmtp)
        }
      }
    } else {
      result.push(line)
    }
  }
  return result.join('\r\n')
}

function improveAudioSdp(sdp: string): string {
  const bitrate = getScreenShareAudioBitrate()
  const discordParams =
    `minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=${bitrate};maxplaybackrate=48000;cbr=1;usedtx=0`
  if (/a=fmtp:111 /.test(sdp)) {
    // Var olan fmtp satırını Discord kalite parametreleriyle tamamen değiştir
    return sdp.replace(/a=fmtp:111 [^\r\n]+/, `a=fmtp:111 ${discordParams}`)
  }
  // fmtp satırı yoksa rtpmap:111'den sonra ekle
  return sdp.replace(
    /(a=rtpmap:111 opus\/[^\r\n]+)/,
    `$1\r\na=fmtp:111 ${discordParams}`
  )
}

/**
 * ICE aday nesnesini Firestore'a Android uyumlu formatta yazar.
 * Android: IceCandidate(sdpMid, sdpMLineIndex, sdp) → "sdp" alanını okur
 * RTCIceCandidate.toJSON() → "candidate" alanı üretir (uyumsuz)
 */
function iceToFirestore(c: RTCIceCandidate): Record<string, unknown> {
  return {
    sdpMid: c.sdpMid ?? '',
    sdpMLineIndex: c.sdpMLineIndex ?? 0,
    sdp: c.candidate   // Android'deki "sdp" alanı = WebRTC candidate string
  }
}

/**
 * Firestore'daki ICE aday belgesini RTCIceCandidate'e dönüştürür.
 * Android "sdp" yazar; eski Desktop versiyonları "candidate" yazmış olabilir.
 */
function iceFromFirestore(data: Record<string, unknown>): RTCIceCandidate | null {
  const candidateStr = (data.sdp ?? data.candidate) as string | undefined
  if (!candidateStr) return null
  try {
    return new RTCIceCandidate({
      candidate: candidateStr,
      sdpMid: (data.sdpMid as string) ?? '',
      sdpMLineIndex: (data.sdpMLineIndex as number) ?? 0
    })
  } catch {
    return null
  }
}

export function useScreenShare(roomId: string, myUid: string) {
  const [sharing, setSharing] = useState(false)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [sharerUid, setSharerUid] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [shareMode, setShareMode] = useState<'rtdb' | 'webrtc'>('rtdb')
  const shareModeRef = useRef<'rtdb' | 'webrtc'>('rtdb')
  const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high')
  const qualityPresetRef = useRef<'low' | 'medium' | 'high'>('high')
  // WGC track mute durumu — Windows Graphics Capture geçici olarak frame üretemediğinde
  const [trackMuted, setTrackMuted] = useState(false)
  const trackMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackPausedRef = useRef(false)

  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capturingRef = useRef(false)
  const lastFrameHashRef = useRef('')
  const localImgRef = useRef<HTMLImageElement | null>(null)
  const remoteImgRef = useRef<HTMLImageElement | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const webrtcUnsubs = useRef<Array<() => void>>([])
  const iceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const frameUnsub = useRef<(() => void) | null>(null)
  const onlineUnsub = useRef<(() => void) | null>(null)

  const roomDocRef = doc(db, 'rooms', roomId)
  const frameBase = `screenShare/${roomId}`

  const detachViewerListeners = useCallback(() => {
    if (frameUnsub.current) { frameUnsub.current(); frameUnsub.current = null }
    if (onlineUnsub.current) { onlineUnsub.current(); onlineUnsub.current = null }
    webrtcUnsubs.current.forEach((u) => u())
    webrtcUnsubs.current = []
    if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null }
  }, [])

  const closePeerConnection = useCallback(() => {
    if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    setRemoteStream(null)
  }, [])

  // Sesli sohbet + ekran paylaşımı birlikteyken Opus bitrate düşürülür
  useEffect(() => {
    const viewing = sharerUid != null && sharerUid !== myUid
    setScreenShareActive(sharing || viewing)
  }, [sharing, sharerUid, myUid])

  // ── Oda dinleyici: kim paylaşıyor? ──────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !myUid) return
    return onSnapshot(roomDocRef, (snap) => {
      const uid = ((snap.data()?.screenShareUid as string) ?? '').trim()
      setSharerUid(uid || null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid])

  // ── İzleyici: başkası paylaşıyorsa moda göre dinle ──────────────────────────
  useEffect(() => {
    if (!roomId || !myUid) return
    const isViewer = sharerUid != null && sharerUid !== myUid

    if (!isViewer) {
      detachViewerListeners()
      closePeerConnection()
      if (remoteImgRef.current) remoteImgRef.current.src = ''
      setConnecting(false)
      return
    }

    detachViewerListeners()
    if (remoteImgRef.current) remoteImgRef.current.src = ''
    setConnecting(true)

    // meta → offer → mod kararı
    const metaUnsub = onSnapshot(webrtcMetaRef(roomId), (metaSnap) => {
      const meta = metaSnap.data() as { mode?: string; sharerUid?: string } | undefined
      const isWebRtcMode = meta?.mode === 'webrtc' && meta?.sharerUid === sharerUid

      if (isWebRtcMode) {
        // WebRTC modu — offer'ı dinle
        if (!pcRef.current) _startWebRtcViewer(sharerUid!)
      } else if (meta === undefined || meta.mode === 'rtdb') {
        // RTDB modu
        if (!frameUnsub.current) _startRtdbViewer()
      }
      // mode == null && sharerUid yazılıysa: offer var mı kontrol et (Android/eski sürüm)
    })
    webrtcUnsubs.current.push(metaUnsub)

    // Ek: meta yokken offer dokümanını da dinle (eski Android/Desktop uyumu)
    const offerUnsub = onSnapshot(webrtcOfferRef(roomId), (offerSnap) => {
      const data = offerSnap.data() as { sdp?: string; fromUid?: string } | undefined
      if (data?.sdp && data.fromUid === sharerUid && !pcRef.current) {
        _startWebRtcViewer(sharerUid!)
      } else if (!data?.sdp && !pcRef.current && !frameUnsub.current) {
        _startRtdbViewer()
      }
    })
    webrtcUnsubs.current.push(offerUnsub)

    // Paylaşan kopunca temizle
    const oRef = dbRef(rtdb, `${frameBase}/online`)
    const onlineHandler = onValue(oRef, (snap) => {
      const online = snap.val() as boolean | null
      if (online === false) {
        updateDoc(roomDocRef, { screenShareUid: '' }).catch(() => {})
      }
    })
    onlineUnsub.current = () => onlineHandler()

    return () => detachViewerListeners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharerUid, roomId, myUid])

  // ── RTDB izleyici ────────────────────────────────────────────────────────────
  function _startRtdbViewer() {
    if (frameUnsub.current) return
    const fRef = dbRef(rtdb, `${frameBase}/frame`)
    const off = onValue(fRef, (snap) => {
      const b64 = snap.val() as string | null
      if (b64 && remoteImgRef.current) {
        remoteImgRef.current.src = `data:image/jpeg;base64,${b64}`
        setConnecting(false)
      }
    })
    frameUnsub.current = () => off()
  }

  // ── WebRTC izleyici ──────────────────────────────────────────────────────────
  async function _startWebRtcViewer(currentSharerUid: string) {
    if (pcRef.current) return
    try {
      const iceConfig = await fetchTurnCredentials() ?? FALLBACK_ICE
      const pc = new RTCPeerConnection(iceConfig)
      pcRef.current = pc

      const rs = new MediaStream()
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => rs.addTrack(t))
        const newStream = new MediaStream(rs.getTracks())
        setRemoteStream(newStream)
        setConnecting(false)
        if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null }
      }

      pc.onicecandidate = async (e) => {
        if (!e.candidate) return
        try {
          await setDoc(
            doc(webrtcCandidatesRef(roomId, myUid),
              `${Date.now()}_${Math.random().toString(36).slice(2)}`),
            iceToFirestore(e.candidate)
          )
        } catch { /* yut */ }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          closePeerConnection()
          _startRtdbViewer()
        }
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          if (iceTimeoutRef.current) { clearTimeout(iceTimeoutRef.current); iceTimeoutRef.current = null }
          setConnecting(false)
        }
      }

      // Offer'ı dinle ve answer gönder
      const offerUnsub = onSnapshot(webrtcOfferRef(roomId), async (snap) => {
        const data = snap.data() as { sdp?: string; type?: RTCSdpType; fromUid?: string } | undefined
        if (!data?.sdp || data.fromUid !== currentSharerUid) return
        if (pc.remoteDescription) return   // zaten set edildi

        await pc.setRemoteDescription(new RTCSessionDescription({ type: data.type ?? 'offer', sdp: data.sdp }))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await setDoc(webrtcAnswerRef(roomId), { sdp: answer.sdp, type: answer.type, fromUid: myUid })

        // Paylaşanın ICE adaylarını dinle
        const candUnsub = onSnapshot(webrtcCandidatesRef(roomId, currentSharerUid), (cSnap) => {
          cSnap.docChanges().forEach((change) => {
            if (change.type !== 'added') return
            const candidate = iceFromFirestore(change.doc.data() as Record<string, unknown>)
            if (candidate) pc.addIceCandidate(candidate).catch(() => {})
          })
        })
        webrtcUnsubs.current.push(candUnsub)
      })
      webrtcUnsubs.current.push(offerUnsub)

      // ICE zaman aşımı — 12s içinde bağlanamazsa RTDB'ye düş
      iceTimeoutRef.current = setTimeout(() => {
        if (!remoteStream) {
          closePeerConnection()
          _startRtdbViewer()
        }
      }, ICE_TIMEOUT_MS)

    } catch (e) {
      console.error('[useScreenShare] Viewer WebRTC hatası:', e)
      closePeerConnection()
      _startRtdbViewer()
    }
  }

  // ── RTDB yakalama döngüsü (paylaşan taraf) ───────────────────────────────────
  const scheduleCapture = useCallback((immediate = false) => {
    if (captureTimer.current) clearTimeout(captureTimer.current)
    captureTimer.current = setTimeout(() => {
      if (capturingRef.current) { scheduleCapture(); return }
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.videoWidth === 0) { scheduleCapture(); return }

      // WGC track muted iken yakalama yapma — siyah/bozuk frame gönderme
      if (trackPausedRef.current) { scheduleCapture(); return }

      capturingRef.current = true
      try {
        const w = CAPTURE_WIDTH
        const h = CAPTURE_HEIGHT
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) { capturingRef.current = false; scheduleCapture(); return }

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(video, 0, 0, w, h)

        canvas.toBlob((blob) => {
          if (!blob) { capturingRef.current = false; scheduleCapture(); return }
          const reader = new FileReader()
          reader.onloadend = () => {
            capturingRef.current = false
            const dataUrl = reader.result as string
            const b64 = dataUrl.split(',')[1] ?? ''
            if (!b64) { scheduleCapture(); return }

            const hash = b64.slice(0, 200)
            if (hash === lastFrameHashRef.current) { scheduleCapture(); return }
            lastFrameHashRef.current = hash

            if (localImgRef.current) localImgRef.current.src = dataUrl

            dbSet(dbRef(rtdb, `${frameBase}/frame`), b64).catch(() => {})
            dbSet(dbRef(rtdb, `${frameBase}/ts`), Date.now()).catch(() => {})
            scheduleCapture()
          }
          reader.readAsDataURL(blob)
        }, 'image/jpeg', JPEG_QUALITY)
      } catch {
        capturingRef.current = false
        scheduleCapture()
      }
    }, immediate ? 0 : FRAME_INTERVAL_MS)
  }, [frameBase])

  // ── WebRTC paylaşım kurulumu (paylaşan taraf) ────────────────────────────────
  async function _startWebRtcSharing(stream: MediaStream): Promise<boolean> {
    try {
      const iceConfig = await fetchTurnCredentials() ?? FALLBACK_ICE
      const pc = new RTCPeerConnection(iceConfig)
      pcRef.current = pc

      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      pc.onicecandidate = async (e) => {
        if (!e.candidate) return
        try {
          await setDoc(
            doc(webrtcCandidatesRef(roomId, myUid),
              `${Date.now()}_${Math.random().toString(36).slice(2)}`),
            iceToFirestore(e.candidate)
          )
        } catch { /* yut */ }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          console.warn('[useScreenShare] Sharer ICE failed, RTDB fallback')
          closePeerConnection()
          shareModeRef.current = 'rtdb'
          setShareMode('rtdb')
          void setDoc(webrtcMetaRef(roomId), { mode: 'rtdb', sharerUid: myUid }).catch(() => {})
          const stream = streamRef.current
          if (stream && !videoRef.current) {
            const video = document.createElement('video')
            video.srcObject = stream
            video.muted = true
            void video.play().catch(() => {})
            videoRef.current = video
            canvasRef.current = document.createElement('canvas')
          }
          if (streamRef.current) scheduleCapture(true)
        }
      }

      const offer = await pc.createOffer()
      const improvedSdp = improveVideoSdp(improveAudioSdp(offer.sdp ?? ''))
      await pc.setLocalDescription({ type: offer.type, sdp: improvedSdp })

      // Firestore'a offer + meta yaz (Android ile aynı format)
      await setDoc(webrtcOfferRef(roomId), { sdp: improvedSdp, type: offer.type, fromUid: myUid })
      await setDoc(webrtcMetaRef(roomId), { mode: 'webrtc', sharerUid: myUid })

      // Answer ve izleyici ICE adaylarını dinle
      let viewerUid: string | null = null
      const ansUnsub = onSnapshot(webrtcAnswerRef(roomId), async (snap) => {
        const data = snap.data() as { sdp?: string; type?: RTCSdpType; fromUid?: string } | undefined
        if (!data?.sdp || pc.currentRemoteDescription) return
        viewerUid = data.fromUid ?? null

        await pc.setRemoteDescription(new RTCSessionDescription({ type: data.type ?? 'answer', sdp: data.sdp }))

        if (viewerUid) {
          const candUnsub = onSnapshot(webrtcCandidatesRef(roomId, viewerUid), (cSnap) => {
            cSnap.docChanges().forEach((change) => {
              if (change.type !== 'added') return
              const candidate = iceFromFirestore(change.doc.data() as Record<string, unknown>)
              if (candidate) pc.addIceCandidate(candidate).catch(() => {})
            })
          })
          webrtcUnsubs.current.push(candUnsub)
        }
      })
      webrtcUnsubs.current.push(ansUnsub)

      return true
    } catch (e) {
      console.error('[useScreenShare] Sharer WebRTC hatası:', e)
      closePeerConnection()
      return false
    }
  }

  // ── WebRTC Firestore belgelerini temizle ─────────────────────────────────────
  async function _cleanupWebRtcDocs() {
    try {
      await Promise.allSettled([
        deleteDoc(webrtcOfferRef(roomId)),
        deleteDoc(webrtcAnswerRef(roomId)),
        deleteDoc(webrtcMetaRef(roomId))
      ])
      // Kendi ICE adaylarını temizle
      const candSnap = await getDocs(webrtcCandidatesRef(roomId, myUid))
      await Promise.allSettled(candSnap.docs.map((d) => deleteDoc(d.ref)))
    } catch { /* yut */ }
  }

  // ── Paylaşımı başlat ─────────────────────────────────────────────────────────
  const startSharing = useCallback(async (sourceId?: string) => {
    if (sharing) return
    try {
      const claimed = await runTransaction(db, async (tx) => {
        const s = await tx.get(roomDocRef)
        const cur = ((s.data()?.screenShareUid as string) ?? '').trim()
        if (cur && cur !== myUid) return false
        tx.update(roomDocRef, { screenShareUid: myUid })
        return true
      })
      if (!claimed) { showToast(translate('watch_screen_someone_sharing'), 'error'); return }

      // Kaynak seç
      if (sourceId && (window as any).electronAPI) {
        await (window as any).electronAPI.selectSource(sourceId)
      }
      // Kalite seçeneğine göre çözünürlük / FPS belirle
      const qp = qualityPresetRef.current
      const vidConstraints: MediaTrackConstraints =
        qp === 'low'    ? { width: 854,  height: 480,  frameRate: 15 } :
        qp === 'medium' ? { width: 1280, height: 720,  frameRate: 24 } :
                          { width: 1920, height: 1080, frameRate: 30 }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: vidConstraints,
        audio: true   // Sistem sesi (loopback) — film siteleri dahil tüm uygulama sesleri
      })
      streamRef.current = stream

      // RTDB online bayrağı
      await dbSet(dbRef(rtdb, `${frameBase}/online`), true)
      onDisconnect(dbRef(rtdb, `${frameBase}/online`)).set(false)

      // WebRTC dene (Electron varsa)
      const hasElectronAPI = !!(window as any).electronAPI?.getTurnCredentials
      let usedWebRTC = false
      if (hasElectronAPI) {
        usedWebRTC = await _startWebRtcSharing(stream)
      }

      const mode: 'webrtc' | 'rtdb' = usedWebRTC ? 'webrtc' : 'rtdb'
      shareModeRef.current = mode
      setShareMode(mode)

      if (!usedWebRTC) {
        // RTDB mod: video+canvas döngüsü
        await setDoc(webrtcMetaRef(roomId), { mode: 'rtdb', sharerUid: myUid }).catch(() => {})
        const video = document.createElement('video')
        video.srcObject = stream
        video.muted = true
        await video.play()
        videoRef.current = video
        canvasRef.current = document.createElement('canvas')
        capturingRef.current = false
        scheduleCapture(true)
      }

      const vTrack = stream.getVideoTracks()[0]
      vTrack.onended = () => stopSharing()

      // WGC GetFrame hatalarını yakala — track mute olunca
      vTrack.onmute = () => {
        console.warn('[useScreenShare] Video track muted (WGC GetFrame failed) — capture paused')
        trackPausedRef.current = true
        setTrackMuted(true)
        // 8 saniye içinde unmute olmazsa paylaşımı durdur
        if (trackMuteTimerRef.current) clearTimeout(trackMuteTimerRef.current)
        trackMuteTimerRef.current = setTimeout(() => {
          if (trackPausedRef.current) {
            console.warn('[useScreenShare] Track 8sn mute kaldı → paylaşım durduruluyor')
            stopSharing()
          }
        }, 8000)
      }
      vTrack.onunmute = () => {
        console.log('[useScreenShare] Video track unmuted — capture resumed')
        trackPausedRef.current = false
        setTrackMuted(false)
        if (trackMuteTimerRef.current) { clearTimeout(trackMuteTimerRef.current); trackMuteTimerRef.current = null }
        // RTDB modunda yakalama döngüsünü yeniden başlat
        if (shareModeRef.current === 'rtdb' || !pcRef.current) scheduleCapture(true)
      }

      setSharing(true)
    } catch (e) {
      console.error('[useScreenShare] startSharing hatası:', e)
      await updateDoc(roomDocRef, { screenShareUid: '' }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, myUid, frameBase, scheduleCapture])

  // ── Paylaşımı durdur ─────────────────────────────────────────────────────────
  const stopSharing = useCallback(async () => {
    if (captureTimer.current) { clearTimeout(captureTimer.current); captureTimer.current = null }
    if (trackMuteTimerRef.current) { clearTimeout(trackMuteTimerRef.current); trackMuteTimerRef.current = null }
    trackPausedRef.current = false
    setTrackMuted(false)
    capturingRef.current = false
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    videoRef.current = null

    webrtcUnsubs.current.forEach((u) => u())
    webrtcUnsubs.current = []
    closePeerConnection()
    await _cleanupWebRtcDocs()

    setSharing(false)
    shareModeRef.current = 'rtdb'
    setShareMode('rtdb')
    if (localImgRef.current) localImgRef.current.src = ''

    try {
      await dbSet(dbRef(rtdb, `${frameBase}/online`), false)
      await dbRemove(dbRef(rtdb, frameBase))
      await updateDoc(roomDocRef, { screenShareUid: '' })
    } catch { /* yut */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameBase, closePeerConnection])

  const toggleScreen = useCallback(() => {
    if (sharing) stopSharing()
    else startSharing()
  }, [sharing, startSharing, stopSharing])

  // Unmount temizlik
  useEffect(() => {
    return () => {
      if (captureTimer.current) clearTimeout(captureTimer.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      detachViewerListeners()
      closePeerConnection()
      if (sharing) {
        dbSet(dbRef(rtdb, `${frameBase}/online`), false).catch(() => {})
        dbRemove(dbRef(rtdb, frameBase)).catch(() => {})
        updateDoc(roomDocRef, { screenShareUid: '' }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const someoneElseSharing = sharerUid != null && sharerUid !== myUid

  function setQuality(q: 'low' | 'medium' | 'high') {
    setQualityPreset(q)
    qualityPresetRef.current = q
  }

  return {
    sharing,
    shareMode,
    localImgRef,
    remoteImgRef,
    remoteStream,
    sharerUid,
    someoneElseSharing,
    connecting,
    qualityPreset,
    trackMuted,
    toggleScreen,
    startSharing,
    stopSharing,
    setQuality
  }
}
