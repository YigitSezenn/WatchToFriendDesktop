/**
 * useVoiceChat — Mesh P2P WebRTC sesli sohbet
 *
 * Topoloji: Full-mesh (N kullanıcı, her biri diğer herkesle doğrudan bağlantı kurar)
 * Watch party odaları genellikle 2-5 kişi → mesh mükemmel, SFU gereksiz.
 * Audio-only: ~40-60 Kbps/bağlantı, 5 kişi = ~240 Kbps upload (tamamen yönetilebilir).
 *
 * Signaling (Firestore):
 *   rooms/{roomId}/voicePeers/{uid}              → { displayName, muted, joinedAt }
 *   rooms/{roomId}/voiceConn/{uid1_uid2}/         → { offer, answer }
 *     offerCandidates/{id}                       → { sdpMid, sdpMLineIndex, sdp }
 *     answerCandidates/{id}                      → { sdpMid, sdpMLineIndex, sdp }
 *
 * Caller/callee belirleme: uid1 < uid2 alphabetically → uid1 her zaman offerer.
 * Deterministik → iki kullanıcı aynı anda katılsa bile race condition yok.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  collection, doc, setDoc, deleteDoc, getDoc,
  onSnapshot, addDoc, updateDoc, getDocs
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { translate } from '../locales/translate'
import { REMOTE_VOICE_GAIN, setVoiceActive } from './roomAudioRouter'

interface RemoteAudioNodes {
  source: MediaStreamAudioSourceNode
  gain: GainNode
}

// ── Firestore ref helper'ları ──────────────────────────────────────────────
const voicePeersCol = (rid: string) =>
  collection(db, 'rooms', rid, 'voicePeers')

const voicePeerDoc = (rid: string, uid: string) =>
  doc(db, 'rooms', rid, 'voicePeers', uid)

const voiceConnDoc = (rid: string, cid: string) =>
  doc(db, 'rooms', rid, 'voiceConn', cid)

const offerCandCol = (rid: string, cid: string) =>
  collection(db, 'rooms', rid, 'voiceConn', cid, 'offerCandidates')

const answerCandCol = (rid: string, cid: string) =>
  collection(db, 'rooms', rid, 'voiceConn', cid, 'answerCandidates')

/** İki uid'den deterministik bağlantı ID'si üret (uid1 < uid2). */
function mkConnId(a: string, b: string) {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

function loadVoicePref(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '')
    if (!Number.isFinite(v)) return fallback
    return Math.max(min, Math.min(max, v))
  } catch {
    return fallback
  }
}

function loadVoicePrefBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return v === '1' || v === 'true'
  } catch {
    return fallback
  }
}

function remoteSpeakThresholdFromRms(rms: number): number {
  return Math.max(0.002, Math.min(0.12, rms / 600))
}

/** Android a=ssrc satırları Chrome'da Invalid SDP line hatası verir — Unified Plan'da gerekmez */
function sanitizeSdpForBrowser(sdp: string): string {
  const lines = sdp.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
  return lines
    .filter((l) => !l.startsWith('a=ssrc:') && !l.startsWith('a=ssrc-group:'))
    .join('\r\n') + '\r\n'
}

/** Opus — DTX kapalı; stereo'ya dokunma (uyumluluk) */
function tuneVoiceSdp(sdp: string): string {
  const extra: Record<string, string> = {
    minptime: '10',
    useinbandfec: '1',
    usedtx: '0',
    maxaveragebitrate: '96000',
    maxplaybackrate: '48000'
  }
  const lines = sanitizeSdpForBrowser(sdp).replace(/\r\n/g, '\n').split('\n').filter(Boolean)
  const fmtpIdx = lines.findIndex((l) => l.startsWith('a=fmtp:111 '))
  if (fmtpIdx >= 0) {
    const existing = Object.fromEntries(
      lines[fmtpIdx].slice('a=fmtp:111 '.length).split(';').map((p) => {
        const [k, v] = p.trim().split('=')
        return k && v ? [k, v] as const : null
      }).filter((x): x is readonly [string, string] => x != null)
    )
    const merged = { ...existing, ...extra }
    lines[fmtpIdx] = `a=fmtp:111 ${Object.entries(merged).map(([k, v]) => `${k}=${v}`).join(';')}`
  } else {
    const rtpIdx = lines.findIndex((l) => l.startsWith('a=rtpmap:111 '))
    if (rtpIdx >= 0) {
      lines.splice(rtpIdx + 1, 0, `a=fmtp:111 ${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(';')}`)
    }
  }
  return sanitizeSdpForBrowser(lines.join('\n'))
}

/** WebRTC gönderim zincirinde uygulanan maksimum kazanç */
export const MIC_GAIN_MAX = 3

const MIC_GAIN_DEFAULT = 1.8
const SPEAK_RMS_DEFAULT = 3

function applyMicBoostMigration() {
  try {
    if (localStorage.getItem('wtf_mic_boost_v2') === '1') return
    const cur = parseFloat(localStorage.getItem('wtf_mic_gain') ?? '')
    if (!Number.isFinite(cur) || cur <= 1.05) {
      localStorage.setItem('wtf_mic_gain', String(MIC_GAIN_DEFAULT))
    }
    const rms = parseFloat(localStorage.getItem('wtf_speak_rms') ?? '')
    if (!Number.isFinite(rms) || rms > 8) {
      localStorage.setItem('wtf_speak_rms', String(SPEAK_RMS_DEFAULT))
    }
    localStorage.setItem('wtf_mic_boost_v2', '1')
  } catch { /* yut */ }
}

applyMicBoostMigration()

/** myUid alfabetik olarak küçükse offerer'ım. */
function amOfferer(myUid: string, peerUid: string) {
  return myUid < peerUid
}

// ── ICE yapılandırması ─────────────────────────────────────────────────────
const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
}

async function getIceConfig(): Promise<RTCConfiguration> {
  const api = (window as any).electronAPI
  if (!api?.getTurnCredentials) return FALLBACK_ICE
  try {
    const resp = await api.getTurnCredentials()
    if (!resp?.iceServers) return FALLBACK_ICE
    const servers = resp.iceServers
    return { iceServers: Array.isArray(servers) ? servers : [servers] }
  } catch {
    return FALLBACK_ICE
  }
}

// ── ICE candidate → Firestore'a yaz ───────────────────────────────────────
function candidateToRecord(c: RTCIceCandidate) {
  return { sdpMid: c.sdpMid ?? '', sdpMLineIndex: c.sdpMLineIndex ?? 0, sdp: c.candidate }
}

function recordToCandidate(d: Record<string, unknown>): RTCIceCandidateInit {
  return { sdpMid: d.sdpMid as string, sdpMLineIndex: d.sdpMLineIndex as number, candidate: d.sdp as string }
}

// ── Hook ───────────────────────────────────────────────────────────────────
export interface VoicePeer {
  uid: string
  displayName: string
  photoBase64?: string
  muted: boolean
  listenOnly?: boolean
  /** "connecting" | "connected" | "reconnecting" | "self" */
  connectionState?: string
}

export interface VoiceEvent {
  type: 'joined' | 'left'
  displayName: string
}

export function useVoiceChat(roomId: string, myUid: string, myName: string, myPhotoBase64 = '') {
  const [inVoice, setInVoice] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [mutedState, setMutedState] = useState(false)
  const [listenOnly, setListenOnly] = useState(false)
  const [speakingUids, setSpeakingUids] = useState<Set<string>>(new Set())
  const [voicePeersList, setVoicePeersList] = useState<VoicePeer[]>([])
  const [voiceEvents, setVoiceEvents] = useState<VoiceEvent[]>([])
  const prevPeersRef = useRef<Map<string, string>>(new Map()) // uid → displayName
  const myNameRef = useRef(myName)
  const myPhotoRef = useRef(myPhotoBase64)
  myNameRef.current = myName
  myPhotoRef.current = myPhotoBase64
  const peerStatesRef = useRef<Map<string, string>>(new Map()) // uid → connectionState
  const lastRenogAtRef = useRef<Map<string, number>>(new Map())

  // Ref'ler — closure'larda güncel değerlere erişim
  const localStreamRef        = useRef<MediaStream | null>(null)
  const pcsRef                = useRef<Map<string, RTCPeerConnection>>(new Map())
  const audioElsRef           = useRef<Map<string, HTMLAudioElement>>(new Map())
  const iceConfigRef          = useRef<RTCConfiguration>(FALLBACK_ICE)
  const unsubsRef             = useRef<(() => void)[]>([])
  const speakIntervalRef      = useRef<ReturnType<typeof setInterval>>()
  const mutedRef              = useRef(false)
  const inVoiceRef            = useRef(false)
  const audioCtxRef           = useRef<AudioContext | null>(null)
  const localAnalyserRef      = useRef<AnalyserNode | null>(null)
  // ICE adaylarını PC + remoteDesc hazır olana kadar tamponu — race condition önler
  const pendingCandidatesRef  = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  // Hangi peer'lar için setup başlatıldı — duplicate setup önler
  const setupStartedRef       = useRef<Set<string>>(new Set())
  const pendingOffersRef      = useRef<Map<string, RTCSessionDescriptionInit>>(new Map())
  // Peer başına Firestore listener'ları — reconnect'te sızıntı önler
  const peerUnsubsRef         = useRef<Map<string, (() => void)[]>>(new Map())
  const remoteAudioNodesRef   = useRef<Map<string, RemoteAudioNodes>>(new Map())
  const boostTimersRef        = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map())
  const rawMicStreamRef       = useRef<MediaStream | null>(null)
  const micGainNodeRef        = useRef<GainNode | null>(null)
  const micGainRef            = useRef(loadVoicePref('wtf_mic_gain', MIC_GAIN_DEFAULT, 0, MIC_GAIN_MAX))
  const speakRmsRef           = useRef(loadVoicePref('wtf_speak_rms', SPEAK_RMS_DEFAULT, 2, 25))
  const savedMicGainRef       = useRef(micGainRef.current)
  const [micGain, setMicGainState] = useState(micGainRef.current)
  const [speakRmsThreshold, setSpeakRmsThresholdState] = useState(speakRmsRef.current)
  const [localMicLevel, setLocalMicLevel] = useState(0)
  const deafenedRef = useRef(false)
  const [deafened, setDeafenedState] = useState(false)
  const pushToTalkRef = useRef(loadVoicePrefBool('wtf_push_to_talk', false))
  const [pushToTalk, setPushToTalkState] = useState(pushToTalkRef.current)
  const pttActiveRef = useRef(false)
  const [pttActive, setPttActiveState] = useState(false)

  function removePeerUnsubs(peerUid: string) {
    const unsubs = peerUnsubsRef.current.get(peerUid)
    if (!unsubs) return
    unsubs.forEach(unsub => {
      const idx = unsubsRef.current.indexOf(unsub)
      if (idx >= 0) unsubsRef.current.splice(idx, 1)
      unsub()
    })
    peerUnsubsRef.current.delete(peerUid)
  }

  function addPeerUnsub(peerUid: string, unsub: () => void) {
    const list = peerUnsubsRef.current.get(peerUid) || []
    list.push(unsub)
    peerUnsubsRef.current.set(peerUid, list)
    unsubsRef.current.push(unsub)
  }

  function clearBoostTimers(peerUid: string) {
    boostTimersRef.current.get(peerUid)?.forEach(t => clearTimeout(t))
    boostTimersRef.current.delete(peerUid)
  }

  function disconnectRemoteAudio(peerUid: string) {
    clearBoostTimers(peerUid)
    const nodes = remoteAudioNodesRef.current.get(peerUid)
    if (nodes) {
      try { nodes.source.disconnect() } catch { /* yut */ }
      try { nodes.gain.disconnect() } catch { /* yut */ }
      remoteAudioNodesRef.current.delete(peerUid)
    }
    const audioEl = audioElsRef.current.get(peerUid)
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; audioEl.remove() }
    audioElsRef.current.delete(peerUid)
  }

  function wireMicSendStream(raw: MediaStream, ctx: AudioContext): MediaStream {
    const micSource = ctx.createMediaStreamSource(raw)
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -28
    compressor.knee.value = 24
    compressor.ratio.value = 8
    compressor.attack.value = 0.003
    compressor.release.value = 0.2
    const micGainNode = ctx.createGain()
    micGainNode.gain.value = micGainRef.current
    micGainNodeRef.current = micGainNode
    const dest = ctx.createMediaStreamDestination()
    micSource.connect(compressor)
    compressor.connect(micGainNode)
    micGainNode.connect(dest)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    micGainNode.connect(analyser)
    localAnalyserRef.current = analyser
    return dest.stream
  }

  const setMicGain = useCallback((level: number) => {
    const v = Math.max(0, Math.min(MIC_GAIN_MAX, level))
    micGainRef.current = v
    setMicGainState(v)
    if (micGainNodeRef.current) micGainNodeRef.current.gain.value = v
    try { localStorage.setItem('wtf_mic_gain', String(v)) } catch { /* yut */ }
  }, [])

  const setSpeakRmsThreshold = useCallback((rms: number) => {
    const v = Math.max(2, Math.min(25, rms))
    speakRmsRef.current = v
    setSpeakRmsThresholdState(v)
    try { localStorage.setItem('wtf_speak_rms', String(v)) } catch { /* yut */ }
  }, [])

  function ensurePlaybackContext(): AudioContext {
    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx
    }
    ctx.resume().catch(() => {})
    return ctx
  }

  const peerVolumesRef = useRef<Map<string, number>>(new Map())
  const peerLocalMutedRef = useRef<Set<string>>(new Set())
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({})
  const [peerLocalMuted, setPeerLocalMuted] = useState<Set<string>>(new Set())

  function peerGainMultiplier(peerUid: string): number {
    if (deafenedRef.current) return 0
    if (peerLocalMutedRef.current.has(peerUid)) return 0
    return peerVolumesRef.current.get(peerUid) ?? 1
  }

  function updateMicTransmission() {
    const stream = localStreamRef.current
    if (!stream) return
    const transmit = !mutedRef.current && !deafenedRef.current &&
      (!pushToTalkRef.current || pttActiveRef.current)
    stream.getAudioTracks().forEach(t => { t.enabled = transmit })
  }

  function applyRemoteGain(peerUid: string, gainNode: GainNode) {
    const mult = peerGainMultiplier(peerUid)
    gainNode.gain.value = REMOTE_VOICE_GAIN * mult
    clearBoostTimers(peerUid)
    const timers = [350, 800, 2000, 4000].map(delay =>
      setTimeout(() => {
        if (remoteAudioNodesRef.current.has(peerUid)) {
          gainNode.gain.value = REMOTE_VOICE_GAIN * peerGainMultiplier(peerUid)
        }
      }, delay)
    )
    boostTimersRef.current.set(peerUid, timers)
  }

  function boostRemoteAudio(peerUid: string, stream: MediaStream) {
    const ctx = ensurePlaybackContext()
    disconnectRemoteAudio(peerUid)

    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    remoteAudioNodesRef.current.set(peerUid, { source, gain })
    applyRemoteGain(peerUid, gain)

    // Yedek: bazı Electron sürümlerinde Web Audio tek başına yetmeyebilir
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.volume = 1
    audioEl.muted = true
    audioEl.srcObject = stream
    document.body.appendChild(audioEl)
    audioElsRef.current.set(peerUid, audioEl)
    audioEl.play().catch(() => {})
  }

  // ── Peer temizleme — reconnect öncesi ────────────────────────────────
  function teardownPeer(peerUid: string) {
    removePeerUnsubs(peerUid)
    pcsRef.current.get(peerUid)?.close()
    pcsRef.current.delete(peerUid)
    pendingCandidatesRef.current.delete(peerUid)
    setupStartedRef.current.delete(peerUid)
    disconnectRemoteAudio(peerUid)
  }

  // ── ICE tampon helper'ları ────────────────────────────────────────────
  function bufferCandidate(peerUid: string, candidate: RTCIceCandidateInit) {
    const pc = pcsRef.current.get(peerUid)
    if (pc && pc.remoteDescription) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    } else {
      const buf = pendingCandidatesRef.current.get(peerUid) || []
      buf.push(candidate)
      pendingCandidatesRef.current.set(peerUid, buf)
    }
  }

  function drainCandidates(peerUid: string) {
    const pc = pcsRef.current.get(peerUid)
    if (!pc) return
    const pending = pendingCandidatesRef.current.get(peerUid) || []
    pending.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}))
    pendingCandidatesRef.current.delete(peerUid)
  }

  async function clearVoiceSignaling(peerUid: string) {
    const cid = mkConnId(myUid, peerUid)
    await deleteSubcollection(offerCandCol(roomId, cid))
    await deleteSubcollection(answerCandCol(roomId, cid))
    await deleteDoc(voiceConnDoc(roomId, cid)).catch(() => {})
  }

  async function renegotiateAllPeersForMic() {
    const peerUids = [...pcsRef.current.keys()]
    console.log(`[VoiceChat] Mikrofon eklendi → ${peerUids.length} peer yeniden kuruluyor`)
    peerUids.forEach(teardownPeer)
    setupStartedRef.current.clear()
    for (const peerUid of peerUids) {
      await clearVoiceSignaling(peerUid)
      if (!setupStartedRef.current.has(peerUid)) {
        setupStartedRef.current.add(peerUid)
        if (amOfferer(myUid, peerUid)) await setupAsOfferer(peerUid)
        else setupAsAnswerer(peerUid)
      }
    }
  }

  /** Ağ geri gelince tüm peer bağlantılarını yeniden kur (Android reconnectAllPeers ile aynı). */
  const reconnectAllPeersForMic = renegotiateAllPeersForMic

  function handlePeerRenog(peerUid: string, renogAt: number) {
    const prev = lastRenogAtRef.current.get(peerUid) ?? 0
    if (renogAt <= prev) return
    lastRenogAtRef.current.set(peerUid, renogAt)
    console.log(`[VoiceChat] [${peerUid}] Mikrofon açıldı → yeniden bağlanıyor`)
    teardownPeer(peerUid)
    setupStartedRef.current.delete(peerUid)
    void clearVoiceSignaling(peerUid).then(() => {
      if (!inVoiceRef.current) return
      if (setupStartedRef.current.has(peerUid)) return
      setupStartedRef.current.add(peerUid)
      if (amOfferer(myUid, peerUid)) void setupAsOfferer(peerUid)
      else setupAsAnswerer(peerUid)
    })
  }

  // ── Temizlik ──────────────────────────────────────────────────────────
  function cleanup() {
    clearInterval(speakIntervalRef.current)
    unsubsRef.current.forEach(u => u())
    unsubsRef.current = []
    peerUnsubsRef.current.clear()
    remoteAudioNodesRef.current.forEach((_, peerUid) => clearBoostTimers(peerUid))
    boostTimersRef.current.clear()
    pcsRef.current.forEach(pc => pc.close())
    pcsRef.current.clear()
    remoteAudioNodesRef.current.forEach((nodes) => {
      try { nodes.source.disconnect() } catch { /* yut */ }
      try { nodes.gain.disconnect() } catch { /* yut */ }
    })
    remoteAudioNodesRef.current.clear()
    audioElsRef.current.forEach(el => { el.pause(); el.srcObject = null; el.remove() })
    audioElsRef.current.clear()
    rawMicStreamRef.current?.getTracks().forEach(t => t.stop())
    rawMicStreamRef.current = null
    micGainNodeRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    localAnalyserRef.current = null
    pendingCandidatesRef.current.clear()
    setupStartedRef.current.clear()
    prevPeersRef.current.clear()
    peerStatesRef.current.clear()
    lastRenogAtRef.current.clear()
    setSpeakingUids(new Set())
    setVoicePeersList([])
    setVoiceEvents([])
    setLocalMicLevel(0)
    deafenedRef.current = false
    setDeafenedState(false)
    pushToTalkRef.current = loadVoicePrefBool('wtf_push_to_talk', false)
    setPushToTalkState(pushToTalkRef.current)
    pttActiveRef.current = false
    setPttActiveState(false)
    setVoiceActive(false)
  }

  // ── PeerConnection oluştur ────────────────────────────────────────────
  function createPc(peerUid: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      ...iceConfigRef.current,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })
    pcsRef.current.set(peerUid, pc)

    // Yerel ses parçalarını ekle; mikrofon yoksa recvonly transceiver ekle
    // (transceiver olmadan SDP'de ses yönü belirsiz → karşı tarafın sesi gelmeyebilir)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' })
    }

    // Uzak ses — Web Audio gain ile yükselt (mobil setVolume(8.0) karşılığı)
    pc.ontrack = (e) => {
      if (e.track.kind !== 'audio') return
      e.track.enabled = true
      const stream = e.streams[0] ?? new MediaStream([e.track])
      boostRemoteAudio(peerUid, stream)
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      console.log(`[VoiceChat] [${peerUid}] connectionState: ${s}`)
      // Bağlantı durumunu peerStates'e yaz → UI güncelle
      const mapped = s === 'connected' ? 'connected' : s === 'connecting' || s === 'new' ? 'connecting' : 'reconnecting'
      peerStatesRef.current.set(peerUid, mapped)
      setVoicePeersList(prev => prev.map(p => p.uid === peerUid ? { ...p, connectionState: mapped } : p))
      if (s === 'failed' || s === 'closed') {
        // Tam yeniden kurulum — restartIce() Firestore sinyalinde çalışmaz
        teardownPeer(peerUid)
        setTimeout(() => {
          if (inVoiceRef.current && !setupStartedRef.current.has(peerUid)) {
            console.log(`[VoiceChat] [${peerUid}] Yeniden bağlanıyor…`)
            setupStartedRef.current.add(peerUid)
            if (amOfferer(myUid, peerUid)) setupAsOfferer(peerUid)
            else setupAsAnswerer(peerUid)
          }
        }, 2000)
      } else if (s === 'disconnected') {
        // 8 sn hâlâ kopuk ise tam yeniden kurulum
        setTimeout(() => {
          const current = pcsRef.current.get(peerUid)
          if (current && current.connectionState === 'disconnected') {
            teardownPeer(peerUid)
            if (inVoiceRef.current && !setupStartedRef.current.has(peerUid)) {
              setupStartedRef.current.add(peerUid)
              if (amOfferer(myUid, peerUid)) setupAsOfferer(peerUid)
              else setupAsAnswerer(peerUid)
            }
          }
        }, 8000)
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[VoiceChat] [${peerUid}] iceConnectionState: ${pc.iceConnectionState}`)
    }

    return pc
  }

  // ── Offerer tarafı ─────────────────────────────────────────────────────
  async function setupAsOfferer(peerUid: string) {
    removePeerUnsubs(peerUid)
    const cid = mkConnId(myUid, peerUid)
    const pc = createPc(peerUid)

    // ICE adayları: kendi adaylarımı yaz
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return
      await addDoc(offerCandCol(roomId, cid), candidateToRecord(e.candidate)).catch(() => {})
    }

    // Karşı tarafın ICE adaylarını tampona al (PC hazır olmadan önce gelebilir)
    const unsubCand = onSnapshot(answerCandCol(roomId, cid), snap => {
      snap.docChanges()
        .filter(c => c.type === 'added')
        .forEach(c => bufferCandidate(peerUid, recordToCandidate(c.doc.data() as any)))
    })
    addPeerUnsub(peerUid, unsubCand)

    // Cevabı dinle — remote desc set edilince tampondaki adayları boşalt
    const unsubConn = onSnapshot(voiceConnDoc(roomId, cid), snap => {
      const data = snap.data()
      if (data?.answer && pc.signalingState === 'have-local-offer') {
        const ans = data.answer as RTCSessionDescriptionInit
        const ansSdp = ans.sdp?.trim()
        if (ansSdp) {
          pc.setRemoteDescription(new RTCSessionDescription({
            type: ans.type,
            sdp: sanitizeSdpForBrowser(ansSdp)
          }))
            .then(() => drainCandidates(peerUid))
            .catch(() => {})
        }
      }
    })
    addPeerUnsub(peerUid, unsubConn)

    // Teklifi yaz — tuned SDP sinyal için; setLocalDescription orijinal offer ile
    try {
      const offer = await pc.createOffer()
      const rawSdp = offer.sdp?.trim()
      if (!rawSdp) {
        console.warn('[VoiceChat] createOffer boş SDP')
        return
      }
      await pc.setLocalDescription(offer)
      const tuned = { type: offer.type, sdp: tuneVoiceSdp(rawSdp) }
      await setDoc(voiceConnDoc(roomId, cid), { offer: tuned })
      // Answer PC hazır olmadan gelmiş olabilir — tekrar oku
      const snap = await getDoc(voiceConnDoc(roomId, cid))
      const answer = snap.data()?.answer as RTCSessionDescriptionInit | undefined
      if (answer?.sdp?.trim() && pc.signalingState === 'have-local-offer' && !pc.remoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: answer.type,
          sdp: sanitizeSdpForBrowser(answer.sdp.trim())
        }))
        drainCandidates(peerUid)
        console.log(`[VoiceChat] [${peerUid}] Answer uygulandı (offerer)`)
      }
    } catch (err) {
      console.warn('[VoiceChat] offer oluşturma hatası:', err)
    }
  }

  // ── Answerer: offer işle ───────────────────────────────────────────────
  async function processOfferAsAnswerer(peerUid: string, offer: RTCSessionDescriptionInit, cid: string) {
    let pc = pcsRef.current.get(peerUid)
    if (!pc) pc = createPc(peerUid)

    if (pc.signalingState !== 'stable') {
      pendingOffersRef.current.set(peerUid, offer)
      console.log(`[VoiceChat] [${peerUid}] Offer bekletiliyor (state=${pc.signalingState})`)
      return
    }

    pc.onicecandidate = async (e) => {
      if (!e.candidate) return
      await addDoc(answerCandCol(roomId, cid), candidateToRecord(e.candidate)).catch(() => {})
    }

    try {
      const offerSdp = offer.sdp?.trim()
      if (!offerSdp) {
        console.warn(`[VoiceChat] [${peerUid}] Boş offer SDP`)
        return
      }
      console.log(`[VoiceChat] [${peerUid}] Offer alındı, answer oluşturuluyor…`)
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: offer.type,
        sdp: sanitizeSdpForBrowser(offerSdp)
      }))
      drainCandidates(peerUid)
      const answer = await pc.createAnswer()
      const answerSdp = answer.sdp?.trim()
      if (!answerSdp) {
        console.warn(`[VoiceChat] [${peerUid}] createAnswer boş SDP`)
        return
      }
      await pc.setLocalDescription(answer)
      const tuned = { type: answer.type, sdp: tuneVoiceSdp(answerSdp) }
      await updateDoc(voiceConnDoc(roomId, cid), { answer: tuned })
      console.log(`[VoiceChat] [${peerUid}] Answer Firestore'a yazıldı ✓`)
    } catch (err) {
      console.warn(`[VoiceChat] [${peerUid}] answer oluşturma hatası:`, err)
    }
  }

  // ── Answerer tarafı ────────────────────────────────────────────────────
  function setupAsAnswerer(peerUid: string) {
    removePeerUnsubs(peerUid)
    const cid = mkConnId(myUid, peerUid)

    // ICE adaylarını ÖNCE dinle — PC henüz null olsa bile tampona al
    const unsubCand = onSnapshot(offerCandCol(roomId, cid), snap => {
      snap.docChanges()
        .filter(c => c.type === 'added')
        .forEach(c => bufferCandidate(peerUid, recordToCandidate(c.doc.data() as any)))
    })
    addPeerUnsub(peerUid, unsubCand)

    // Teklifi dinle
    const unsubConn = onSnapshot(voiceConnDoc(roomId, cid), snap => {
      const data = snap.data()
      if (!data?.offer) return
      if (data.answer) return // zaten cevaplandı

      const offer = data.offer as RTCSessionDescriptionInit
      void processOfferAsAnswerer(peerUid, offer, cid)
    })
    addPeerUnsub(peerUid, unsubConn)

    // Mevcut offer varsa hemen işle (listener attach öncesi yazılmış olabilir)
    void getDoc(voiceConnDoc(roomId, cid)).then(snap => {
      const data = snap.data()
      if (!data?.offer || data.answer) return
      void processOfferAsAnswerer(peerUid, data.offer as RTCSessionDescriptionInit, cid)
    })
  }

  // ── Sesli sohbete katıl ────────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    if (inVoiceRef.current || isJoining) return
    setIsJoining(true)
    setVoiceError(null)

    try {
      // Mikrofon erişimi — izin yoksa veya cihaz yoksa dinleme modunda devam et
      const ctx = ensurePlaybackContext()
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1
          }
        })
        rawMicStreamRef.current = raw
        localStreamRef.current = wireMicSendStream(raw, ctx)
      } catch {
        rawMicStreamRef.current = null
        localStreamRef.current = null
      }

      // ICE sunucu yapılandırması
      iceConfigRef.current = await getIceConfig()

      // Presence yaz — mikrofon yoksa dinleme modunda (muted=true)
      const isListenOnly = localStreamRef.current === null
      setListenOnly(isListenOnly)
      await setDoc(voicePeerDoc(roomId, myUid), {
        displayName: myNameRef.current,
        photoBase64: myPhotoRef.current || '',
        muted: isListenOnly,
        listenOnly: isListenOnly,
        joinedAt: Date.now()
      })

      // Snapshot listener ilk tetiklendiğinde mevcut tüm peer'ları ADDED olarak verir —
      // ayrıca getDocs() çağrısına GEREK YOK, duplicate setup olur.
      const unsubPeers = onSnapshot(voicePeersCol(roomId), snap => {
        // Bağlantı yönetimi
        snap.docChanges().forEach(change => {
          const peerUid = change.doc.id
          if (peerUid === myUid) return

          if (change.type === 'added') {
            // setupStarted senkron güncellenir — race condition önlenir
            if (setupStartedRef.current.has(peerUid)) return
            setupStartedRef.current.add(peerUid)
            if (amOfferer(myUid, peerUid)) {
              setupAsOfferer(peerUid)
            } else {
              setupAsAnswerer(peerUid)
            }
          } else if (change.type === 'removed') {
            teardownPeer(peerUid)
          } else if (change.type === 'modified') {
            const renog = (change.doc.data().renogAt as number) ?? 0
            if (renog > 0) handlePeerRenog(peerUid, renog)
          }
        })
        // Katılımcı listesini güncelle + giriş/çıkış event'leri oluştur
        const peers: VoicePeer[] = snap.docs.map(d => {
          const data = d.data()
          const connState = d.id === myUid ? 'self' : (peerStatesRef.current.get(d.id) ?? 'connecting')
          return {
            uid: d.id,
            displayName: (data.displayName as string) || translate('common_user'),
            photoBase64: (data.photoBase64 as string) || '',
            muted: (data.muted as boolean) ?? false,
            listenOnly: (data.listenOnly as boolean) ?? false,
            connectionState: connState
          }
        })
        setVoicePeersList(peers)

        // Giriş/çıkış bildirimi — kendi değişimlerini hariç tut
        const newEvents: VoiceEvent[] = []
        snap.docChanges().forEach(ch => {
          if (ch.doc.id === myUid) return
          const name = (ch.doc.data().displayName as string) || translate('common_user')
          if (ch.type === 'added' && !prevPeersRef.current.has(ch.doc.id)) {
            newEvents.push({ type: 'joined', displayName: name })
          } else if (ch.type === 'removed') {
            newEvents.push({ type: 'left', displayName: prevPeersRef.current.get(ch.doc.id) || name })
          }
        })
        // prevPeers güncelle
        prevPeersRef.current = new Map(peers.map(p => [p.uid, p.displayName]))
        if (newEvents.length > 0) {
          setVoiceEvents(prev => [...prev, ...newEvents])
        }
      })
      unsubsRef.current.push(unsubPeers)

      // Konuşma tespiti — 300ms aralıkla poll
      speakIntervalRef.current = setInterval(() => {
        const speaking = new Set<string>()

        // Yerel konuşma tespiti (RMS analiz)
        const analyser = localAnalyserRef.current
        const micTransmitting = analyser && !mutedRef.current && !deafenedRef.current &&
          (!pushToTalkRef.current || pttActiveRef.current)
        if (micTransmitting) {
          const buf = new Uint8Array(analyser.fftSize)
          analyser.getByteTimeDomainData(buf)
          const rms = Math.sqrt(buf.reduce((s, v) => s + (v - 128) ** 2, 0) / buf.length)
          setLocalMicLevel(Math.min(1, rms / 18))
          if (rms > speakRmsRef.current) speaking.add(myUid)
        } else {
          setLocalMicLevel(0)
        }

        const remoteThresh = remoteSpeakThresholdFromRms(speakRmsRef.current)
        // Uzak konuşma tespiti (WebRTC audio level)
        pcsRef.current.forEach((pc, peerUid) => {
          if (pc.connectionState !== 'connected') return
          pc.getReceivers().forEach(receiver => {
            if (receiver.track.kind !== 'audio') return
            const sources = receiver.getSynchronizationSources()
            if (sources.some(s => (s.audioLevel ?? 0) > remoteThresh)) {
              speaking.add(peerUid)
            }
          })
        })

        setSpeakingUids(prev => {
          if (prev.size === speaking.size && [...prev].every(u => speaking.has(u))) return prev
          return new Set(speaking)
        })
      }, 300)

      inVoiceRef.current = true
      setVoiceActive(true)
      setInVoice(true)
    } catch (err: any) {
      console.error('[VoiceChat] Katılamadı:', err)
      cleanup()
      setVoiceError(translate('watch_voice_join_failed', (err as Error).message ?? translate('common_unknown_error')))
    } finally {
      setIsJoining(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid, myName, isJoining])

  // ── Stale ICE alt koleksiyonlarını temizle ────────────────────────────
  async function deleteSubcollection(colRef: ReturnType<typeof collection>) {
    try {
      const snap = await getDocs(colRef)
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
    } catch { /* görmezden gel */ }
  }

  // ── Sesli sohbetten çık ────────────────────────────────────────────────
  const leaveVoice = useCallback(async () => {
    if (!inVoiceRef.current) return
    // Temizlemeden önce mevcut peer'ları yakala
    const peers = [...pcsRef.current.keys()]
    cleanup()
    inVoiceRef.current = false
    mutedRef.current = false
    setInVoice(false)
    setMutedState(false)
    setListenOnly(false)
    // Presence sil
    await deleteDoc(voicePeerDoc(roomId, myUid)).catch(() => {})
    // Tüm bağlantılara ait ICE alt koleksiyonları + doc'u temizle
    // (Firestore parent silinince subcollection silinmez → stale ICE problem)
    await Promise.all(
      peers.map(async peerUid => {
        const cid = mkConnId(myUid, peerUid)
        await deleteSubcollection(offerCandCol(roomId, cid))
        await deleteSubcollection(answerCandCol(roomId, cid))
        if (myUid < peerUid) { // offerer'dim
          await deleteDoc(voiceConnDoc(roomId, cid)).catch(() => {})
        }
      })
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid])

  // ── Mikrofonu sustur / aç ──────────────────────────────────────────────
  const setPeerVolume = useCallback((peerUid: string, level: number) => {
    if (peerUid === myUid) {
      setMicGain(level * MIC_GAIN_MAX)
      return
    }
    const v = Math.max(0, Math.min(1, level))
    peerVolumesRef.current.set(peerUid, v)
    setPeerVolumes(prev => ({ ...prev, [peerUid]: v }))
    const nodes = remoteAudioNodesRef.current.get(peerUid)
    if (nodes) nodes.gain.gain.value = REMOTE_VOICE_GAIN * peerGainMultiplier(peerUid)
  }, [myUid, setMicGain])

  const togglePeerLocalMute = useCallback((peerUid: string) => {
    if (peerUid === myUid) {
      if (micGainRef.current > 0.01) {
        savedMicGainRef.current = micGainRef.current
        setMicGain(0)
      } else {
        setMicGain(savedMicGainRef.current > 0.01 ? savedMicGainRef.current : MIC_GAIN_DEFAULT)
      }
      return
    }
    const next = new Set(peerLocalMutedRef.current)
    if (next.has(peerUid)) next.delete(peerUid)
    else next.add(peerUid)
    peerLocalMutedRef.current = next
    setPeerLocalMuted(new Set(next))
    const nodes = remoteAudioNodesRef.current.get(peerUid)
    if (nodes) nodes.gain.gain.value = REMOTE_VOICE_GAIN * peerGainMultiplier(peerUid)
  }, [myUid, setMicGain])

  const toggleDeafen = useCallback(() => {
    const newDeaf = !deafenedRef.current
    deafenedRef.current = newDeaf
    setDeafenedState(newDeaf)
    if (newDeaf) {
      if (!mutedRef.current) {
        mutedRef.current = true
        setMutedState(true)
        setDoc(voicePeerDoc(roomId, myUid), { muted: true }, { merge: true }).catch(() => {})
      }
    } else if (mutedRef.current) {
      mutedRef.current = false
      setMutedState(false)
      setDoc(voicePeerDoc(roomId, myUid), { muted: false }, { merge: true }).catch(() => {})
    }
    updateMicTransmission()
    remoteAudioNodesRef.current.forEach((nodes, peerUid) => {
      nodes.gain.gain.value = REMOTE_VOICE_GAIN * peerGainMultiplier(peerUid)
    })
  }, [roomId, myUid])

  const toggleMute = useCallback(() => {
    if (deafenedRef.current) toggleDeafen()
    const newMuted = !mutedRef.current
    mutedRef.current = newMuted
    updateMicTransmission()
    setMutedState(newMuted)
    setDoc(voicePeerDoc(roomId, myUid), { muted: newMuted }, { merge: true }).catch(() => {})
  }, [roomId, myUid, toggleDeafen])

  const setPushToTalk = useCallback((enabled: boolean) => {
    pushToTalkRef.current = enabled
    setPushToTalkState(enabled)
    if (!enabled) {
      pttActiveRef.current = false
      setPttActiveState(false)
    }
    try { localStorage.setItem('wtf_push_to_talk', enabled ? '1' : '0') } catch { /* yut */ }
    updateMicTransmission()
  }, [])

  const setPttActive = useCallback((active: boolean) => {
    if (!pushToTalkRef.current) return
    pttActiveRef.current = active
    setPttActiveState(active)
    updateMicTransmission()
  }, [])

  /** Dinleme modundayken veya mikrofon sonradan açıldığında */
  const enableMicrophone = useCallback(async (): Promise<boolean> => {
    if (!inVoiceRef.current) return false
    if (localStreamRef.current) return true
    try {
      const ctx = ensurePlaybackContext()
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      })
      rawMicStreamRef.current = raw
      localStreamRef.current = wireMicSendStream(raw, ctx)
      setListenOnly(false)
      mutedRef.current = false
      setMutedState(false)
      await updateDoc(voicePeerDoc(roomId, myUid), {
        muted: false,
        listenOnly: false,
        renogAt: Date.now()
      }).catch(() => {})
      await renegotiateAllPeersForMic()
      return true
    } catch (err) {
      console.warn('[VoiceChat] Mikrofon açılamadı:', err)
      return false
    }
  }, [roomId, myUid])

  // Ağ geri gelince ses bağlantılarını yenile
  useEffect(() => {
    if (!inVoice) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onOnline = () => {
      if (!inVoiceRef.current) return
      timer = setTimeout(() => {
        if (!inVoiceRef.current) return
        console.log('[VoiceChat] Ağ geri geldi → ses bağlantıları yenileniyor')
        void reconnectAllPeersForMic()
      }, 1200)
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (timer) clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inVoice])

  // ── Bileşen unmount'ta temizlik ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (!inVoiceRef.current) return
      const peers = [...pcsRef.current.keys()]
      cleanup()
      inVoiceRef.current = false
      deleteDoc(voicePeerDoc(roomId, myUid)).catch(() => {})
      Promise.all(
        peers.map(async peerUid => {
          const cid = mkConnId(myUid, peerUid)
          await deleteSubcollection(offerCandCol(roomId, cid))
          await deleteSubcollection(answerCandCol(roomId, cid))
          if (myUid < peerUid) {
            await deleteDoc(voiceConnDoc(roomId, cid)).catch(() => {})
          }
        })
      ).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid])

  useEffect(() => {
    if (!inVoice) return
    void updateDoc(voicePeerDoc(roomId, myUid), {
      displayName: myNameRef.current,
      photoBase64: myPhotoRef.current || ''
    }).catch(() => {})
  }, [roomId, myUid, myName, myPhotoBase64, inVoice])

  return {
    inVoice, isJoining, voiceError, muted: mutedState, listenOnly,
    speakingUids, voicePeersList, voiceEvents,
    peerVolumes, peerLocalMuted, micGain, speakRmsThreshold, localMicLevel,
    deafened, pushToTalk, pttActive,
    joinVoice, leaveVoice, toggleMute, toggleDeafen, enableMicrophone,
    setPushToTalk, setPttActive,
    setPeerVolume, togglePeerLocalMute,
    setMicGain, setSpeakRmsThreshold
  }
}
