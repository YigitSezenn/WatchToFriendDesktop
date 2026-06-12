/** Android WebView ile aynı gömme kökeni — localhost yerine gerçek site origin'i. */
export const YT_EMBED_ORIGIN = 'https://watchtofriend.app'

export interface YtEmbedParams {
  videoId: string
  autoplay: number
  startSec: number
  showControls: number
}

export function parseYtEmbedUrl(url: string): YtEmbedParams | null {
  try {
    const u = new URL(url)
    const videoId = u.searchParams.get('v')
    if (!videoId || !/^[a-zA-Z0-9_-]{1,20}$/.test(videoId)) return null
    return {
      videoId,
      autoplay: u.searchParams.get('autoplay') === '1' ? 1 : 0,
      startSec: Math.max(0, Math.min(86400, parseInt(u.searchParams.get('start') ?? '0', 10) || 0)),
      showControls: u.searchParams.get('ctrl') !== '0' ? 1 : 0
    }
  } catch {
    return null
  }
}

export function buildYtPageHtml(
  videoId: string,
  autoplay: number,
  startSec: number,
  showControls: number
): string {
  const origin = YT_EMBED_ORIGIN
  return `<!DOCTYPE html>
<html><head>
<meta name="referrer" content="origin">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;width:100vw;height:100vh;overflow:hidden}#player{width:100%;height:100%}</style>
</head><body>
<div id="player"></div>
<script>
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
var player=null,playerReady=false,pendingRemote=null,progressTimer=null;
var __suppressUntil=0;
var __endedFired=false;
function startProgressTimer(){
  if(progressTimer)return;
  progressTimer=setInterval(function(){
    if(!player||!playerReady)return;
    try{
      var c=player.getCurrentTime?player.getCurrentTime():0;
      var d=player.getDuration?player.getDuration():0;
      postToHost({type:'YT_PROGRESS',current:c||0,duration:d||0});
    }catch(e){}
  },1000);
}
function stopProgressTimer(){
  if(progressTimer){clearInterval(progressTimer);progressTimer=null;}
}
function postToHost(data){
  if(window.ytBridge){window.ytBridge.postEvent(data);}
  else if(window.parent&&window.parent!==window){window.parent.postMessage(data,'*');}
}
function applyRemote(isPlaying,sec,doSeek,force){
  __suppressUntil=Date.now()+2500;
  if(!player||!playerReady){
    pendingRemote={isPlaying:isPlaying,sec:sec,doSeek:doSeek!==false,force:!!force};
    return;
  }
  if(doSeek!==false&&player.seekTo){
    var dur=(player.getDuration&&player.getDuration())||0;
    if(dur>1&&sec>dur-1)sec=Math.max(0,dur-1);
    var cur=(player.getCurrentTime&&player.getCurrentTime())||0;
    if(force||Math.abs(cur-sec)>1.5)player.seekTo(sec,true);
  }
  if(isPlaying){
    if(player.playVideo)player.playVideo();
  }else{
    if(player.pauseVideo)player.pauseVideo();
    setTimeout(function(){
      __suppressUntil=Date.now()+1200;
      if(player&&player.pauseVideo)player.pauseVideo();
    },600);
  }
}
function handleCmd(cmd){
  if(!cmd)return;
  if(cmd.cmd==='applyRemote'){
    applyRemote(!!cmd.isPlaying,typeof cmd.pos==='number'?cmd.pos:0,cmd.doSeek!==false,!!cmd.force);
    return;
  }
  if(cmd.cmd==='play'){applyRemote(true,typeof cmd.pos==='number'?cmd.pos:0,cmd.doSeek!==false,!!cmd.force);return;}
  if(cmd.cmd==='pause'){applyRemote(false,typeof cmd.pos==='number'?cmd.pos:0,cmd.doSeek!==false,!!cmd.force);return;}
  if(cmd.cmd==='seek'){
    __suppressUntil=Date.now()+2500;
    if(!player||!playerReady){pendingRemote={isPlaying:true,sec:cmd.pos,doSeek:true,force:true};return;}
    if(player.seekTo)player.seekTo(cmd.pos,true);
  }
}
function onPlayerStateChange(e){
  if(e.data===0){
    if(!__endedFired){
      __endedFired=true;
      stopProgressTimer();
      postToHost({type:'YT_ENDED'});
    }
    return;
  }
  if(Date.now()<__suppressUntil)return;
  var t=player&&player.getCurrentTime?player.getCurrentTime():0;
  var d=player&&player.getDuration?player.getDuration():0;
  postToHost({type:'YT_STATE',state:e.data,time:t,duration:d});
  if(e.data===1)startProgressTimer();
  else if(e.data===2)stopProgressTimer();
}
function onYouTubeIframeAPIReady(){
  __endedFired=false;
  player=new YT.Player('player',{
    videoId:'${videoId}',
    playerVars:{autoplay:${autoplay},controls:${showControls},disablekb:${showControls ? 0 : 1},enablejsapi:1,start:${startSec},origin:'${origin}',widget_referrer:'${origin}/',playsinline:1,rel:0,modestbranding:1},
    events:{
      onReady:function(){
        playerReady=true;
        postToHost({type:'YT_READY'});
        if(pendingRemote){
          var p=pendingRemote;pendingRemote=null;
          applyRemote(p.isPlaying,p.sec,p.doSeek,p.force);
        }else if(${autoplay}&&player&&player.playVideo){
          try{player.playVideo();}catch(err){}
        }
        if(player&&player.getPlayerState&&player.getPlayerState()===1)startProgressTimer();
      },
      onError:function(e){console.error('[YT iframe] error',e.data);postToHost({type:'YT_ERROR',code:e.data});},
      onStateChange:onPlayerStateChange
    }
  });
}
if(window.ytBridge){
  window.ytBridge.onCmd(function(cmd){handleCmd(cmd);});
}else{
  window.addEventListener('message',function(e){handleCmd(e.data);});
}
</script>
</body></html>`
}

export function ytPageDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export function loadYtEmbedPage(
  webContents: Electron.WebContents,
  params: YtEmbedParams
): Promise<void> {
  const html = buildYtPageHtml(params.videoId, params.autoplay, params.startSec, params.showControls)
  return webContents.loadURL(ytPageDataUrl(html), {
    baseURLForDataURL: `${YT_EMBED_ORIGIN}/`
  })
}
