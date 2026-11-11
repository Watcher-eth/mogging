import { editorialEase, drawEditorialLeader } from './editorial-motion'
import { editorialBackground, mixEditorialPose, type EditorialPortraitPose } from './editorial-layout'
import { applyGlassInk } from './glass-overlay'
import type { EditorialEvent, EditorialFrame, EditorialPhoto } from './editorial-scenes'

export const portraitMotionKinds = ['ink-pan', 'dash-timeline', 'face-window', 'glass-phone', 'reaction-fountain', 'expression-rail', 'animated-cutaway', 'feature-checklist'] as const
type Kind = typeof portraitMotionKinds[number]
export const portraitReactionStyles = ['hearts', 'sparkles', 'love', 'surprise', 'celebration'] as const
type ReactionStyle = typeof portraitReactionStyles[number]
const reactionEmojis = {
  love: ['💖', '😍', '❤️', '🥰'],
  surprise: ['😮', '👀', '🤩', '✨'],
  celebration: ['🔥', '✨', '🙌', '💫'],
} as const
type Point = { x: number; y: number }
type Geometry = { frame: EditorialFrame; paths: Point[][]; points: Point[]; eyeSpan: number }
type Lettering = (ctx: CanvasRenderingContext2D, previous: string, value: string, x: number, y: number, progress: number, width?: number) => void
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number|number[], fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
}

function expression(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mood: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.moveTo(x-r*.44, y+r*.24)
  ctx.quadraticCurveTo(x, y+r*(.24+mood*.57), x+r*.44, y+r*.24)
  for (const s of [-1, 1]) {ctx.moveTo(x+s*r*.32, y-r*.25); ctx.lineTo(x+s*r*.32, y-r*.12)}
  ctx.stroke()
}

function drawReaction(ctx: CanvasRenderingContext2D, heart: boolean) {
  ctx.beginPath()
  if (heart) {
    ctx.moveTo(0, .83)
    ctx.bezierCurveTo(-.44, .44, -1.11, .02, -.88, -.51)
    ctx.bezierCurveTo(-.72, -.94, -.22, -.92, 0, -.48)
    ctx.bezierCurveTo(.22, -.92, .72, -.94, .88, -.51)
    ctx.bezierCurveTo(1.11, .02, .44, .44, 0, .83)
  } else {
    ctx.moveTo(0, -1); ctx.quadraticCurveTo(.14, -.15, .94, 0); ctx.quadraticCurveTo(.14, .15, 0, 1)
    ctx.quadraticCurveTo(-.14, .15, -.94, 0); ctx.quadraticCurveTo(-.14, -.15, 0, -1)
  }
  ctx.fill()
}

const portraitSamples = new WeakMap<EditorialPhoto['image'], Uint8ClampedArray | null>()

function portraitLuminance(image: EditorialPhoto['image'], fallback: number) {
  const width = 64, height = 96
  if (!portraitSamples.has(image)) {
    let pixels: Uint8ClampedArray | null = null
    try {
      const sample = document.createElement('canvas')
      sample.width = width
      sample.height = height
      const ctx = sample.getContext('2d')
      ctx?.drawImage(image, 0, 0, width, height)
      pixels = ctx?.getImageData(0, 0, width, height).data ?? null
    } catch { /* A cross-origin portrait can still render without pixel sampling. */ }
    portraitSamples.set(image, pixels)
  }
  const pixels = portraitSamples.get(image)
  return ({ x, y }: Point) => {
    if (!pixels || x < 0 || y < 0 || x >= image.width || y >= image.height) return fallback
    const i = 4 * (Math.floor(y / image.height * height) * width + Math.floor(x / image.width * width))
    const luminance = (.2126 * pixels[i] + .7152 * pixels[i+1] + .0722 * pixels[i+2]) / 255
    return mix(fallback, luminance, pixels[i+3] / 255)
  }
}

function guideInk(ctx: CanvasRenderingContext2D, weight: number, luminance: number) {
  const pale = luminance > .72
  applyGlassInk(ctx, 1, weight, pale ? 'rgba(83,75,72,.88)' : 'rgba(255,255,255,.98)')
  if (pale) ctx.shadowBlur = 0
}

function drawFountain(
  ctx: CanvasRenderingContext2D, origin: Point, spread: number, width: number, time: number,
  duration: number, style: ReactionStyle, variant: number, reduced: boolean, luminance: (point: Point) => number,
) {
  const emojis = style === 'hearts' || style === 'sparkles' ? undefined : reactionEmojis[style]
  const fade = reduced ? 1 : 1 - editorialEase((time - duration + 260) / 260)
  for (let i = 0; i < 6; i++) {
    const side = (i + variant) % 2 ? -1 : 1
    const pair = Math.floor(i / 2)
    const delay = pair * 245 + (i % 2) * 96
    const progress = reduced ? .67 - pair * .22 : (time - delay) / (1390 + (i % 2) * 100)
    if (progress <= 0 || progress >= 1) continue
    const pop = editorialEase(progress / .16)
    const size = (37 + (i * 3 % 4) * 6) * width / 1316
    const lane = spread + pair * 19 + (65 + pair * 15) * progress
    const x = clamp(origin.x + side * lane + 16 * Math.sin(progress * 3.7 + i), width * .10, width * .85)
    const y = origin.y - (310 + (i % 2) * 23) * progress + pair * 20
    ctx.save()
    ctx.globalAlpha *= pop * (1 - editorialEase((progress - .67) / .33)) * fade
    ctx.translate(x, y)
    ctx.rotate(side * (progress * .49 - .26))
    const scale = size * (.62 + .38 * pop + .10 * Math.sin(Math.PI * pop))
    if (emojis) {
      ctx.font = `${Math.round(scale * 1.75)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emojis[i % emojis.length], 0, 0)
    } else {
      ctx.scale(scale, scale)
      ctx.fillStyle = luminance({ x, y }) > .78 ? '#70676bd9' : '#fff'
      drawReaction(ctx, style === 'hearts')
    }
    ctx.restore()
  }
}

/** Draw on the same projected landmarks as the moving portrait; line growth is continuous between points. */
function softContour(points:Point[]) {
  if(points.length<3)return points
  return [points[0],...points.slice(1).flatMap((b,i)=>{
    const a=points[i]
    return [.23,.77].map(t=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)}))
  }),points.at(-1)!]
}

function drawInk(ctx: CanvasRenderingContext2D, geometry: Geometry, project: (p: Point) => Point, time: number, reduced: boolean, v: number, luminance: (point: Point) => number) {
  const paths = (geometry.paths.length ? geometry.paths : [geometry.points]).map(path => softContour(path))
  paths.forEach((original, i) => {
    const path = (i+v)%2 ? original.slice().reverse() : original
    const points = path.map(project)
    const tone = path.reduce((total, point) => total + luminance(point), 0) / Math.max(1, path.length)
    const start = points[0], delay = time-i*110
    if (!start || (!reduced && delay<0)) return
    const dot = reduced ? 1 : editorialEase(delay/150), draw = reduced ? 1 : editorialEase((delay-115)/640)
    ctx.save()
    guideInk(ctx, 3.2, tone)
    ctx.beginPath(); ctx.arc(start.x,start.y,5.2*dot,0,Math.PI*2); ctx.fill()
    const lengths = points.slice(1).map((p,n)=>Math.hypot(p.x-points[n].x,p.y-points[n].y))
    let distance = lengths.reduce((sum,n)=>sum+n,0)*draw
    ctx.setLineDash(v%3===1?[3,8]:[])
    ctx.beginPath(); ctx.moveTo(start.x,start.y)
    let head = start
    for (const [n,length] of lengths.entries()) {
      if (distance<=0) break
      const p=points[n],q=points[n+1],amount=Math.min(1,distance/Math.max(.01,length))
      head={x:mix(p.x,q.x,amount),y:mix(p.y,q.y,amount)}
      ctx.lineTo(head.x,head.y); distance-=length
    }
    ctx.stroke(); ctx.setLineDash([])
    if(draw>0){ctx.beginPath();ctx.arc(head.x,head.y,5.8,0,Math.PI*2);ctx.stroke()}
    if(i===0 && v%3===2 && points.length>1){
      const end={x:clamp(head.x+(head.x>ctx.canvas.width*.5?62:-62),78,ctx.canvas.width-125),y:head.y-41}
      drawEditorialLeader(ctx,head,{x:head.x,y:end.y},end,reduced?1:editorialEase((delay-790)/450),.56)
    }
    ctx.restore()
  })
}

/** Register the ruler between the outer brow points, just above the eye line. */
function timelineAnchors(item: EditorialPhoto, geometry: Geometry, reverse: boolean, betweenEyes: boolean) {
  const { frame, eyeSpan } = geometry
  const xs = geometry.points.map(point => point.x)
  const left = Math.min(...xs), right = Math.max(...xs)
  const center = frame.x + frame.width / 2
  const half = Math.max((right - left) / 2 + eyeSpan * .12, eyeSpan * .67)
  const anchors = item.landmarks?.anchors
  const eyeY = anchors?.leftPupil && anchors.rightPupil
    ? (anchors.leftPupil.y + anchors.rightPupil.y) / 2 * item.image.height
    : undefined
  const y = betweenEyes && eyeY !== undefined ? eyeY - eyeSpan * .15 : frame.y + frame.height * .55
  const start = { x: clamp(center - half, 0, item.image.width), y }
  const end = { x: clamp(center + half, 0, item.image.width), y }
  return reverse ? { start: end, end: start } : { start, end }
}

function drawDashTimeline(
  ctx: CanvasRenderingContext2D, start: Point, end: Point, lead: number, progress: number,
  unit: number, luminance: (point: Point) => number,
) {
  if (lead <= 0) return
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  if (!distance) return
  const pointAt = (length: number) => ({ x: mix(start.x, end.x, length / distance), y: mix(start.y, end.y, length / distance) })
  const head = Math.max(Math.min(distance, 54 * unit * lead), distance * progress)
  ctx.save()
  const thickness = 5.5 * unit
  const cadence = 36 * unit
  for (let offset = 20 * unit; offset < head - 8 * unit; offset += cadence) {
    const from = pointAt(offset)
    const to = pointAt(Math.min(offset + 16 * unit, head - 8 * unit))
    guideInk(ctx, thickness, luminance(from))
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke()
    if (offset + 27 * unit < head - 8 * unit) {
      const dot = pointAt(offset + 27 * unit)
      guideInk(ctx, thickness, luminance(dot))
      ctx.beginPath(); ctx.arc(dot.x, dot.y, 2.6 * unit, 0, Math.PI * 2); ctx.fill()
    }
  }
  const tip = pointAt(head)
  for (const [index, point] of [start, tip].entries()) {
    if (index === 1 && head < 22 * unit) continue
    guideInk(ctx, 3.3 * unit, luminance(point))
    ctx.beginPath(); ctx.arc(point.x, point.y, (index ? 18 : 15) * unit * lead, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(point.x, point.y, 4.1 * unit * lead, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/** Original animated brow vignette. The illustration has no association with the portrait's identity. */
function vignette(ctx: CanvasRenderingContext2D, frame: EditorialFrame, time: number, v: number, reduced: boolean) {
  const t = reduced ? .55 : editorialEase((time%1760)/730)*(1-editorialEase((time%1760-1140)/620))
  const blink = reduced ? 0 : Math.sin(Math.PI*editorialEase((time%2450-1610)/230))**2
  ctx.save(); ctx.translate(frame.x+frame.width/2,frame.y+frame.height*.55); ctx.scale(frame.width/650,frame.width/650)
  const bg=ctx.createRadialGradient(-120,-140,10,0,30,470)
  bg.addColorStop(0,'#fff');bg.addColorStop(1,v%2?'#b8b6b4':'#c6c4c1')
  ctx.fillStyle=bg;ctx.fillRect(-450,-440,900,880)
  ctx.rotate((v%2?-1:1)*(.08-.13*t))
  ctx.fillStyle='#e1dfdc';ctx.strokeStyle='#413f3d';ctx.lineWidth=2
  ctx.beginPath();ctx.ellipse(0,1,150,164,0,0,Math.PI*2);ctx.fill();ctx.stroke()
  ctx.lineCap='round';ctx.lineJoin='round'
  for(const s of [-1,1]) {
    ctx.save();ctx.scale(s,1);ctx.strokeStyle='#353332';ctx.lineWidth=7
    ctx.beginPath();ctx.moveTo(22,-44+16*t);ctx.quadraticCurveTo(56,-70+10*t,110,-47-18*t);ctx.stroke()
    ctx.fillStyle='#fff';ctx.strokeStyle='#464340';ctx.lineWidth=2.5
    ctx.beginPath();ctx.moveTo(25,-14);ctx.quadraticCurveTo(62,-52+36*blink,109,-15);ctx.quadraticCurveTo(62,8-23*blink,25,-14);ctx.fill();ctx.stroke()
    if(blink<.8){ctx.fillStyle='#413f3c';ctx.beginPath();ctx.ellipse(64-5*t,-16,12,13*(1-blink),0,0,Math.PI*2);ctx.fill()}
    ctx.restore()
  }
  ctx.beginPath();ctx.moveTo(2,-5);ctx.quadraticCurveTo(8,38,-11,45);ctx.quadraticCurveTo(-1,51,13,47)
  ctx.moveTo(-38,79);ctx.quadraticCurveTo(0,90-22*t,38,79-12*t);ctx.stroke()
  ctx.restore()
}

function cover(ctx: CanvasRenderingContext2D, item: EditorialPhoto, frame: EditorialFrame) {
  const s=Math.max(frame.width/item.image.width,frame.height/item.image.height)
  const w=item.image.width*s,h=item.image.height*s
  ctx.drawImage(item.image,frame.x+(frame.width-w)/2,frame.y+(frame.height-h)/2,w,h)
}

export function editorialMotionLayout(
  kind: Kind, item: EditorialPhoto, geometry: Geometry | undefined, face: Geometry | undefined,
  size: {width:number;height:number}, time: number, duration: number, start: number,
  v: number, reduced: boolean, betweenEyes: boolean, hold = false,
) {
  const {width:W,height:H}=size, local=time-start
  const entry = reduced ? 1 : editorialEase((local+140)/Math.min(840,duration*.36))
  const tail = reduced ? 1 : 1-editorialEase((time-duration+460)/460)
  const motion=entry*(hold ? 1 : tail), side=v%2?1:-1
  const window=kind==='face-window',phone=kind==='glass-phone'
  const pan = kind === 'ink-pan'
  const timeline = kind === 'dash-timeline' && geometry ? timelineAnchors(item, geometry, side > 0, betweenEyes) : undefined
  const travelTime = Math.max(280, Math.min(1100, (duration - start) * .48))
  const tracking = reduced ? 1 : editorialEase((local - 180) / travelTime)
  const acquisition = reduced ? 1 : editorialEase((local + 170) / 460) * (hold ? 1 : tail)
  const baseScale=Math.max(W/item.image.width,H/item.image.height)
  const frame:EditorialFrame=window
    ? {x:W*(v%3===2?.27:.17),y:H*(v%3===0?.32:.30),width:W*(v%3===2?.56:.66),height:H*.40}
    : phone ? {x:W*.245,y:H*.27,width:W*.51,height:H*.51}
    : {x:0,y:0,width:W,height:H}
  const p=window||phone ? motion : 0
  const view={x:frame.x*p,y:frame.y*p,width:mix(W,frame.width,p),height:mix(H,frame.height,p)}
  const faceFocus=face?.frame
  const region=window||phone?faceFocus:geometry?.frame
  const focus=region ? {x:region.x+region.width/2,y:region.y+region.height/2} : {x:item.image.width/2,y:item.image.height*.45}
  const w=window && faceFocus ? faceFocus.width*1.27 : item.image.width*(phone?.85:1)
  const h=window && faceFocus ? faceFocus.height*1.36 : item.image.height*(phone?.85:1)
  const destinationScale=Math.max(frame.width/w,frame.height/h)
  const scale = timeline ? baseScale * (1 + acquisition * (.82 + .25 * tracking))
    : pan ? baseScale * (1 + (v % 3 === 0 ? .82 : .55) * motion) : mix(baseScale, destinationScale, p)
  const fit = (center:number, dim:number, extent:number) => dim>=extent ? clamp(center,extent-dim,0) : (extent-dim)/2
  const fullX=(W-item.image.width*baseScale)/2,fullY=(H-item.image.height*baseScale)/2
  const x = timeline
    ? mix(fullX, fit(W * (.5 + side * mix(-.13, .11, tracking)) - mix(timeline.start.x, timeline.end.x, tracking) * scale, item.image.width * scale, W), acquisition)
    : pan ? mix(fullX,fit(W*(.5+side*.11)-focus.x*scale,item.image.width*scale,W),motion)
    : view.x+mix(fullX,fit(view.width/2-focus.x*scale,item.image.width*scale,view.width),p)
  const y = timeline ? mix(fullY, fit(H * .48 - timeline.start.y * scale, item.image.height * scale, H), acquisition)
    : pan ? mix(fullY,fit(H*(.49+(v%3-1)*.04)-focus.y*scale,item.image.height*scale,H),motion)
    : view.y+mix(fullY,fit(view.height*.51-focus.y*scale,item.image.height*scale,view.height),p)
  const pose: EditorialPortraitPose = {
    frame: view, image: { x, y, width: item.image.width * scale, height: item.image.height * scale },
    radius: (phone ? 49 : 30) * p,
  }
  return { pose, timeline, tracking, entry, tail, motion, p, frame, faceFocus, side, local }
}

export function drawEditorialPortraitMotion(ctx: CanvasRenderingContext2D, kind: Kind, item: EditorialPhoto, geometry: Geometry|undefined, face: Geometry|undefined, reference: EditorialPhoto|undefined, size: {width:number;height:number}, time: number, duration: number, events: EditorialEvent[], v: number, label: string, reduced: boolean, lettering: Lettering, credit?: string, dark=false, reactionStyle?: ReactionStyle, betweenEyes=false, shared?: { from: EditorialPortraitPose; amount: number }, hold=false) {
  const {width:W,height:H}=size, start=events[0]?.atMs??0
  const layout = editorialMotionLayout(kind, item, geometry, face, size, time, duration, start, v, reduced, betweenEyes, hold)
  const { timeline, tracking, entry, tail, motion, p, frame, faceFocus, side, local } = layout
  const pose = shared ? mixEditorialPose(shared.from, layout.pose, shared.amount) : layout.pose
  const { x, y } = pose.image
  const scale = pose.image.width / item.image.width
  const { frame: view, radius } = pose
  const window = kind === 'face-window', phone = kind === 'glass-phone', cutaway = kind === 'animated-cutaway'
  const checklist = kind === 'feature-checklist', pan = kind === 'ink-pan', expressionRail = kind === 'expression-rail', fountain = kind === 'reaction-fountain'
  const theme = editorialBackground(dark), text = dark ? '#fff' : '#272626'
  const luminance = portraitLuminance(item.image, dark ? .09 : .93)
  const project = (point:Point) => ({x:x+point.x*scale,y:y+point.y*scale})
  const screenLuminance = (point: Point) => luminance({ x: (point.x - x) / scale, y: (point.y - y) / scale })
  ctx.save()
  ctx.fillStyle=theme;ctx.fillRect(0,0,W,H)
  if(p>0){
    ctx.shadowColor='#14141427';ctx.shadowBlur=33*p;ctx.shadowOffsetY=12*p
    pill(ctx,view.x,view.y,view.width,view.height,radius,theme);ctx.shadowBlur=0;ctx.shadowOffsetY=0
  }
  ctx.save()
  ctx.beginPath();ctx.roundRect(view.x,view.y,view.width,view.height,radius);ctx.clip()
  ctx.drawImage(item.image,x,y,item.image.width*scale,item.image.height*scale)
  if(phone && reference){
    ctx.save();ctx.globalAlpha*=editorialEase((p-.53)/.47);cover(ctx,reference,view);ctx.restore()
  } else if (timeline) {
    ctx.save()
    ctx.globalAlpha *= tail
    const lead = reduced ? 1 : editorialEase(local / 240)
    drawDashTimeline(ctx, project(timeline.start), project(timeline.end), lead, tracking, W / 1316, screenLuminance)
    ctx.restore()
  } else if (geometry && (pan || window || phone || expressionRail || checklist || fountain)) {
    ctx.save()
    ctx.globalAlpha *= tail * (fountain ? .85 : 1)
    drawInk(ctx, geometry, project, local, reduced, v, luminance)
    ctx.restore()
  }
  ctx.restore()
  if (window && p > 0) {
    ctx.save()
    ctx.globalAlpha *= p * tail
    ctx.strokeStyle = dark ? '#ffffff75' : '#8d858160'
    ctx.lineWidth = 2.8
    ctx.beginPath(); ctx.roundRect(view.x, view.y, view.width, view.height, radius); ctx.stroke()
    ctx.restore()
  }
  if(phone && p>0){
    ctx.save();ctx.globalAlpha*=p*tail
    const glass=ctx.createLinearGradient(view.x,view.y,view.x+view.width,view.y+view.height)
    glass.addColorStop(0,'#fff');glass.addColorStop(.36,dark?'#ffffff88':'#9c9390bd');glass.addColorStop(.66,dark?'#b9b4b5b0':'#b4aaa8d8');glass.addColorStop(1,'#fff')
    ctx.strokeStyle=glass;ctx.lineWidth=4.8
    ctx.beginPath();ctx.roundRect(view.x-10*p,view.y-10*p,view.width+20*p,view.height+20*p,radius+10*p);ctx.stroke()
    ctx.beginPath();ctx.roundRect(view.x,view.y,view.width,view.height,radius);ctx.stroke()
    const cx=view.x+view.width/2
    pill(ctx,cx-72*p,view.y,144*p,27*p,[0,0,20*p,20*p],dark?'#292929e8':'#d8d7d6e8')
    pill(ctx,cx-20*p,view.y+9*p,40*p,3.6*p,1.8*p,'#fffffff3')
    ctx.restore()
  }
  if(cutaway && motion>0){
    ctx.save();ctx.globalAlpha*=motion*.94;ctx.fillStyle=theme;ctx.fillRect(0,0,W,H);ctx.restore()
    const width=W*.65,height=H*.29
    const card={x:(W-width)/2+side*(1-motion)*52,y:H*.32+(1-motion)*44,width,height}
    ctx.save();ctx.globalAlpha*=motion;ctx.beginPath();ctx.roundRect(card.x,card.y,card.width,card.height,26);ctx.clip()
    if(reference)cover(ctx,reference,card);else vignette(ctx,card,Math.max(0,local),v,reduced)
    ctx.restore()
    ctx.save()
    ctx.globalAlpha *= motion
    ctx.strokeStyle = dark ? '#ffffff78' : '#91888492'
    ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.roundRect(card.x, card.y, width, height, 26); ctx.stroke()
    ctx.fillStyle = text; ctx.font = '400 21px monospace'; ctx.textAlign = 'center'
    ctx.fillText(credit ?? 'EXPRESSION ILLUSTRATION', card.x + width / 2, card.y + height + 36, width)
    ctx.restore()
  }
  if(fountain && faceFocus){
    const center=project({x:faceFocus.x+faceFocus.width*.5,y:faceFocus.y})
    const origin = { x: center.x, y: clamp(center.y + H * .095, H * .33, H * .54) }
    const spread = clamp(faceFocus.width * scale * .53, W * .12, W * .24)
    const style = reactionStyle ?? portraitReactionStyles[v % portraitReactionStyles.length]
    drawFountain(ctx, origin, spread, W, local, duration - start, style, v, reduced, screenLuminance)
    ctx.save();ctx.globalAlpha*=entry*tail
    const tags=events.filter(event=>event.label).slice(0,3)
    const heading = v % 2 === 0 ? tags[0]?.label : undefined
    if (heading) {
      ctx.save();ctx.font='italic 400 46px Georgia'
      const w = ctx.measureText(heading).width
      const headingX=clamp(center.x-w/2,W*.10,W*.81-w)
      const headingY = clamp(center.y - 118, H * .22, H * .39)
      ctx.fillStyle = screenLuminance({ x: headingX + w / 2, y: headingY - 20 }) > .72 ? '#433a38' : '#fff'
      lettering(ctx,'',heading,headingX,headingY,entry,w+18);ctx.restore()
    }
    for(const [i,event] of (heading ? tags.slice(1) : tags).entries()){
      const word=event.label!
      const t=reduced?1:editorialEase((time-event.atMs-140)/390)
      if(!t)continue
      ctx.save();ctx.globalAlpha*=t;ctx.font='500 30px Arial'
      const width=ctx.measureText(word).width+38,tx=side>0?W*.10:W*.81-width,ty=H*.35+i*60+(1-t)*10
      pill(ctx,tx,ty,width,48,20,'#fffffff5')
      ctx.fillStyle='#252525';lettering(ctx,'',word,tx+19,ty+33,t,width-16);ctx.restore()
    }
    ctx.restore()
  }
  if(expressionRail && motion>0){
    const railWidth = W * .49, left = W * .255, top = H * .68 + (1 - motion) * 14
    ctx.save()
    ctx.globalAlpha *= motion * tail
    const glass = ctx.createLinearGradient(left, top, left + railWidth, top + 127)
    glass.addColorStop(0, '#303438ec'); glass.addColorStop(1, '#44474de0')
    ctx.fillStyle = glass
    ctx.strokeStyle = '#ffffff85'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(left, top, railWidth, 127, 20); ctx.fill(); ctx.stroke()
    const from = left + 30, to = left + railWidth - 30, trackY = top + 54
    const sweep = reduced ? .68 : editorialEase((local - 320) / 1190)
    const cursor = mix(from, to, v % 2 ? 1 - sweep : sweep)
    ctx.fillStyle = '#f4f8fa'; ctx.font = '500 19px monospace'
    ctx.fillText('MOOD', from, top + 30)
    pill(ctx, from, trackY - 4, to - from, 8, 4, '#c4d1d66f')
    if (cursor > from) pill(ctx, from, trackY - 4, cursor - from, 8, 4, '#d8e4e9db')
    pill(ctx, cursor - 5, trackY - 18, 10, 36, 5, '#fff')
    ctx.strokeStyle = '#fffd'; ctx.lineWidth = 1.9
    for (let i = 0; i < 3; i++) expression(ctx, mix(from + 11, to - 11, i / 2), top + 96, 13, i - 1)
    ctx.restore()
  }
  if(checklist && motion>0){
    const x=W*.10,y=H*.34
    ctx.save()
    for(const [i,event] of events.slice(0,3).entries()){
      if(!event.label)continue
      const t=reduced?1:editorialEase((time-event.atMs)/360)
      if(!t)continue
      const row=y+i*56,tx=x-(1-t)*18
      ctx.save();ctx.globalAlpha*=t*tail;ctx.font='500 26px Arial'
      const width=ctx.measureText(event.label).width+59
      pill(ctx,tx,row,width,47,13,'#282828ee')
      ctx.strokeStyle='#fffffff2';ctx.lineWidth=2.5;ctx.beginPath()
      ctx.moveTo(tx+14,row+21);ctx.lineTo(tx+19,row+26);ctx.lineTo(tx+27,row+17);ctx.stroke()
      ctx.fillStyle='#fff';lettering(ctx,'',event.label,tx+36,row+32,t,width-32);ctx.restore()
    }
    ctx.restore()
  }
  if((window||phone) && p>.42){
    const tag=phone?(credit??label):label
    ctx.save();ctx.globalAlpha*=editorialEase((p-.42)/.58)*tail
    ctx.fillStyle=text;ctx.font=window&&v%2?'italic 400 30px Georgia':'400 21px monospace'
    lettering(ctx,'',window&&v%2?tag:tag.toUpperCase(),frame.x,frame.y+frame.height+34,p,frame.width)
    ctx.restore()
  }
  ctx.restore()
}
