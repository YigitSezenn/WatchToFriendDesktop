/**
 * Yerel YT sunucusunu (7842) taklit ederek T7fztphWUYE embed + senkron testi.
 */
import http from 'http'
import { chromium } from 'playwright'

const YT_PORT = 7842
const VIDEO_ID = 'T7fztphWUYE'

function buildPlayerHtml(videoId, { nocookie = true } = {}) {
  const hostLine = nocookie ? "    host:'https://www.youtube-nocookie.com',\n" : ''
  return `<!DOCTYPE html>
<html><head>
<style>*{margin:0;padding:0}body{background:#000;width:100vw;height:100vh}#player{width:100%;height:100%}</style>
</head><body>
<div id="player"></div>
<script>
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
var player=null,playerReady=false,pendingCmd=null;
function runCmd(cmd){
  if(!player||!playerReady||!cmd)return;
  if(cmd.cmd==='play'){player.seekTo(cmd.pos,true);player.playVideo();}
  if(cmd.cmd==='pause'){player.pauseVideo();}
}
function onYouTubeIframeAPIReady(){
  player=new YT.Player('player',{
    videoId:'${videoId}',
    playerVars:{autoplay:1,controls:1,enablejsapi:1,start:0,origin:'http://127.0.0.1:${YT_PORT}',playsinline:1,rel:0},
${hostLine}    events:{
      onReady:function(){
        playerReady=true;
        window.parent.postMessage({type:'YT_READY'},'*');
        player.seekTo(0,true);player.playVideo();
        if(pendingCmd){runCmd(pendingCmd);pendingCmd=null;}
      },
      onError:function(e){window.__ytError=e.data;},
      onStateChange:function(e){
        window.__state=e.data;
        if(player&&player.getCurrentTime)window.parent.postMessage({type:'YT_STATE',state:e.data,time:player.getCurrentTime()},'*');
      }
    }
  });
}
window.addEventListener('message',function(e){
  if(!e.data||!e.data.cmd)return;
  var cmd={cmd:e.data.cmd,pos:typeof e.data.pos==='number'?e.data.pos:0};
  if(!playerReady){pendingCmd=cmd;return;}
  runCmd(cmd);
});
</script>
</body></html>`
}

function buildParentHtml() {
  return `<!DOCTYPE html><html><body style="margin:0">
<iframe id="yt" src="http://127.0.0.1:${YT_PORT}/" style="width:960px;height:540px;border:0" allow="autoplay"></iframe>
<script>
const logs=[];
window.addEventListener('message',(e)=>{
  if(e.data?.type) logs.push(JSON.stringify(e.data));
  if(e.data?.type==='YT_STATE' && e.data.state===1) window.__playing=true;
  if(e.data?.type==='YT_READY') {
    document.getElementById('yt').contentWindow.postMessage({cmd:'play',pos:0},'*');
  }
});
window.__getLogs=()=>logs;
</script></body></html>`
}

function startServer(html) {
  return new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    srv.listen(YT_PORT, '127.0.0.1', () => resolve(srv))
  })
}

async function runTest(label, nocookie) {
  const playerSrv = await startServer(buildPlayerHtml(VIDEO_ID, { nocookie }))
  const parentSrv = await startServer(buildParentHtml())
  const PARENT_PORT = 7843
  parentSrv.close()
  const parentSrv2 = await new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buildParentHtml())
    })
    srv.listen(PARENT_PORT, '127.0.0.1', () => resolve(srv))
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleLines = []
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))

  await page.goto(`http://127.0.0.1:${PARENT_PORT}/`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(8000)

  const result = await page.evaluate(() => ({
    playing: !!window.__playing,
    logs: window.__getLogs?.() ?? [],
    ytError: window.frames[0]?.__ytError ?? null,
    state: window.frames[0]?.__state ?? null
  }))

  const issues = consoleLines.filter((l) => /error|postMessage|153|150|101|failed/i.test(l))

  console.log(`\n=== ${label} ===`)
  console.log('playing:', result.playing, '| state:', result.state, '| YT err:', result.ytError)
  console.log('parent msgs:', result.logs.slice(-5).join(' | ') || '(none)')
  if (issues.length) console.log('Console:\n' + issues.slice(0, 6).join('\n'))

  await browser.close()
  playerSrv.close()
  parentSrv2.close()
  return { playing: result.playing, issues }
}

const withNocookie = await runTest('WITH nocookie (mevcut desktop)', true)
const withoutNocookie = await runTest('WITHOUT nocookie (düzeltme)', false)
console.log('\n--- Sonuç T7fztphWUYE ---')
console.log('nocookie oynatıyor:', withNocookie.playing, '| uyarı:', withNocookie.issues.length)
console.log('standart oynatıyor:', withoutNocookie.playing, '| uyarı:', withoutNocookie.issues.length)
