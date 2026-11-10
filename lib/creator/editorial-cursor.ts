import manifest from '../../public/creator/cursors/manifest.json'

export const editorialCursorKinds=['arrow','pointing-hand','crosshair','open-hand','closed-hand','resize-horizontal'] as const
export type EditorialCursorKind=typeof editorialCursorKinds[number]
export type EditorialCursorAction='click'|'double-click'|'drag'
type Point={x:number;y:number}
type CursorImage=CanvasImageSource & {width:number;height:number}
const images=new Map<EditorialCursorKind,CursorImage>()
let loading:Promise<void>|undefined
const clamp=(t:number)=>Math.max(0,Math.min(1,t))
const ease=(t:number)=>{t=clamp(t);return 1-(1-t)**3}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t

export function installEditorialCursorImages(values:Partial<Record<EditorialCursorKind,CursorImage>>){
  for(const kind of editorialCursorKinds)if(values[kind])images.set(kind,values[kind]!)
}

export function prepareEditorialCursors(urls?:Partial<Record<EditorialCursorKind,string>>):Promise<void>{
  if(images.size===editorialCursorKinds.length)return Promise.resolve()
  if(loading)return loading
  loading=Promise.all(editorialCursorKinds.map(async kind=>{
    if(images.has(kind))return
    const image=new Image()
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error(`Could not load the ${kind} cursor`));image.src=urls?.[kind]??`/creator/cursors/${kind}.png`})
    images.set(kind,image)
  })).then(()=>{}).finally(()=>{loading=undefined})
  return loading
}

export const cursorMotionProfiles=[
  {name:'Precision click',move:440,hover:90,path:0,kind:'arrow',action:'click'},
  {name:'Curved selection',move:520,hover:110,path:1,kind:'pointing-hand',action:'click'},
  {name:'Double-click inspect',move:400,hover:100,path:2,kind:'arrow',action:'double-click'},
  {name:'Crosshair acquire',move:480,hover:170,path:3,kind:'crosshair',action:'click'},
  {name:'Soft hand approach',move:610,hover:90,path:4,kind:'pointing-hand',action:'click'},
  {name:'Hover and confirm',move:460,hover:260,path:5,kind:'arrow',action:'click'},
] as const

/** The click/drop owns the effect clock. Reduced motion removes the gesture, not its event. */
export function editorialCursorTiming(atMs:number,variant=0,action?:EditorialCursorAction,reduced=false){
  const p=cursorMotionProfiles[variant%cursorMotionProfiles.length],operation=action??p.action
  const press=76,second=operation==='double-click'?170:0,clickAtMs=reduced?Math.max(0,atMs):Math.max(200+second,atMs)
  const downAtMs=operation==='drag'?Math.max(0,clickAtMs-p.move):clickAtMs-press-second,arriveAtMs=Math.max(0,downAtMs-p.hover),startMs=Math.max(0,arriveAtMs-p.move)
  return {startMs,arriveAtMs,downAtMs,clickAtMs,second,operation,moveRatio:Math.min(1,(arriveAtMs-startMs)/p.move)}
}

export function sampleEditorialCursor(timeMs:number,from:Point,target:Point,atMs:number,variant=0,action?:EditorialCursorAction,reduced=false,followTo?:Point){
  const timing=editorialCursorTiming(atMs,variant,action,reduced),p=cursorMotionProfiles[variant%cursorMotionProfiles.length]
  const shortFrom={x:mix(target.x,from.x,timing.moveRatio),y:mix(target.y,from.y,timing.moveRatio)}
  const travel=ease((timeMs-timing.startMs)/Math.max(1,timing.arriveAtMs-timing.startMs)),distance=Math.hypot(target.x-shortFrom.x,target.y-shortFrom.y)
  const bend=[0,-.18,.14,-.08,.22,-.12][p.path]*Math.min(260,distance),wave=Math.sin(travel*Math.PI)
  let x=mix(shortFrom.x,target.x,travel),y=mix(shortFrom.y,target.y,travel)+bend*wave
  if(p.path===3)x+=Math.sin(travel*Math.PI)*Math.min(24,distance*.08)
  const dragging=timing.operation==='drag',follow=reduced?1:ease((timeMs-timing.clickAtMs-100)/420)
  if(dragging){const t=ease((timeMs-timing.downAtMs)/Math.max(1,timing.clickAtMs-timing.downAtMs));x=mix(from.x,target.x,t);y=mix(from.y,target.y,t)}
  else if(followTo && timeMs>timing.clickAtMs+100){x=mix(target.x,followTo.x,follow);y=mix(target.y,followTo.y,follow)}
  const inPress=(start:number)=>{const t=(timeMs-start)/76;return t>=0&&t<=1?Math.sin(t*Math.PI):0}
  const pressure=dragging && timeMs>=timing.downAtMs&&timeMs<timing.clickAtMs?1:Math.max(inPress(timing.downAtMs),timing.second?inPress(timing.clickAtMs-76):0)
  const tail=followTo?740:410,opacity=reduced?0:ease((timeMs-timing.startMs)/75)*(1-ease((timeMs-timing.clickAtMs-tail)/160))
  const kind:EditorialCursorKind=dragging?(pressure?'closed-hand':'open-hand'):p.kind
  return {...timing,x,y,kind,pressure,opacity,effectMs:timeMs-timing.clickAtMs,clicked:timeMs>=timing.clickAtMs}
}
export type EditorialCursorSample=ReturnType<typeof sampleEditorialCursor>

/** Native cursor pixels retain the system hotspot through the press scale. */
export function drawEditorialCursor(ctx:CanvasRenderingContext2D,state:EditorialCursorSample,kind:EditorialCursorKind=state.kind){
  if(state.opacity<=0)return
  ctx.save();ctx.globalAlpha*=state.opacity;ctx.translate(state.x,state.y)
  const scale=1.55*(1-state.pressure*.065),source=images.get(kind),meta=manifest[kind]
  ctx.scale(scale,scale)
  if(source)ctx.drawImage(source,-meta.hotspot.x,-meta.hotspot.y,meta.width,meta.height)
  else{
    ctx.fillStyle='#151515';ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.lineJoin='round'
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,21);ctx.lineTo(5.5,16);ctx.lineTo(10,25);ctx.lineTo(13.5,23.3);ctx.lineTo(9,14);ctx.lineTo(16,14);ctx.closePath();ctx.fill();ctx.stroke()
  }
  ctx.restore()
}
