/**
 * Çalışan desktop YT sunucusuna (7842) karşı gerçek oda iframe simülasyonu.
 * Önce: npm run dev veya kurulu WatchToFriend açık olmalı.
 */
import http from 'http'
import { chromium } from 'playwright'

const YT_PORT = 7842
const PARENT_PORT = 7843
const VIDEO_ID = 'T7fztphWUYE'

function buildParentHtml() {
  const src = `http://127.0.0.1:${YT_PORT}/yt?v=${VIDEO_ID}&autoplay=1&start=0&ctrl=1`
  return `<!DOCTYPE html><html><body style="margin:0;background:#111">
<iframe id="yt" src="${src}" style="width:960px;height:540px;border:0" allow="autoplay; encrypted-media"></iframe>
<script>
const logs=[];
let ready=false;
window.addEventListener('message',(e)=>{
  if(!e.data?.type) return;
  logs.push(e.data);
  if(e.data.type==='YT_READY'){
    ready=true;
    document.getElementById('yt').contentWindow.postMessage({cmd:'play',pos:0},'*');
  }
  if(e.data.type==='YT_STATE' && e.data.state===1) window.__playing=true;
  if(e.data.type==='YT_STATE' && e.data.state===3) window.__buffering=true;
});
window.__snapshot=()=>({ready,playing:!!window.__playing,buffering:!!window.__buffering,logs:logs.slice(-8)});
</script></body></html>`
}

async function checkYtServer() {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${YT_PORT}/yt?v=${VIDEO_ID}&autoplay=1`, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        resolve({
          up: res.statusCode === 200,
          hasNocookie: body.includes('youtube-nocookie.com'),
          hasVideoId: body.includes(VIDEO_ID)
        })
      })
    }).on('error', () => resolve({ up: false }))
  })
}

const srvInfo = await checkYtServer()
console.log('YT sunucu 7842:', srvInfo)
if (!srvInfo.up) {
  console.error('7842 kapalı — önce npm run dev veya WatchToFriend açın')
  process.exit(1)
}

const parentSrv = await new Promise((resolve) => {
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(buildParentHtml())
  })
  srv.listen(PARENT_PORT, '127.0.0.1', () => resolve(srv))
})

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayTypes']
})
const page = await browser.newPage()
const consoleLines = []
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))

await page.goto(`http://127.0.0.1:${PARENT_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
let elapsed = 0
for (const step of [3000, 3000, 4000, 5000]) {
  await page.waitForTimeout(step)
  elapsed += step
  const snap = await page.evaluate(() => window.__snapshot())
  console.log(`t+${elapsed}ms:`, JSON.stringify(snap))
  if (snap.playing) break
}

const final = await page.evaluate(() => window.__snapshot())
const issues = consoleLines.filter((l) => /error|postMessage|153|150|101|failed|unavailable/i.test(l))

console.log('\n=== HATA ANALİZİ (T7fztphWUYE) ===')
console.log('nocookie host HTML\'de:', srvInfo.hasNocookie)
console.log('YT_READY:', final.ready)
console.log('Oynatılıyor (state=1):', final.playing)
console.log('Son YT_STATE logları:', final.logs.map((l) => `state=${l.state} t=${l.time?.toFixed?.(1) ?? l.time}`).join(', ') || '(yok)')
if (issues.length) {
  console.log('\nKonsol uyarıları:')
  issues.forEach((l) => console.log(' ', l))
} else {
  console.log('Kritik konsol uyarısı yok')
}

await browser.close()
parentSrv.close()
process.exit(final.playing ? 0 : 2)
