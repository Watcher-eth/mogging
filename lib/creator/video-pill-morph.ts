import { DEFAULT_TEXT_MORPH_OPTIONS, diffSegments, type Segment } from 'torph'
import type { PortraitMetric } from './portrait-metric'

export const pillMotion = { durationMs: DEFAULT_TEXT_MORPH_OPTIONS.duration, padding: 16, height: 52, fontSize: 32 } as const
export const portraitMetricText = (metric: PortraitMetric) => {
  const score = metric.unit === '/10' || metric.unit === '/8'
  const value = score && !Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
  return score ? `${value} / ${metric.unit.slice(1)}` : value + metric.unit
}

type Glyph = Segment & { x: number; y: number; opacity: number }
export type PillFrame = { width: number; opacity: number; glyphs: Glyph[]; metric?: PortraitMetric }
type Transition = { at: number; from: PillFrame; to: PillFrame }
const curve = DEFAULT_TEXT_MORPH_OPTIONS.ease.match(/[\d.]+/g)!.map(Number)
const bezier = (t: number, a: number, b: number) => 3*(1-t)*(1-t)*t*a + 3*(1-t)*t*t*b + t*t*t
function ease(progress: number) {
  if(progress<=0)return 0
  if(progress>=1)return 1
  let lo=0,hi=1
  for(let i=0;i<14;i++){const t=(lo+hi)/2;if(bezier(t,curve[0],curve[2])<progress)lo=t;else hi=t}
  return bezier((lo+hi)/2,curve[1],curve[3])
}
function sample(transition: Transition, time: number, reduced=false): PillFrame {
  const t=reduced?1:ease((time-transition.at)/pillMotion.durationMs),from=new Map(transition.from.glyphs.map(g=>[g.id,g]))
  const mix=(a:number,b:number)=>a+(b-a)*t
  return {metric:transition.to.metric,width:mix(transition.from.width,transition.to.width),opacity:mix(transition.from.opacity,transition.to.opacity),glyphs:transition.to.glyphs.map(g=>{const old=from.get(g.id) ?? {...g,y:12,opacity:0};return {...g,x:mix(old.x,g.x),y:mix(old.y,g.y),opacity:mix(old.opacity,g.opacity)}})}
}

// Torph matches numeric places; a fixed video clock replaces DOM/WAAPI timing.
// Preparing the track once makes scrubbing, live preview and MP4 frames agree.
export function createPortraitPillTrack(measure:(text:string)=>number, metricAt:(time:number)=>PortraitMetric|undefined, durationMs:number) {
  const transitions:Transition[]=[],step=100
  let segments:Segment[]=[],lastKey:string|undefined,previous:PillFrame={width:0,opacity:0,glyphs:[]}
  for(let at=0;at<=durationMs;at+=step){
    const metric=metricAt(Math.min(at,durationMs-1)),text=metric?portraitMetricText(metric):''
    const key=text+'\0'+(metric?.imageId ?? '')+'\0'+(metric?.label ?? '')
    if(key===lastKey)continue
    previous=transitions.length?sample(transitions.at(-1)!,at):previous
    const next=diffSegments(segments,text,'en').segments
    let prefix=''
    const glyphs:Glyph[]=next.map(s=>{const x=pillMotion.padding+measure(prefix);prefix+=s.string;return {...s,x,y:0,opacity:1}})
    const ids=new Set(next.map(s=>s.id))
    for(const g of previous.glyphs)if(!ids.has(g.id)&&g.opacity>.001)glyphs.push({...g,y:-12,opacity:0})
    const width=text?measure(text)+pillMotion.padding*2:previous.width
    // First appearance fades at its intrinsic width rather than growing from zero.
    if(!transitions.length)previous={...previous,width}
    transitions.push({at,from:previous,to:{width,opacity:text?1:0,glyphs,metric:metric??previous.metric}})
    segments=next;lastKey=key
  }
  return {sample(time:number,reduced=false){const index=transitions.findLastIndex(t=>t.at<=time);return index<0?{width:0,opacity:0,glyphs:[]} as PillFrame:sample(transitions[index],time,reduced)}}
}


const textDiffs = new Map<string, { from: Segment[]; to: Segment[] }>()

export function drawVideoTextMorph(ctx: CanvasRenderingContext2D, previous: string, next: string, x: number, y: number, progress: number, maxWidth: number) {
  if (previous === next || progress >= 1) {
    ctx.fillText(next, x, y, maxWidth)
    return
  }
  const key = JSON.stringify([previous, next])
  let segments = textDiffs.get(key)
  if (!segments) {
    const from = diffSegments([], previous, 'en').segments
    segments = { from, to: diffSegments(from, next, 'en').segments }
    if (textDiffs.size >= 128) textDiffs.clear()
    textDiffs.set(key, segments)
  }
  const amount = ease(progress)
  const right = ctx.textAlign === 'right'
  const layout = (parts: Segment[], text: string) => {
    const width = ctx.measureText(text).width
    const scale = Math.min(1, maxWidth / Math.max(1, width))
    let prefix = ''
    return parts.map(part => {
      const left = x + (ctx.measureText(prefix).width - (right ? width : 0)) * scale
      prefix += part.string
      return { ...part, left, scale }
    })
  }
  const from = layout(segments.from, previous)
  const to = layout(segments.to, next)
  const old = new Map(from.map(glyph => [glyph.id, glyph]))
  const retained = new Set(to.map(glyph => glyph.id))
  ctx.save()
  ctx.textAlign = 'left'
  const draw = (text: string, left: number, baseline: number, scale: number, opacity: number) => {
    ctx.save()
    ctx.globalAlpha *= opacity
    ctx.translate(left, baseline)
    ctx.scale(scale, 1)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  for (const glyph of from) {
    if (!retained.has(glyph.id)) draw(glyph.string, glyph.left, y - amount * 12, glyph.scale, 1 - amount)
  }
  for (const glyph of to) {
    const prior = old.get(glyph.id)
    if (prior) {
      const left = prior.left + (glyph.left - prior.left) * amount
      const scale = prior.scale + (glyph.scale - prior.scale) * amount
      if (prior.string === glyph.string) draw(glyph.string, left, y, scale, 1)
      else {
        draw(prior.string, left, y - amount * 12, scale, 1 - amount)
        draw(glyph.string, left, y + (1 - amount) * 12, scale, amount)
      }
    } else draw(glyph.string, glyph.left, y + (1 - amount) * 12, glyph.scale, amount)
  }
  ctx.restore()
}
