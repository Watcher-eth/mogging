import { originalVideoContext } from './video-theme'
import { z } from 'zod'
import { diffSegments } from 'torph'
import { visualFeatures } from './video-semantics'
import { creatorStudies } from './creator-studies'
import { applyGlassInk } from './glass-overlay'
import { editorialEase, drawEditorialTool } from './editorial-motion'
import { sampleEditorialCursor, drawEditorialCursor, editorialCursorTiming } from './editorial-cursor'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

export const editorialKinds = ['callout','network','card-morph','reference-inset','comparison','orbit','color-reveal','line-art','drafting','claim','research','device','domain','view-cone','feature-tray','cursor-tour','focus-grid','tile-expand','evidence-fan','swatch-strip','document-lift','reference-hinge','tool-sweep'] as const
export const editorialPresentationSchema = z.object({
  kind:z.enum(editorialKinds), variant:z.number().int().min(0).max(5).default(0),
  label:z.string().max(100).optional(), feature:z.enum(visualFeatures).optional(), imageIds:z.array(z.string().min(1).max(160)).max(96).default([]), referenceIndex:z.number().int().min(0).max(95).default(0), referenceMode:z.enum(['feature','asset']).optional(),
  claim:z.object({author:z.string().min(1).max(60),text:z.string().min(1).max(120),previousText:z.string().max(120).optional(),sourceUrl:z.url().refine(url=>/^https?:/.test(url)),reviewed:z.literal(true),avatarIndex:z.number().int().min(0).max(95).optional(),thought:z.boolean().default(false)}).strict().optional(),
  beats:z.array(z.object({feature:z.enum(visualFeatures),anchor:z.string().min(1).max(160),label:z.string().max(32).optional()}).strict()).max(5).optional(),
  accents:z.array(z.enum(['trace','brackets','tracks','links','scan'])).max(3).optional(),
  interaction:z.enum(['click','double-click','drag']).optional(),
  selectedIndex:z.number().int().min(0).max(3).optional(),
  assetCaption:z.string().max(100).optional(),
  mediaId:z.string().min(1).max(160).optional(), mediaOffsetMs:z.number().min(0).max(180000).optional(), holdMediaAtMs:z.number().min(0).max(180000).optional(),
  layers:z.array(z.enum(['tracks','links','labels'])).max(3).optional(),
  referenceCards:z.array(z.object({title:z.string().min(1).max(140),author:z.string().max(80),url:z.url().refine(url=>/^https?:/.test(url)),reviewed:z.literal(true),atMs:z.number().min(0).optional()}).strict()).max(5).optional(),
  studies:z.array(z.enum(['ward-2018','mogilski-welling-2018'])).max(2).optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.mediaId && (value.kind!=='reference-hinge' || value.referenceIndex!==0))ctx.addIssue({code:'custom',message:'Context footage belongs to the primary hinged reference surface.'})
  if(value.kind==='claim'&&!value.claim)ctx.addIssue({code:'custom',message:'A claim carrier requires a reviewed attribution and source.'})
  if(value.kind==='research'&&!value.studies?.length&&!value.referenceCards?.length)ctx.addIssue({code:'custom',message:'A research stack requires curated study IDs.'})
})
export const editorialAccentProfiles=[['trace','brackets'],['tracks','links'],['trace','scan'],['brackets','links'],['trace','links'],['tracks','trace','links']] as const
export type EditorialPresentation = z.infer<typeof editorialPresentationSchema>
export type EditorialPhoto = {image:CanvasImageSource & {width:number;height:number};landmarks?:FaceLandmarksPayload|null;label?:string}
type Point={x:number;y:number}
export type EditorialFrame={x:number;y:number;width:number;height:number}
export type EditorialEvent={feature:typeof visualFeatures[number];atMs:number;label?:string}

/** Exact phrase matching binds authored visual events to the recorded caption clock. */
export function editorialWordEvents(beats:EditorialPresentation['beats'],words:Array<{text:string;startMs:number}>):EditorialEvent[]{
  const normalize=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
  const tokens=words.map(word=>normalize(word.text))
  return (beats??[]).flatMap(beat=>{
    const phrase=beat.anchor.split(/\s+/).map(normalize).filter(Boolean)
    const index=tokens.findIndex((_,i)=>phrase.length>0 && phrase.every((token,n)=>tokens[i+n]===token))
    return index<0?[]:[{feature:beat.feature,label:beat.label,atMs:words[index].startMs}]
  }).sort((a,b)=>a.atMs-b.atMs)
}
type EditorialCueScene={startMs:number;durationMs:number;source:{imageId?:string|null};scriptRange?:{cueId:string};presentation?:EditorialPresentation}

/** Adjacent caption fragments share one motion clock; a later reuse starts fresh. */
export function editorialSceneClock(scenes:EditorialCueScene[],scene:EditorialCueScene,localMs:number){
  const index=scenes.indexOf(scene),key=JSON.stringify(scene.presentation)
  const matches=(candidate:EditorialCueScene)=>Boolean(scene.scriptRange && candidate.scriptRange?.cueId===scene.scriptRange.cueId && candidate.source.imageId===scene.source.imageId && JSON.stringify(candidate.presentation)===key)
  let first=index,last=index
  while(first>0 && matches(scenes[first-1]))first--
  while(last+1<scenes.length && matches(scenes[last+1]))last++
  return {time:scene.startMs+localMs-scenes[first].startMs,duration:scenes[last].startMs+scenes[last].durationMs-scenes[first].startMs}
}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t
const labels:Record<typeof visualFeatures[number],string>={whole:'Face structure',eyes:'Eye area',brows:'Brow shape',nose:'Nose profile',lips:'Lip shape',jaw:'Jawline',cheeks:'Cheekbones',philtrum:'Philtrum',freckles:'Skin texture','facial-hair':'Facial hair',ears:'Ear shape',symmetry:'Facial alignment',dimorphism:'Facial shape'}

/** Source-image paths are authoritative. An unavailable contour stays unavailable. */
export function editorialFeatureGeometry(photo:EditorialPhoto,feature:typeof visualFeatures[number]){
  const l=photo.landmarks
  if(!l||l.confidence<.75)return
  const a=l.anchors,c=l.contours
  const keys=feature==='eyes'?['leftEye','rightEye']:feature==='brows'?['leftBrow','rightBrow']:feature==='nose'?['noseBridge','noseBase']:feature==='lips'?['mouth']:feature==='jaw'||feature==='facial-hair'?['jawline']:feature==='cheeks'?['leftCheekbone','rightCheekbone']:['freckles','philtrum','ears'].includes(feature)?[]:['faceOutline']
  const paths=keys.map(key=>c?.[key as keyof typeof c]).filter((p):p is Array<Point>=>Boolean(p?.length))
  const fallback=feature==='eyes'?[a.leftPupil,a.rightPupil]:feature==='brows'?[a.leftBrow,a.rightBrow]:feature==='nose'?[a.noseTip]:feature==='lips'?[a.upperLip,a.lowerLip]:feature==='philtrum'?[c?.noseBase?.[3],a.upperLip]:feature==='freckles'?[a.leftCheek,a.rightCheek]:feature==='jaw'||feature==='facial-hair'?[a.jawLeft,a.chin,a.jawRight]:['cheeks','ears'].includes(feature)?[]:[a.forehead,a.chin]
  const points=(paths.flat().length?paths.flat():fallback.filter((p):p is Point=>Boolean(p))).map(p=>({x:p.x*photo.image.width,y:p.y*photo.image.height}))
  if(!points.length)return
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
  const eyeSpan=a.leftPupil&&a.rightPupil?Math.hypot((a.rightPupil.x-a.leftPupil.x)*photo.image.width,(a.rightPupil.y-a.leftPupil.y)*photo.image.height):photo.image.width*.18
  const pad=eyeSpan*.12,x=Math.min(...xs)-pad,y=Math.min(...ys)-pad
  return {points,paths:paths.map(p=>p.map(q=>({x:q.x*photo.image.width,y:q.y*photo.image.height}))),frame:{x,y,width:Math.max(eyeSpan*.2,Math.max(...xs)-x+pad),height:Math.max(eyeSpan*.14,Math.max(...ys)-y+pad)},eyeSpan}
}
function photo(ctx:CanvasRenderingContext2D,item:EditorialPhoto,frame:EditorialFrame,detail?:EditorialFrame,radius=20){
  const source=detail??{x:0,y:0,width:item.image.width,height:item.image.height},s=Math.max(frame.width/source.width,frame.height/source.height),w=source.width*s,h=source.height*s
  ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,radius);ctx.clip()
  ctx.drawImage(item.image,source.x,source.y,source.width,source.height,frame.x+(frame.width-w)/2,frame.y+(frame.height-h)/2,w,h);ctx.restore()
}
function framedOverlays(ctx:CanvasRenderingContext2D,item:EditorialPhoto,frame:EditorialFrame,detail:EditorialFrame|undefined,feature:typeof visualFeatures[number],time:number,variant:number,reduced:boolean,accents:EditorialPresentation['accents'],radius=20){
  if(!accents?.length || time<0)return
  const source=detail??{x:0,y:0,width:item.image.width,height:item.image.height},scale=Math.max(frame.width/source.width,frame.height/source.height)
  ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,radius);ctx.clip()
  ctx.translate(frame.x+(frame.width-source.width*scale)/2-source.x*scale,frame.y+(frame.height-source.height*scale)/2-source.y*scale);ctx.scale(scale,scale)
  drawEditorialOverlaySet(ctx,item,feature,time,variant,reduced,accents);ctx.restore()
}

function editorialInsetRegion(region:EditorialFrame,item:EditorialPhoto,aspect:number):EditorialFrame{
  const width=Math.max(region.width*1.12,region.height*1.12*aspect),height=width/aspect
  return {x:Math.max(0,Math.min(item.image.width-width,region.x+(region.width-width)/2)),y:Math.max(0,Math.min(item.image.height-height,region.y+(region.height-height)/2)),width,height}
}

function paperSurface(ctx:CanvasRenderingContext2D,frame:EditorialFrame,radius=24){
  ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.075)';ctx.shadowBlur=22;ctx.shadowOffsetY=5
  ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,radius);ctx.fill();ctx.restore()
}

function drawEditorialFeatureTour(ctx:CanvasRenderingContext2D,item:EditorialPhoto,size:{width:number;height:number},time:number,duration:number,variant:number,reduced:boolean,tray:boolean,events?:EditorialEvent[],accents?:EditorialPresentation['accents'],interaction?:EditorialPresentation['interaction']){
  const {width:W,height:H}=size,scale=Math.max(W/item.image.width,H/item.image.height),ox=(W-item.image.width*scale)/2
  const planned=events??(['brows','lips','jaw'] as const).map((feature,i)=>({feature,atMs:900+i*Math.max(1000,(duration-900)/3),label:labels[feature]}))
  const targets=planned.flatMap(event=>{const geometry=editorialFeatureGeometry(item,event.feature);return geometry?[{...event,geometry}]:[]})
  if(!targets.length)return
  const active=Math.max(0,targets.findLastIndex(event=>time>=editorialCursorTiming(event.atMs,variant,interaction,reduced).startMs)),target=targets[active]
  const frameFor=(index:number):EditorialFrame=>{
    const count=targets.length,row=count>3?Math.floor(index/3):0,columns=row?count-3:Math.min(3,count),column=index%3,w=W*.22,h=H*.066,gap=W*.018
    return {x:(W-(columns*w+(columns-1)*gap))/2+column*(w+gap),y:H*(count>3?.70:.76)+row*(h+30),width:w,height:h}
  }
  if(tray)for(const [i,event] of targets.entries()){
    const arrived=reduced?1:editorialEase((time-i*65)/420),exit=reduced?0:editorialEase((time-duration+400+i*45)/300),frame=frameFor(i),g=event.geometry.frame
    ctx.save();ctx.globalAlpha*=arrived*(1-exit)
    const origin={x:ox+(g.x+g.width/2)*scale,y:(g.y+g.height/2)*scale}
    const moving={...frame,x:mix(origin.x-frame.width/2,frame.x,arrived),y:mix(origin.y-frame.height/2,frame.y,arrived)+exit*12}
    paperSurface(ctx,{x:moving.x-4,y:moving.y-4,width:moving.width+8,height:moving.height+27},18)
    photo(ctx,item,moving,editorialInsetRegion(g,item,moving.width/moving.height),14)
    ctx.fillStyle='#777';ctx.font='400 15px Arial';ctx.textAlign='center';ctx.fillText(event.label??labels[event.feature],moving.x+moving.width/2,moving.y+moving.height+18,moving.width-14)
    if(i===active && time>=editorialCursorTiming(event.atMs,variant,interaction,reduced).clickAtMs){ctx.strokeStyle='rgba(105,105,105,.5)';ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(moving.x-4,moving.y-4,moving.width+8,moving.height+27,18);ctx.stroke()}
    ctx.restore()
  }
  const g=target.geometry.frame,to={x:ox+(g.x+g.width/2)*scale,y:(g.y+g.height/2)*scale},thumb=frameFor(active)
  const destination=tray?{x:thumb.x+thumb.width/2,y:thumb.y+thumb.height/2}:to
  const from={x:destination.x+W*(variant%2?-.14:.14),y:destination.y+H*.055}
  const cursor=sampleEditorialCursor(time,from,destination,target.atMs,variant,interaction,reduced,tray?to:undefined)
  for(const event of targets){
    const elapsed=time-editorialCursorTiming(event.atMs,variant,interaction,reduced).clickAtMs
    if(elapsed<0 || elapsed>2300)continue
    ctx.save();ctx.globalAlpha*=reduced?1:1-editorialEase((elapsed-2000)/300);ctx.translate(ox,0);ctx.scale(scale,scale)
    drawEditorialOverlaySet(ctx,item,event.feature,elapsed,variant,reduced,accents)
    ctx.restore()
  }
  drawEditorialCursor(ctx,cursor)

}

export function editorialTileFrames(count:number,size:{width:number;height:number},variant=0):EditorialFrame[]{
  const {width:W,height:H}=size,gap=W*.045,left=W*.055,top=H*.205,width=W*.89,height=H*.61,v=variant%6
  if(v===1 || v===4){
    const hero={x:left,y:top,width:width*.59,height},w=width-hero.width-gap,h=(height-gap*(count-2))/(count-1)
    const frames=[hero,...Array.from({length:count-1},(_,i)=>({x:left+hero.width+gap,y:top+i*(h+gap),width:w,height:h}))]
    return v===4?frames.map(f=>({...f,x:W-f.x-f.width})):frames
  }
  if(v===2 || v===5){
    const h=height*.59,w=(width-gap*(count-2))/(count-1)
    const frames=[{x:left,y:top,width,height:h},...Array.from({length:count-1},(_,i)=>({x:left+i*(w+gap),y:top+h+gap,width:w,height:height-h-gap}))]
    return v===5?frames.map(f=>({...f,y:top+height-(f.y-top)-f.height})):frames
  }
  const w=(width-gap)/2,h=(height-gap)/2
  if(count===3)return [{x:(W-w)/2,y:top,width:w,height:h},{x:left,y:top+h+gap,width:w,height:h},{x:left+w+gap,y:top+h+gap,width:w,height:h}].map(f=>v===3?{...f,y:top+height-(f.y-top)-f.height}:f)
  return Array.from({length:count},(_,i)=>({x:left+(i%2)*(w+gap),y:top+Math.floor(i/2)*(h+gap),width:w,height:h}))
}

function drawEditorialPhotoGrid(ctx:CanvasRenderingContext2D,primary:EditorialPhoto,references:EditorialPhoto[],feature:typeof visualFeatures[number],size:{width:number;height:number},time:number,duration:number,variant:number,reduced:boolean,kind:'focus-grid'|'tile-expand'|'evidence-fan',selected=0,revealAt=1800,accents?:EditorialPresentation['accents'],interaction?:EditorialPresentation['interaction']){
  const {width:W,height:H}=size,geometry=editorialFeatureGeometry(primary,feature)
  const items=[{item:primary,label:primary.label??'Front'},...references.slice(0,2).map((item,i)=>({item,label:item.label??`View ${i+2}`}))]
  if(kind!=='evidence-fan' && geometry)items.push({item:primary,label:labels[feature],detail:geometry.frame} as typeof items[number]&{detail:EditorialFrame})
  if(items.length<2){photo(ctx,primary,{x:0,y:0,width:W,height:H},undefined,0);return}
  const chosen=Math.min(selected,items.length-1),frames=editorialTileFrames(items.length,size,variant),chosenFrame=frames[chosen],cursor=sampleEditorialCursor(time,{x:W*.86,y:H*.84},{x:chosenFrame.x+chosenFrame.width*.52,y:chosenFrame.y+chosenFrame.height*.52},revealAt,variant,interaction,reduced),expand=kind==='tile-expand'?(reduced?1:editorialEase(cursor.effectMs/(580+variant*45))):0
  for(const [i,entry] of items.entries()){
    if(expand && i===chosen)continue
    const t=reduced?1:editorialEase((time-i*55)/430),frame=frames[i]
    ctx.save();ctx.globalAlpha*=t*(1-expand);ctx.translate((variant%2?-1:1)*(1-t)*W*.055,14*(1-t));if(kind==='evidence-fan'){ctx.translate(frame.x+frame.width/2,frame.y+frame.height/2);ctx.rotate((1-t)*(i-(items.length-1)/2)*(.1+variant*.025));ctx.translate(-frame.x-frame.width/2,-frame.y-frame.height/2)}
    paperSurface(ctx,{x:frame.x-4,y:frame.y-4,width:frame.width+8,height:frame.height+35},24)
    photo(ctx,entry.item,frame,'detail' in entry?editorialInsetRegion(entry.detail as EditorialFrame,entry.item,frame.width/frame.height):undefined,20)
    ctx.fillStyle='#777';ctx.textAlign='center';ctx.font='400 17px Arial';ctx.fillText(entry.label,frame.x+frame.width/2,frame.y+frame.height+25)
    ctx.restore()
  }
  if(kind==='tile-expand' && expand){
    const from=frames[chosen],entry=items[chosen],frame={x:mix(from.x,0,expand),y:mix(from.y,0,expand),width:mix(from.width,W,expand),height:mix(from.height,H,expand)}
    photo(ctx,entry.item,frame,'detail' in entry?editorialInsetRegion(entry.detail as EditorialFrame,entry.item,frame.width/frame.height):undefined,20*(1-expand))
    framedOverlays(ctx,entry.item,frame,'detail' in entry?editorialInsetRegion(entry.detail as EditorialFrame,entry.item,frame.width/frame.height):undefined,feature,cursor.effectMs,variant,reduced,accents,20*(1-expand))
  }else if(kind==='focus-grid'){
    const frame=frames[chosen],t=reduced?1:editorialEase(cursor.effectMs/440),cx=frame.x+frame.width-24,cy=frame.y+24
    ctx.save();ctx.globalAlpha*=t;ctx.fillStyle='rgba(255,255,255,.92)';ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fill()
    ctx.strokeStyle='#929292';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(cx,cy,7,-Math.PI/2,-Math.PI/2+Math.PI*2*t);ctx.stroke();ctx.restore()
  }
  if(cursor.clicked && accents?.length && kind!=='tile-expand'){
    const frame=frames[chosen],entry=items[chosen],detail='detail' in entry?editorialInsetRegion(entry.detail as EditorialFrame,entry.item,frame.width/frame.height):undefined
    framedOverlays(ctx,entry.item,frame,detail,feature,cursor.effectMs,variant,reduced,accents)
  }
  if(kind!=='evidence-fan')drawEditorialCursor(ctx,cursor)
}

const swatchCache=new WeakMap<object,Map<string,string[]>>()
export function editorialPhotoSwatches(item:EditorialPhoto,feature:typeof visualFeatures[number]){
  let cache=swatchCache.get(item.image);if(!cache){cache=new Map();swatchCache.set(item.image,cache)}
  const cached=cache.get(feature);if(cached)return cached
  const g=editorialFeatureGeometry(item,feature);if(!g)return []
  const canvas=document.createElement('canvas');canvas.width=item.image.width;canvas.height=item.image.height
  const ctx=canvas.getContext('2d')!;ctx.drawImage(item.image,0,0)
  const colors=Array.from({length:9},(_,i)=>{
    const x=Math.max(0,Math.min(canvas.width-1,Math.round(g.frame.x+g.frame.width*((i%3)+1)/4))),y=Math.max(0,Math.min(canvas.height-1,Math.round(g.frame.y+g.frame.height*(Math.floor(i/3)+1)/4)))
    const p=ctx.getImageData(x,y,1,1).data;return `rgb(${p[0]},${p[1]},${p[2]})`
  })
  cache.set(feature,colors);return colors
}

function drawEditorialSwatches(ctx:CanvasRenderingContext2D,item:EditorialPhoto,feature:typeof visualFeatures[number],size:{width:number;height:number},time:number,variant:number,reduced:boolean){
  const colors=editorialPhotoSwatches(item,feature);if(!colors.length)return
  const {width:W,height:H}=size,v=variant%6,matrix=v===1||v===4,vertical=v===2||v===5,r=matrix?22:vertical?17:20,gap=matrix?54:47,w=matrix?184:vertical?95:colors.length*gap+30,h=matrix?205:vertical?colors.length*gap+42:88,x=v>=3?W-w-W*.07:W*.07,y=vertical?H*.46:H*.75
  paperSurface(ctx,{x,y,width:w,height:h},24);ctx.save();ctx.font='400 15px Arial';ctx.fillStyle='#858585';ctx.textAlign='left';if(!vertical)ctx.fillText('Photo samples',x+18,y+23)
  for(const [i,color] of colors.entries()){
    const t=reduced?1:editorialEase((time-i*(v===4?65:35))/260),px=x+(vertical?w/2:30+(matrix?i%3:i)*gap),py=y+(vertical?30+i*gap:53+(matrix?Math.floor(i/3)*gap:0))
    ctx.save();ctx.globalAlpha*=t;ctx.fillStyle=color;ctx.beginPath();if(v>=3)ctx.roundRect(px-r,py-r,r*2,r*2,7);else ctx.arc(px,py,r*(.8+.2*t),0,Math.PI*2);ctx.fill();ctx.restore()
  }ctx.restore()

}

const planeSurfaces=new WeakMap<object,Map<number,HTMLCanvasElement>>()
function planeSurface(item:EditorialPhoto,aspect:number){
  let surfaces=planeSurfaces.get(item.image);if(!surfaces){surfaces=new Map();planeSurfaces.set(item.image,surfaces)}
  let surface=surfaces.get(aspect);if(surface && !('videoWidth' in item.image))return surface
  surface??=document.createElement('canvas');surface.width=Math.min(1200,item.image.width);surface.height=Math.round(surface.width/aspect)
  const ctx=surface.getContext('2d')!;ctx.clearRect(0,0,surface.width,surface.height);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,surface.width,surface.height,32);ctx.fill()
  photo(ctx,item,{x:7,y:7,width:surface.width-14,height:surface.height-14},undefined,26);surfaces.set(aspect,surface);return surface
}

function drawEditorialReferencePlane(ctx:CanvasRenderingContext2D,item:EditorialPhoto,size:{width:number;height:number},time:number,reduced:boolean,kind:'document-lift'|'reference-hinge',caption?:string,held=false,variant=0){
  const {width:W,height:H}=size,t=reduced?1:editorialEase(time/680),document=kind==='document-lift',h=document?Math.min(H*.38,W*.38*item.image.height/item.image.width):H*.28,w=document?h*item.image.width/item.image.height:W*.76,x=document?(variant%2?W*.06:W-w-W*.06):(W-w)/2,y=H*(document?(variant%3===0?.46:.58):(variant%3===0?.56:.64))
  ctx.save();ctx.globalAlpha*=Math.min(1,t*3)
  ctx.translate(x+w/2+(variant%3===0?W*.24*(variant%2?-1:1):0)*(1-t),y+h/2+(variant%3===1?H*.2:variant%3===2?-H*.14:0)*(1-t));ctx.rotate((document?.09:.035)*(variant%2?-1:1)*(1-t));ctx.translate(-w/2,-h/2)
  if(document || t>.9){ctx.save();ctx.globalAlpha*=document?1:editorialEase((t-.9)/.1);paperSurface(ctx,{x:0,y:0,width:w,height:h},24);ctx.restore()}
  if(document){photo(ctx,item,{x:0,y:0,width:w,height:h},undefined,18);ctx.fillStyle='#ededed';ctx.beginPath();ctx.moveTo(w-22,h);ctx.lineTo(w,h-22);ctx.lineTo(w-22,h-22);ctx.closePath();ctx.fill()}
  else drawEditorialPerspective(ctx,planeSurface(item,w/h),{x:0,y:0,width:w,height:h},(1-t)*1.45*(variant%2?-1:1),variant%3===1)
  if(held && !document){ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(18,h-37,5,18);ctx.fillRect(28,h-37,5,18)}
  if(caption){ctx.fillStyle='#777';ctx.font='400 17px Arial';ctx.textAlign='center';ctx.fillText(caption,w/2,h+29,w)}
  ctx.restore()
}
function path(ctx:CanvasRenderingContext2D,points:Point[],progress=1){
  if(!points.length)return
  ctx.beginPath();points.slice(0,Math.max(1,Math.ceil(points.length*Math.min(1,progress)))).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()
}
function wrap(ctx:CanvasRenderingContext2D,value:string,width:number){
  const lines:string[]=[];let line=''
  for(const word of value.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word}else line=next}
  if(line)lines.push(line)
  return lines
}

/** Torph supplies stable glyph identities; seeking supplies the clock. */
export function drawEditorialText(ctx:CanvasRenderingContext2D,previous:string,value:string,x:number,y:number,progress:number,width=780,lineHeight=38){
  const old=diffSegments([],previous,'en').segments,next=diffSegments(old,value,'en').segments,t=editorialEase(progress)
  const layout=(segments:typeof old)=>{let px=0,py=0;const result=new Map<string,{text:string;x:number;y:number}>();for(const s of segments){if(px && s.string.trim() && px+ctx.measureText(s.string).width>width){px=0;py+=lineHeight}for(const [i,char] of [...s.string].entries()){const w=ctx.measureText(char).width;if(px+w>width){px=0;py+=lineHeight}result.set(s.id+':'+i,{text:char,x:px,y:py});px+=w}}return result}
  const a=layout(old),b=layout(next)
  for(const [id,to] of b){const from=a.get(id);ctx.save();ctx.globalAlpha*=from?1:t;ctx.fillText(to.text,x+mix(from?.x??to.x,to.x,t),y+mix(from?.y??to.y+8,to.y,t));ctx.restore()}
  for(const [id,from] of a)if(!b.has(id)){ctx.save();ctx.globalAlpha*=1-t;ctx.fillText(from.text,x+from.x,y+from.y-8*t);ctx.restore()}
}
export function drawEditorialAcquisition(ctx:CanvasRenderingContext2D,item:EditorialPhoto,feature:typeof visualFeatures[number],time:number,variant=0,reduced=false){
  if(time<0)return
  const g=editorialFeatureGeometry(item,feature);if(!g)return
  const m=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(m.a,m.b)),t=reduced?1:editorialEase(time/480),points=g.paths[variant%Math.max(1,g.paths.length)]??g.points
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),pad=g.eyeSpan*.06
  const f={x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,width:Math.max(...xs)-Math.min(...xs)+pad*2,height:Math.max(...ys)-Math.min(...ys)+pad*2}
  ctx.save();applyGlassInk(ctx,unit,1.6);ctx.globalAlpha*=reduced?1:editorialEase(time/180)*(1-editorialEase((time-2000)/300))
  path(ctx,points,t)
  const p=points[Math.min(points.length-1,Math.floor(t*(points.length-1)))];if(p){ctx.beginPath();ctx.arc(p.x,p.y,3*unit,0,Math.PI*2);ctx.fill()}
  if(variant%3===0){
    const r=Math.max(14*unit,Math.min(f.width,f.height)*.35),x=f.x+f.width/2,y=f.y+f.height/2
    for(let side=0;side<2;side++){ctx.beginPath();ctx.arc(x,y,r+(1-t)*8*unit,side*Math.PI,side*Math.PI+t*Math.PI*.8);ctx.stroke()}
  }else{
    drawEditorialEmphasis(ctx,{x:f.x,y:f.y,w:f.width,h:f.height},variant%3===1?'region':'brackets',time,reduced)
    if(variant%3===1&&!reduced&&time<800){ctx.save();ctx.beginPath();ctx.roundRect(f.x,f.y,f.width,f.height,8*unit);ctx.clip();ctx.strokeStyle='rgba(250,253,255,.28)';ctx.beginPath();const y=f.y+f.height*editorialEase(time/800);ctx.moveTo(f.x,y);ctx.lineTo(f.x+f.width,y);ctx.stroke();ctx.restore()}
  }
  ctx.restore()
}
/** Companion layers acquire in sequence; negative clocks draw nothing, including at a click pre-roll. */
export function drawEditorialOverlaySet(ctx:CanvasRenderingContext2D,item:EditorialPhoto,feature:typeof visualFeatures[number],time:number,variant=0,reduced=false,accents:ReadonlyArray<'trace'|'brackets'|'tracks'|'links'|'scan'>=editorialAccentProfiles[variant%6]){
  if(time<0 || !accents.length)return
  const geometry=editorialFeatureGeometry(item,feature);if(!geometry)return
  const m=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(m.a,m.b))
  for(const [i,accent] of accents.entries()){
    const local=time-(reduced?0:i*110);if(local<0)continue
    if(accent==='tracks'||accent==='links'){drawEditorialNetwork(ctx,item,feature,local,variant,reduced,[accent]);continue}
    ctx.save();applyGlassInk(ctx,unit,1.3);ctx.globalAlpha*=reduced?1:editorialEase(local/220)
    const g=geometry.frame,t=reduced?1:editorialEase(local/540)
    if(accent==='trace'){ctx.setLineDash([2*unit,4*unit]);for(const contour of geometry.paths)path(ctx,contour,t)}
    if(accent==='brackets')drawEditorialEmphasis(ctx,{x:g.x,y:g.y,w:g.width,h:g.height},'brackets',local,reduced)
    if(accent==='scan' && t<1){ctx.beginPath();ctx.rect(g.x,g.y,g.width,g.height);ctx.clip();const y=g.y+g.height*t;path(ctx,[{x:g.x,y},{x:g.x+g.width,y}])}
    ctx.restore()
  }
}
/** Four unequal markers move along the current detected feature, not free-floating face guesses. */
export function drawEditorialNetwork(ctx:CanvasRenderingContext2D,item:EditorialPhoto,feature:typeof visualFeatures[number],time:number,variant=0,reduced=false,layers:NonNullable<EditorialPresentation['layers']>=['tracks','links','labels']){
  const g=editorialFeatureGeometry(item,feature);if(!g||g.points.length<4)return
  const m=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(m.a,m.b)),clock=reduced?0:time/2600
  const points=Array.from({length:4},(_,i)=>{const phase=(i/4+.035*Math.sin(clock+i*1.7+variant)+1)%1,pos=phase*(g.points.length-1),a=g.points[Math.floor(pos)],b=g.points[Math.min(g.points.length-1,Math.floor(pos)+1)];return {x:mix(a.x,b.x,pos%1),y:mix(a.y,b.y,pos%1)}})
  ctx.save();applyGlassInk(ctx,unit,1.2);ctx.globalAlpha*=reduced?1:editorialEase(time/240)
  for(let i=0;i<4;i++){
    const p=points[i],next=points[(i+1)%4],acquire=reduced?1:editorialEase((time-i*65)/320)
    ctx.save();ctx.globalAlpha*=.35+i*.14;ctx.lineWidth=(.8+i*.25)*unit;if(layers.includes('links'))path(ctx,[p,{x:mix(p.x,next.x,acquire),y:mix(p.y,next.y,acquire)}])
    if(layers.includes('tracks'))drawEditorialEmphasis(ctx,{x:p.x-(10+i*2)*unit,y:p.y-(8+i)*unit,w:(20+i*4)*unit,h:(16+i*2)*unit},'brackets',Math.min(1500,time-i*65),reduced)
    ctx.font=`${9*unit}px monospace`;ctx.fillStyle='rgba(248,253,255,.78)';if(layers.includes('labels'))ctx.fillText(`${String(i+1).padStart(2,'0')} · ${(p.x/item.image.width).toFixed(2)} ${(p.y/item.image.height).toFixed(2)}`,p.x+15*unit,p.y-10*unit);ctx.restore()
  }
  ctx.restore()
}
const drawings=new WeakMap<object,HTMLCanvasElement>()
/** Cached, non-max-suppressed photo edges retain the actual face and hair registration. */
export function editorialLineArt(item:EditorialPhoto){
  const cached=drawings.get(item.image);if(cached)return cached
  const canvas=document.createElement('canvas'),scale=Math.min(1,640/item.image.width);canvas.width=Math.round(item.image.width*scale);canvas.height=Math.round(item.image.height*scale)
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(item.image,0,0,canvas.width,canvas.height)
  const source=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,grey=new Float32Array(w*h),gx=new Float32Array(w*h),gy=new Float32Array(w*h),mag=new Float32Array(w*h)
  for(let i=0;i<grey.length;i++)grey[i]=source.data[i*4+3]<128?255:.2126*source.data[i*4]+.7152*source.data[i*4+1]+.0722*source.data[i*4+2]
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;gx[i]=-grey[i-w-1]+grey[i-w+1]-2*grey[i-1]+2*grey[i+1]-grey[i+w-1]+grey[i+w+1];gy[i]=-grey[i-w-1]-2*grey[i-w]-grey[i-w+1]+grey[i+w-1]+2*grey[i+w]+grey[i+w+1];mag[i]=Math.hypot(gx[i],gy[i])}
  const output=ctx.createImageData(w,h)
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,m=mag[i],d=Math.abs(gx[i])>Math.abs(gy[i])?1:w,alpha=m>44&&m>=mag[i-d]&&m>=mag[i+d]?Math.min(175,(m-35)*1.1):0;output.data[i*4]=91;output.data[i*4+1]=91;output.data[i*4+2]=91;output.data[i*4+3]=alpha}
  ctx.putImageData(output,0,0);drawings.set(item.image,canvas);return canvas
}
/** Deterministic brush edge: scrubbing never changes the paint pattern. */
function editorialBrushEdge(width:number,height:number,progress:number){
  return Array.from({length:49},(_,i)=>{const x=width*i/48;return {x,y:height*progress+(Math.sin(i*.8)+Math.sin(i*2.1)*.35)*height*.018*Math.sin(Math.PI*progress)}})
}
function drawEditorialEmphasis(ctx:CanvasRenderingContext2D,frame:{x:number;y:number;w:number;h:number},kind:'region'|'brackets',time:number,reduced:boolean){
  const t=reduced?1:editorialEase(time/350);if(t<=0)return
  ctx.save();ctx.globalAlpha*=t
  if(kind==='region'){ctx.fillStyle='rgba(245,252,255,.09)';ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.w,frame.h,6);ctx.fill();ctx.stroke()}
  else{const length=Math.min(frame.w,frame.h)*.25;for(const [x,y,dx,dy] of [[frame.x,frame.y,1,1],[frame.x+frame.w,frame.y,-1,1],[frame.x,frame.y+frame.h,1,-1],[frame.x+frame.w,frame.y+frame.h,-1,-1]]){ctx.beginPath();ctx.moveTo(x+dx*length*t,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*length*t);ctx.stroke()}}
  ctx.restore()
}
function drawEditorialColorReveal(ctx:CanvasRenderingContext2D,image:EditorialPhoto['image'],width:number,height:number,progress:number,variant:number){
  ctx.save();ctx.filter='grayscale(1)';ctx.drawImage(image,0,0,width,height);ctx.restore()
  drawEditorialBrushLayer(ctx,width,height,progress,()=>ctx.drawImage(image,0,0,width,height),variant)
}
export function drawEditorialBrushLayer(ctx:CanvasRenderingContext2D,width:number,height:number,progress:number,draw:()=>void,variant=0){
  if(progress<=0)return;if(progress>=1){draw();return}
  const direction=variant%4,transform=ctx.getTransform();ctx.save()
  if(direction===1){ctx.translate(width,0);ctx.rotate(Math.PI/2);[width,height]=[height,width]}
  else if(direction===2){ctx.translate(width,height);ctx.rotate(Math.PI)}
  else if(direction===3){ctx.translate(0,height);ctx.rotate(-Math.PI/2);[width,height]=[height,width]}
  const edge=editorialBrushEdge(width,height,progress).reverse();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(width,0);ctx.lineTo(edge[0].x,edge[0].y)
  for(let i=1;i<edge.length;i++)ctx.quadraticCurveTo(edge[i-1].x,edge[i-1].y,(edge[i-1].x+edge[i].x)/2,(edge[i-1].y+edge[i].y)/2)
  ctx.lineTo(0,edge.at(-1)!.y);ctx.closePath();ctx.clip();ctx.setTransform(transform);draw();ctx.restore()
}
export function drawEditorialDrafting(ctx:CanvasRenderingContext2D,frame:EditorialFrame,time:number,variant=0,reduced=false){
  const t=reduced?1:editorialEase(time/660),angle=(-.2+(1-t)*.45)*(variant%2?-1:1)
  ctx.save();ctx.translate(frame.x+frame.width/2,frame.y+frame.height/2);ctx.rotate(angle);ctx.globalAlpha*=t;ctx.fillStyle='rgba(246,246,246,.78)';ctx.strokeStyle='rgba(104,104,104,.55)';ctx.lineWidth=1.3
  const w=frame.width*.85,h=46;ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,5);ctx.fill();ctx.stroke()
  for(let i=0;i<=50;i++){const x=-w/2+w*i/50;ctx.beginPath();ctx.moveTo(x,-h/2);ctx.lineTo(x,-h/2+(i%5===0?18:8));ctx.stroke();if(i%10===0){ctx.font='13px monospace';ctx.fillStyle='#747474';ctx.fillText((i/50).toFixed(1),x-10,16)}}ctx.restore()
  const arc=reduced?1:editorialEase((time-180)/650),r=Math.min(frame.width*.34,160)
  ctx.save();ctx.translate(frame.x+frame.width*.72,frame.y+frame.height*.85);ctx.rotate((1-arc)*.7);ctx.globalAlpha*=arc;ctx.fillStyle='rgba(246,246,246,.66)';ctx.strokeStyle='rgba(104,104,104,.65)';ctx.lineWidth=1.2
  ctx.beginPath();ctx.arc(0,0,r,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(0,0,r,Math.PI,Math.PI+Math.PI*arc);ctx.stroke()
  for(let degree=0;degree<=180*arc;degree+=5){const a=Math.PI+degree*Math.PI/180,inner=r-(degree%30===0?15:7);ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke()}
  ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.stroke();ctx.restore()
}
export function drawEditorialClaim(ctx:CanvasRenderingContext2D,claim:NonNullable<EditorialPresentation['claim']>,frame:EditorialFrame,time:number,reduced=false,avatar?:EditorialPhoto){
  const t=reduced?1:editorialEase(time/320),previous=claim.previousText??'';ctx.save();ctx.globalAlpha*=t;ctx.translate(0,(1-t)*10);ctx.font='400 25px Arial';ctx.textAlign='left'
  const oldWidth=ctx.measureText(previous).width,width=Math.min(frame.width,Math.max(180,mix(oldWidth||ctx.measureText(claim.text).width,ctx.measureText(claim.text).width,t)+42)),height=Math.max(60,wrap(ctx,claim.text,width-42).length*31+26),x=frame.x,y=frame.y
  ctx.fillStyle='#fff';ctx.strokeStyle='rgba(220,225,229,.3)';ctx.lineWidth=1;ctx.shadowColor='rgba(24,38,48,.09)';ctx.shadowBlur=22;ctx.shadowOffsetY=5;ctx.beginPath()
  if(claim.thought){for(let i=0;i<=80;i++){const a=i/80*Math.PI*2,r=1+.045*Math.sin(a*12),px=x+width/2+Math.cos(a)*width/2*r,py=y+height/2+Math.sin(a)*height/2*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath()}else ctx.roundRect(x,y,width,height,24)
  ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.save();ctx.beginPath();ctx.arc(x-35,y+height/2,24,0,Math.PI*2);ctx.fillStyle='#e3edf2';ctx.fill();ctx.clip();if(avatar)photo(ctx,avatar,{x:x-59,y:y+height/2-24,width:48,height:48},editorialFeatureGeometry(avatar,'whole')?.frame);else{ctx.fillStyle='#708b9c';ctx.font='400 16px Arial';ctx.textAlign='center';ctx.fillText(claim.author.slice(0,2).toUpperCase(),x-35,y+height/2+6)}ctx.restore();ctx.fillStyle='#697985';ctx.font='400 18px monospace';ctx.fillText(claim.author,x,y-15);ctx.fillStyle='#253641';ctx.font='400 25px Arial';drawEditorialText(ctx,previous,claim.text,x+21,y+39,t,width-42,31);ctx.restore()
}
export function drawEditorialResearch(ctx:CanvasRenderingContext2D,studies:NonNullable<EditorialPresentation['studies']>,frame:EditorialFrame,time:number,reduced=false,cards:NonNullable<EditorialPresentation['referenceCards']>=[]){
  const deck=cards.length?cards.map(card=>({authors:card.author,year:'',title:card.title,journal:new URL(card.url).hostname,atMs:card.atMs})):studies.map(id=>({...creatorStudies[id],atMs:undefined}))
  let offset=0
  for(const [i,paper] of deck.entries()){
    const t=reduced?1:editorialEase((time-(paper.atMs??i*240))/360)
    ctx.save();ctx.font='400 21px Arial';const lines=wrap(ctx,paper.title,frame.width-36).slice(0,3),height=58+lines.length*25
    if(t>0){
      ctx.globalAlpha*=t;const x=frame.x,y=frame.y+offset+10*(1-t),w=frame.width
      ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='rgba(24,38,48,.09)';ctx.shadowBlur=22;ctx.shadowOffsetY=5;ctx.beginPath();ctx.roundRect(x,y,w,height,23);ctx.fill();ctx.restore()
      ctx.fillStyle='#899197';ctx.font='400 15px Arial';ctx.fillText([paper.authors,paper.year].filter(Boolean).join(' · '),x+18,y+24,w-50)
      ctx.fillStyle='#293238';ctx.font='400 21px Arial';lines.forEach((line,n)=>ctx.fillText(line,x+18,y+51+n*25))
      ctx.fillStyle='#92999e';ctx.font='400 13px Arial';ctx.fillText(paper.journal,x+18,y+height-14,w-36)
      ctx.strokeStyle='#bcc4c9';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x+w-28,y+14,10,13,2);ctx.moveTo(x+w-25,y+18);ctx.lineTo(x+w-21,y+18);ctx.stroke()
    }
    offset+=height+12;ctx.restore()
  }
}
/** Perspective strips keep this compatible with both preview and CPU video rendering. */
const devices=new WeakMap<object,HTMLCanvasElement>()
function deviceSurface(source:EditorialPhoto['image']){
  let canvas=devices.get(source);if(canvas)return canvas
  canvas=document.createElement('canvas');canvas.width=source.width+32;canvas.height=source.height+32
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fcfcfc';ctx.strokeStyle='#d5d5d5';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(1,1,canvas.width-2,canvas.height-2,42);ctx.fill();ctx.stroke();ctx.beginPath();ctx.roundRect(16,16,source.width,source.height,30);ctx.clip();ctx.drawImage(source,16,16);devices.set(source,canvas);return canvas
}
export function drawEditorialPerspective(ctx:CanvasRenderingContext2D,source:EditorialPhoto['image'],frame:EditorialFrame,yaw:number,vertical=false){
  if(vertical){const depth=Math.sin(yaw)*.22,cos=Math.max(.08,Math.cos(yaw));for(let i=0;i<24;i++){const a=i/24,b=(i+1)/24,m=(a+b)/2,s=1/(1+depth*(m*2-1)),w=frame.width*s,h=frame.height*cos*s/24+1;ctx.drawImage(source,0,a*source.height,source.width,(b-a)*source.height,frame.x+(frame.width-w)/2,frame.y+frame.height/2+(m-.5)*frame.height*cos*s-h/2,w,h)}return}
  const depth=Math.sin(yaw)*.22,cos=Math.max(.08,Math.cos(yaw)),n=24;ctx.save()
  for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n,mid=(a+b)/2,s=1/(1+depth*(mid*2-1)),h=frame.height*s,x=frame.x+frame.width/2+(mid-.5)*frame.width*cos*s,w=frame.width*cos*s/n+1;ctx.drawImage(source,a*source.width,0,(b-a)*source.width,source.height,x-w/2,frame.y+(frame.height-h)/2,w,h)}ctx.restore()
}
export function renderEditorialScene(ctx:CanvasRenderingContext2D,presentation:EditorialPresentation,feature:typeof visualFeatures[number],primary:EditorialPhoto,references:EditorialPhoto[],size:{width:number;height:number},time:number,duration:number,reduced=false,events?:EditorialEvent[]){
  ctx=originalVideoContext(ctx)
  ctx.fillStyle='#fff';ctx.fillRect(0,0,size.width,size.height)
  const {width:W,height:H}=size,v=presentation.variant,t=reduced?1:editorialEase(time/760),hero={x:0,y:0,width:W,height:H},g=editorialFeatureGeometry(primary,feature),label=presentation.label??labels[feature],secondary=references[presentation.referenceIndex]
  const sourceSpace=(draw:()=>void,item=primary)=>{const baseScale=Math.max(hero.width/item.image.width,hero.height/item.image.height),zoom=['callout','network','drafting','view-cone'].includes(presentation.kind)?1+(v%3)*.1*(reduced?1:editorialEase(time/800)):1,s=baseScale*zoom,c=editorialFeatureGeometry(item,feature)?.frame,x=(W-item.image.width*baseScale)/2-(zoom-1)*(c?c.x+c.width/2:item.image.width/2)*baseScale,y=hero.y-(zoom-1)*(c?c.y+c.height/2:item.image.height/2)*baseScale;ctx.save();ctx.translate(x,y);ctx.scale(s,s);draw();ctx.restore()}
  const base=()=>sourceSpace(()=>ctx.drawImage(primary.image,0,0));ctx.save()
  switch(presentation.kind){
    case 'feature-tray':case 'cursor-tour':
      base();drawEditorialFeatureTour(ctx,primary,size,time,duration,v,reduced,presentation.kind==='feature-tray',events,presentation.accents,presentation.interaction);break
    case 'focus-grid':case 'tile-expand':case 'evidence-fan':
      drawEditorialPhotoGrid(ctx,primary,references,feature,size,time,duration,v,reduced,presentation.kind,presentation.selectedIndex,events?.[0]?.atMs,presentation.accents,presentation.interaction);break
    case 'swatch-strip':
      base();drawEditorialSwatches(ctx,primary,feature,size,time,v,reduced);break
    case 'document-lift':case 'reference-hinge':
      base();if(secondary)drawEditorialReferencePlane(ctx,secondary,size,time,reduced,presentation.kind,presentation.assetCaption,presentation.holdMediaAtMs!==undefined,v);break
    case 'tool-sweep':
      base();if(g)sourceSpace(()=>drawEditorialTool(ctx,g.frame,reduced?1:time/1400,feature==='facial-hair'?'clipper':'brush',reduced,v));break
    case 'callout':base();sourceSpace(()=>presentation.accents?drawEditorialOverlaySet(ctx,primary,feature,time,v,reduced,presentation.accents):drawEditorialAcquisition(ctx,primary,feature,time,v,reduced));break
    case 'network':base();sourceSpace(()=>drawEditorialNetwork(ctx,primary,feature,time,v,reduced,presentation.layers));break
    case 'view-cone':base();if(g&&g.points.length>3)sourceSpace(()=>{ctx.save();ctx.globalAlpha*=.09*t;ctx.fillStyle='#d1d1d1';ctx.beginPath();[g.points[0],g.points[Math.floor(g.points.length/3)],g.points[Math.floor(g.points.length*2/3)]].forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();drawEditorialNetwork(ctx,primary,feature,time,v,reduced)});break
    case 'color-reveal':sourceSpace(()=>drawEditorialColorReveal(ctx,primary.image,primary.image.width,primary.image.height,reduced?1:editorialEase(time/1600),v));break
    case 'line-art':case 'drafting':{
      base();const art=editorialLineArt(primary);sourceSpace(()=>drawEditorialBrushLayer(ctx,primary.image.width,primary.image.height,t,()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,primary.image.width,primary.image.height);ctx.drawImage(art,0,0,primary.image.width,primary.image.height)},v))
      if(presentation.kind==='drafting'&&g)sourceSpace(()=>drawEditorialDrafting(ctx,{x:g.frame.x-g.eyeSpan*.2,y:g.frame.y-g.eyeSpan*.25,width:g.frame.width+g.eyeSpan*.4,height:Math.max(g.frame.height,g.eyeSpan*.5)},Math.max(0,time-400),v,reduced))
      const restore=reduced?1:editorialEase((time-Math.max(1400,duration*.56))/640)
      if(restore>0)sourceSpace(()=>drawEditorialBrushLayer(ctx,primary.image.width,primary.image.height,restore,()=>ctx.drawImage(primary.image,0,0),v+2))
      if(time>760||reduced)sourceSpace(()=>drawEditorialNetwork(ctx,primary,feature,Math.max(0,time-760),v,reduced));break
    }
    case 'reference-inset':{
      photo(ctx,primary,{x:0,y:0,width:W,height:H},undefined,0)
      const reveal=reduced?1:editorialEase((time-260)/540),f={x:W*(v%2?.065:.46),y:H*.66+H*.025*(1-reveal),width:W*.34,height:H*.15}
      ctx.save();ctx.globalAlpha*=reveal
      ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='rgba(24,38,48,.12)';ctx.shadowBlur=26;ctx.shadowOffsetY=6;ctx.beginPath();ctx.roundRect(f.x-5,f.y-5,f.width+10,f.height+10,30);ctx.fill();ctx.restore()
      const useDetail=presentation.referenceMode!=='asset',item=useDetail?primary:secondary??primary
      photo(ctx,item,f,useDetail&&g?editorialInsetRegion(g.frame,item,f.width/f.height):undefined,26)
      ctx.restore();break
    }
    case 'card-morph':case 'comparison':{
      const one={x:W*(presentation.kind==='card-morph'?.08:.045),y:H*(v%3===2?.22:.24),width:W*(presentation.kind==='card-morph'?.84:.435),height:H*.62},a={x:mix(hero.x,one.x,t),y:mix(hero.y,one.y,t),width:mix(hero.width,one.width,t),height:mix(hero.height,one.height,t)};photo(ctx,primary,a)
      if(presentation.kind!=='card-morph'){
        const s=reduced?1:editorialEase((time-260)/540),f={x:W*.52+W*.06*(1-s)*(v%2?-1:1),y:one.y+(v%3===1?H*.03*(1-s):0),width:W*.435,height:one.height};ctx.save();ctx.globalAlpha*=s;const image=secondary??primary
        ctx.save();ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x+f.width*s+f.width*.15*(1-s),f.y);ctx.lineTo(f.x+f.width*s,f.y+f.height);ctx.lineTo(f.x,f.y+f.height);ctx.closePath();ctx.clip();photo(ctx,image,f);ctx.restore();ctx.restore()
        ctx.save();ctx.globalAlpha*=s;ctx.fillStyle='rgba(117,117,117,.65)';ctx.beginPath();ctx.arc(W*.5,H*.54,15,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';path(ctx,[{x:W*.5+3,y:H*.54-5},{x:W*.5-2,y:H*.54},{x:W*.5+3,y:H*.54+5}]);ctx.restore()
      }break
    }
    case 'orbit':{
      const poses=[primary,...references],p=reduced?0:Math.min(poses.length-1,time/Math.max(1,duration-800)*(poses.length-1)),i=Math.floor(p),n=Math.min(poses.length-1,i+1),b=editorialEase(p-i);photo(ctx,poses[i],hero)
      if(n!==i){ctx.save();ctx.globalAlpha*=b;photo(ctx,poses[n],hero);ctx.restore()}
      break
    }
    case 'claim':base();if(presentation.claim)drawEditorialClaim(ctx,presentation.claim,{x:W*.16,y:H*.22,width:W*.7,height:100},time,reduced,presentation.claim.avatarIndex===undefined?undefined:references[presentation.claim.avatarIndex]);break
    case 'research':photo(ctx,primary,{x:0,y:0,width:W,height:H},undefined,0);drawEditorialResearch(ctx,presentation.studies??[],{x:W*.055,y:H*((presentation.referenceCards?.length??presentation.studies?.length??0)>2?.46:.72),width:W*.31,height:H*.5},time,reduced,presentation.referenceCards);break
    case 'device':{
      if(!secondary){base();break}
      const ratio=secondary.image.height/secondary.image.width,w=Math.min(W*.55,H*.62/ratio),f={x:(W-w)/2,y:H*.25+(1-t)*-H*.16,width:w,height:w*ratio};ctx.save();drawEditorialPerspective(ctx,deviceSurface(secondary.image),f,(1-t)*1.34);ctx.restore();break
    }
    case 'domain':{
      const scale=mix(1.5,1,t),f={x:W*.15,y:H*.5,width:W*.7,height:80};ctx.save();ctx.translate(W/2,H*.5);ctx.scale(scale,scale);ctx.translate(-W/2,-H*.5);ctx.strokeStyle='rgba(144,144,144,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(f.x,f.y,f.width,f.height,40);ctx.stroke();ctx.fillStyle='#777777';ctx.font='400 34px Arial';drawEditorialText(ctx,'',presentation.label??'Mogging.com',f.x+30,f.y+51,reduced?1:time/700,f.width-110);ctx.beginPath();ctx.arc(f.x+f.width-43,f.y+34,11,0,Math.PI*2);ctx.moveTo(f.x+f.width-35,f.y+43);ctx.lineTo(f.x+f.width-26,f.y+52);ctx.stroke();ctx.restore();break
    }
  }
  if(presentation.accents?.length && ['swatch-strip','document-lift','reference-hinge','tool-sweep','reference-inset','color-reveal'].includes(presentation.kind))sourceSpace(()=>drawEditorialOverlaySet(ctx,primary,feature,time,v,reduced,presentation.accents))
  ctx.restore()
}

export function editorialMicroLabel(text:string,time:number,variant=0,reduced=false){
  if(reduced||time>=380)return text
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ0123456789',settled=Math.floor(Math.max(0,time)/380*text.length)
  return [...text].map((char,i)=>i<settled||char===' '?char:alphabet[(i*13+Math.floor(time/48)+variant*7)%alphabet.length]).join('')
}
