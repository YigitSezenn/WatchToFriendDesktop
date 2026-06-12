/**
 * Oda içi ses koordinasyonu — sesli sohbet + ekran paylaşımı aynı anda aktifken
 * bant genişliği ve uzak ses kazancını ayarlar (Android RoomAudioRouter karşılığı).
 */

let voiceActive = false
let screenShareActive = false

/** Web Audio GainNode — HTMLAudioElement.volume 1.0 üst sınırını aşmak için */
export const REMOTE_VOICE_GAIN = 2.8

/** Ekran paylaşımı uzak sesi (WebRTC video akışı) */
export const REMOTE_SCREEN_SHARE_GAIN = 1.6

export function setVoiceActive(active: boolean): void {
  voiceActive = active
}

export function setScreenShareActive(active: boolean): void {
  screenShareActive = active
}

export function isCombinedMode(): boolean {
  return voiceActive && screenShareActive
}

/** Sesli sohbet + ekran paylaşımı birlikteyken Opus bitrate düşürülür */
export function getScreenShareAudioBitrate(): number {
  return isCombinedMode() ? 160_000 : 510_000
}
