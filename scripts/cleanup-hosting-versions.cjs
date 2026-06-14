/**
 * Eski Firebase Hosting version'larını siler (kotayı açmak için).
 * Kullanım: node scripts/cleanup-hosting-versions.cjs
 */
const hostingApi = require('firebase-tools/lib/hosting/api')
const apiv2 = require('firebase-tools/lib/apiv2')
const api = require('firebase-tools/lib/api')
const { requireAuth } = require('firebase-tools/lib/requireAuth')

const SITE = 'watchtofriend'
const KEEP = 1

async function deleteVersion(versionName) {
  const client = new apiv2.Client({
    urlPrefix: api.hostingApiOrigin(),
    apiVersion: 'v1beta1',
    auth: true
  })
  await client.delete(`/${versionName}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  await requireAuth({ project: 'watchtofriend' })
  const versions = await hostingApi.listVersions(SITE)
  if (!versions.length) {
    console.log('Silinecek version yok.')
    return
  }

  const sorted = [...versions].sort((a, b) => {
    const at = Date.parse(a.createTime || '') || 0
    const bt = Date.parse(b.createTime || '') || 0
    return bt - at
  })

  const toDelete = sorted.slice(KEEP)
  console.log(`Toplam ${versions.length} version, ${toDelete.length} tanesi silinecek (son ${KEEP} korunuyor).`)

  for (const version of toDelete) {
    const name = version.name
    if (!name) continue
    try {
      console.log('Siliniyor:', name, version.createTime || '')
      await deleteVersion(name)
      await sleep(1500)
    } catch (err) {
      console.error('Silinemedi:', name, err?.message || err)
      await sleep(3000)
    }
  }

  console.log('Temizlik tamam.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
