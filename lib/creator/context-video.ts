import { mediaCropFit, requireUsableMedia, type MediaAsset } from './media-asset'

export async function loadContextVideo(asset:MediaAsset,durationMs:number,viewport:{width:number;height:number}){
  requireUsableMedia(asset)
  if(asset.kind!=='video')throw new Error('Context footage requires a video asset')
  if(asset.scope.kind==='private')throw new Error('Private context footage is not enabled in this renderer yet')
  const video=document.createElement('video')
  video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto'
  try{
    await new Promise<void>((resolve,reject)=>{
      const finish=(error?:Error)=>{clearTimeout(timer);video.onloadeddata=null;video.onerror=null;error?reject(error):resolve()}
      const timer=setTimeout(()=>finish(new Error('Context footage took too long to load')),30000)
      video.onloadeddata=()=>finish();video.onerror=()=>finish(new Error('Could not load context footage'));video.src=asset.url;video.load()
    })
    if(!Number.isFinite(video.duration) || video.duration*1000+34<durationMs)throw new Error('Choose footage long enough for this scene')
    if(video.videoWidth!==asset.width || video.videoHeight!==asset.height || !mediaCropFit(asset,viewport).native)throw new Error('The source footage does not meet this shot’s native-resolution requirements')
    video.width=asset.width;video.height=asset.height
    return video
  }catch(error){releaseContextVideo(video);throw error}
}

export async function seekContextVideo(video:HTMLVideoElement,timeMs:number,signal?:AbortSignal){
  signal?.throwIfAborted()
  const target=Math.min(Math.max(0,timeMs/1000),video.duration-.001)
  if(Math.abs(video.currentTime-target)<.001 && video.readyState>=2)return
  await new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',failed);signal?.removeEventListener('abort',abort);error?reject(error):resolve()}
    const timer=setTimeout(()=>finish(new Error('Context footage seek timed out')),10000)
    const done=()=>finish(),failed=()=>finish(new Error('Could not decode context footage')),abort=()=>finish(new DOMException('Cancelled','AbortError'))
    video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',abort,{once:true});video.currentTime=target
  })
}

export function releaseContextVideo(video:HTMLVideoElement){video.pause();video.removeAttribute('src');video.load()}
