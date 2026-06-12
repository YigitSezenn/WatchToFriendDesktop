/**
 * Profil fotoğrafı format köprüsü — MOBİL İLE UYUMLU.
 *
 * Mobil (Android) profil fotoğrafını Firestore'a ham base64 olarak (data-url
 * ÖNEKSİZ, Base64.NO_WRAP) kaydeder. Desktop da aynı formatta ve benzer boyutta
 * (≈256px JPEG) sıkıştırarak kaydeder.
 *
 * Firestore tek alan limiti: 1.048.487 byte — büyük fotoğraflar bu hatayı verir.
 */

/** Firestore güvenli üst sınır (ham base64 karakter sayısı). */
export const MAX_PHOTO_BASE64_LEN = 900_000

/** Avatar için hedef en uzun kenar (px) — Android ile aynı. */
const TARGET_MAX_EDGE = 256

/** <img src> için kullanılabilir bir değer döndürür. Boşsa null. */
export function photoSrc(photoBase64?: string | null): string | null {
  if (!photoBase64) return null
  const v = photoBase64.trim()
  if (!v) return null
  if (v.startsWith('data:')) return v
  return `data:image/jpeg;base64,${v}`
}

/** Firestore'a kaydetmeden önce data-url önekini ayıklar → ham base64. */
export function normalizePhotoForStorage(dataUrlOrBase64: string): string {
  const v = (dataUrlOrBase64 ?? '').trim()
  if (!v) return ''
  if (v.startsWith('data:')) return v.split(',')[1] ?? ''
  return v
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Fotoğraf okunamadı'))
    img.src = src
  })
}

/**
 * Profil fotoğrafını küçültüp JPEG'e çevirir; Firestore limitinin altında kalır.
 */
export async function compressPhotoForStorage(dataUrlOrBase64: string): Promise<string> {
  const trimmed = (dataUrlOrBase64 ?? '').trim()
  if (!trimmed) return ''

  const dataUrl = trimmed.startsWith('data:')
    ? trimmed
    : `data:image/jpeg;base64,${trimmed}`

  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Fotoğraf işlenemedi')

  let maxEdge = TARGET_MAX_EDGE
  let quality = 0.7
  let last = ''

  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    last = normalizePhotoForStorage(canvas.toDataURL('image/jpeg', quality))
    if (last.length <= MAX_PHOTO_BASE64_LEN) return last
    if (quality > 0.45) quality -= 0.08
    else maxEdge = Math.round(maxEdge * 0.8)
  }

  if (last.length > MAX_PHOTO_BASE64_LEN) {
    throw new Error('Fotoğraf çok büyük. Daha küçük bir görsel seçin.')
  }
  return last
}
