import { useEffect, useRef, useState, useCallback } from 'react'
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore'
import { db } from '../firebase/config'

const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

// Cloudflare TURN credential'larını main process'ten al (mevcut env token)
async function fetchIceConfig(): Promise<RTCConfiguration> {
  const api = (window as any).electronAPI
  if (!api?.getTurnCredentials) return FALLBACK_ICE
  try {
    const resp = await api.getTurnCredentials()
    if (resp?.iceServers) return { iceServers: resp.iceServers }
  } catch { /* yut */ }
  return FALLBACK_ICE
}

// Bağlantı ID'si: iki UID'i sıralayıp birleştir (deterministic)
function connId(a: string, b: string) {
  return [a, b].sort().join('_')
}

interface PeerState {
  pc: RTCPeerConnection
  remoteUid: string
  stream: MediaStream | null
}

export function useWebRTC(roomId: string, myUid: string, memberUids: string[]) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [micOn, setMicOn] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const peers = useRef<Map<string, PeerState>>(new Map())
  const unsubscribers = useRef<Array<() => void>>([])
  // Stream'leri ref'te de tut → cleanup effect stale closure yakalamaz
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Mikrofonu aç/kapat
  const toggleMic = useCallback(async () => {
    if (!micOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        localStreamRef.current = stream
        setLocalStream(stream)
        setMicOn(true)
        // Mevcut peer bağlantılarına ses track'i ekle
        peers.current.forEach(({ pc }) => {
          stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream))
        })
      } catch (e) {
        console.error('Mikrofon erişimi reddedildi:', e)
      }
    } else {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      setLocalStream(null)
      setMicOn(false)
    }
  }, [micOn, localStream])

  // Ekran paylaşımını aç/kapat
  const toggleScreen = useCallback(async () => {
    if (!sharingScreen) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStreamRef.current = stream
        setScreenStream(stream)
        setSharingScreen(true)
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null
          setSharingScreen(false)
          setScreenStream(null)
        }
        peers.current.forEach(({ pc }) => {
          stream.getTracks().forEach((t) => pc.addTrack(t, stream))
        })
      } catch (e) {
        console.error('Ekran paylaşımı reddedildi:', e)
      }
    } else {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
      setScreenStream(null)
      setSharingScreen(false)
    }
  }, [sharingScreen, screenStream])

  // Peer bağlantısı kur
  const createPeer = useCallback(
    async (remoteUid: string, isOfferer: boolean) => {
      if (peers.current.has(remoteUid)) return
      const iceConfig = await fetchIceConfig()
      const pc = new RTCPeerConnection(iceConfig)

      // Mevcut local stream track'lerini ekle
      if (localStream) {
        localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))
      }
      if (screenStream) {
        screenStream.getTracks().forEach((t) => pc.addTrack(t, screenStream))
      }

      // Uzak stream'i al
      const remoteStream = new MediaStream()
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t))
        setRemoteStreams((prev) => new Map(prev).set(remoteUid, remoteStream))
      }

      const cid = connId(myUid, remoteUid)
      const connRef = doc(db, 'rooms', roomId, 'rtc', cid)
      const myRole = isOfferer ? 'callerCandidates' : 'calleeCandidates'
      const theirRole = isOfferer ? 'calleeCandidates' : 'callerCandidates'

      // ICE adaylarını Firestore'a gönder
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await addDoc(collection(connRef, myRole), e.candidate.toJSON())
        }
      }

      peers.current.set(remoteUid, { pc, remoteUid, stream: remoteStream })

      if (isOfferer) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await setDoc(connRef, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true })

        // Cevabı dinle
        const unsub = onSnapshot(connRef, async (snap) => {
          const data = snap.data()
          if (!pc.currentRemoteDescription && data?.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
          }
        })
        unsubscribers.current.push(unsub)
      } else {
        // Teklifi dinle ve cevap ver
        const unsub = onSnapshot(connRef, async (snap) => {
          const data = snap.data()
          if (!pc.currentRemoteDescription && data?.offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await setDoc(connRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true })
          }
        })
        unsubscribers.current.push(unsub)
      }

      // Karşı tarafın ICE adaylarını dinle
      const candUnsub = onSnapshot(collection(connRef, theirRole), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data()))
          }
        })
      })
      unsubscribers.current.push(candUnsub)
    },
    [roomId, myUid, localStream, screenStream]
  )

  // Oda üyeleri değişince bağlantıları güncelle
  useEffect(() => {
    if (!roomId || !myUid) return
    const others = memberUids.filter((id) => id !== myUid)
    others.forEach((remoteUid) => {
      if (!peers.current.has(remoteUid)) {
        // Küçük UID offerer olur (deterministic)
        const isOfferer = myUid < remoteUid
        createPeer(remoteUid, isOfferer)
      }
    })
    // Ayrılan üyelerin bağlantılarını kapat
    peers.current.forEach((state, uid) => {
      if (!others.includes(uid)) {
        state.pc.close()
        peers.current.delete(uid)
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.delete(uid)
          return next
        })
      }
    })
  }, [memberUids, myUid, roomId, createPeer])

  // Temizle — ref kullan, stale closure olmasın
  useEffect(() => {
    return () => {
      unsubscribers.current.forEach((u) => u())
      peers.current.forEach(({ pc }) => pc.close())
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    localStream,
    screenStream,
    remoteStreams,
    micOn,
    sharingScreen,
    toggleMic,
    toggleScreen
  }
}
