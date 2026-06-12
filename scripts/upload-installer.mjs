/**
 * Kurulum .exe dosyasını Firebase Storage'a yükler (Spark plan Hosting .exe yasak).
 * Kullanım: node scripts/upload-installer.mjs
 * Önkoşul: firebase login && gcloud auth application-default login (veya service account)
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const localName = `WatchToFriend-Setup-${version}.exe`
const localPath = join(root, 'public', localName)
const releasePath = join(root, 'release', `WatchToFriend Setup ${version}.exe`)
const source = existsSync(localPath) ? localPath : releasePath

if (!existsSync(source)) {
  console.error('Kurulum dosyası bulunamadı:', source)
  console.error('Önce npm run dist çalıştır.')
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: 'watchtofriend',
    storageBucket: 'watchtofriend.firebasestorage.app'
  })
}

const dest = `downloads/${localName}`
console.log(`Yükleniyor: ${source} → gs://${dest}`)

const bucket = getStorage().bucket()
await bucket.upload(source, {
  destination: dest,
  metadata: {
    contentType: 'application/octet-stream',
    cacheControl: 'public, max-age=3600'
  }
})

await bucket.file(dest).makePublic()
const publicUrl = `https://storage.googleapis.com/watchtofriend.firebasestorage.app/${dest}`
console.log('\nPublic URL:')
console.log(publicUrl)
console.log('\nindex.html indirme linklerine bu URL\'yi yapıştır.')
