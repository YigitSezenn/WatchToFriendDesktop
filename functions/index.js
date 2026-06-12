const functions = require('firebase-functions')
const { join } = require('path')
const { createReadStream, existsSync } = require('fs')

const INSTALLER = 'WatchToFriend-Setup-1.2.2.exe'

exports.downloadInstaller = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .https.onRequest((req, res) => {
    const filePath = join(__dirname, 'installer', INSTALLER)
    if (!existsSync(filePath)) {
      res.status(404).send('Kurulum dosyası bulunamadı.')
      return
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${INSTALLER}"`)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    createReadStream(filePath).pipe(res)
  })
