import { z } from 'zod'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { smoothMotion, videoSize } from './video-layout'
import { sceneWordStart } from './video-script'
import type { VideoScene } from './video-composition'
import { drawPortraitEffects, warpDestinationPoint, type PortraitWarp, type PortraitLighting, type PortraitEffects, type WarpRegion } from './video-portrait-effects'
import { faceContourPaths } from './face-metric-guides'
import { drawFaceTreatment } from './video-face-treatment'
import type { ReportOverlay } from './report-overlay'
import { paintCanvasNode, type CanvasPainter } from './canvas-layout'

export const photoStudySchema = z.object({
  feature: z.enum(['nose', 'cheeks', 'face-width', 'jaw', 'eyes', 'lips', 'brows']),
  amount: z.number().finite().min(-.25).max(.25).default(.055),
  mode: z.enum(['pinch', 'stretch', 'drag']).optional(),
  axis: z.enum(['x', 'y', 'both']).optional(),
  cursor: z.boolean().optional(),
  effect: z.enum(['shape','brow-contrast']).optional(),
  startWord: z.number().int().nonnegative().optional(),
  inferred: z.boolean().optional(),
}).strict().superRefine((study,ctx)=>{if(study.effect==='brow-contrast' && study.feature!=='brows')ctx.addIssue({code:'custom',message:'Brow contrast requires the detected brow contours.'})})
export type PhotoStudy = z.infer<typeof photoStudySchema>

export function drawPhotoStudyCueLabel(ctx: CanvasRenderingContext2D, study: PhotoStudy) {
  ctx.save()
  ctx.font = '500 25px "Mogging Share", Arial, sans-serif'
  const label = study.mode === 'pinch' ? 'Width illustration' : 'Shape illustration', width = ctx.measureText(label).width + 40
  const x = 150, y = videoSize.height * .76
  ctx.fillStyle = '#f9f9f9'
  ctx.beginPath(); ctx.roundRect(x, y, width, 48, 24); ctx.fill()
  ctx.fillStyle = '#343434'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, x + width / 2, y + 24)
  ctx.restore()
}

export function photoStudyRegions(landmarks: FaceLandmarksPayload | null | undefined, feature: PhotoStudy['feature']): WarpRegion[] {
  if (landmarks && (landmarks.confidence < .58 || Math.abs(landmarks.quality?.yawRadians ?? 0) > .65)) throw new Error('Use a clear, near-frontal photo for illustrative image variations.')
  const anchors = landmarks?.anchors ?? {}, { leftPupil: left, rightPupil: right, noseTip: nose, leftCheek, rightCheek, chin, forehead } = anchors
  if (!left || !right || !nose || [left, right, nose].some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Image variations need detected pupil and nose anchors. Analyze the photo first.')
  const eyeWidth = Math.abs(right.x - left.x), ratio = landmarks?.image ? landmarks.image.width / landmarks.image.height : 1
  if (eyeWidth < .03) throw new Error('The face is too small or turned for a reliable image variation.')
  const local = (points: (NormalizedPoint | undefined)[], rx: number, ry: number) => points.map(point => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`${feature} variations need all detected feature anchors.`)
    return { x: point.x, y: point.y, rx: eyeWidth * rx, ry: eyeWidth * ry * ratio }
  })
  if (feature === 'nose') return local([{ x: nose.x, y: nose.y - eyeWidth * .1 * ratio }], .52, .72)
  if (feature === 'cheeks') return local([leftCheek, rightCheek], .65, .75)
  if (feature === 'eyes') return local([left, right], .46, .32)
  if (feature === 'brows') return local([anchors.leftBrow, anchors.rightBrow], .48, .3)
  if (feature === 'lips') return local([anchors.mouthCenter ?? anchors.upperLip], .62, .4)
  if (feature === 'jaw') return local([anchors.jawLeft, anchors.jawRight], .7, .85)
  if (!leftCheek || !rightCheek || !chin || !forehead) throw new Error('Face-width variations need cheek, forehead and chin anchors.')
  if ([leftCheek, rightCheek, chin, forehead].some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Face-width variations need finite detected anchors.')
  if (chin.y <= forehead.y || Math.abs(rightCheek.x - leftCheek.x) < .05) throw new Error('Face-width anchors are not reliable enough for this variation.')
  return [{ x: (leftCheek.x + rightCheek.x) / 2, y: (forehead.y + chin.y) / 2, rx: Math.abs(rightCheek.x - leftCheek.x) * .8, ry: (chin.y - forehead.y) * .8 }]
}

// Caption cuts share one edit clock; a new caption must not restart the face deformation.
export function photoStudyClock(scenes: Array<{cueId:string;startMs:number;durationMs:number;source:{imageId:string|null};photoStudy?:PhotoStudy;narration?:string;words?:VideoScene['words']}>, scene: typeof scenes[number], localMs: number) {
  let first=scenes.findIndex(s=>s.startMs===scene.startMs && s.cueId===scene.cueId),last=first
  if(first<0)return {timeMs:localMs,durationMs:scene.durationMs}
  const same=(other:typeof scene|undefined)=>other?.cueId===scene.cueId && other?.source.imageId===scene.source.imageId && JSON.stringify(other?.photoStudy)===JSON.stringify(scene.photoStudy)
  while(first>0 && same(scenes[first-1]))first--
  while(last<scenes.length-1 && same(scenes[last+1]))last++
  const start = scenes[first]
  const cueMs = start.photoStudy?.startWord === undefined ? undefined
    : sceneWordStart({ ...start, narration: start.narration ?? '' }, start.photoStudy.startWord)
  return {timeMs:scene.startMs+localMs-start.startMs,durationMs:scenes[last].startMs+scenes[last].durationMs-start.startMs, ...(cueMs === undefined ? {} : { cueMs })}
}

export function photoStudyGesture(study: PhotoStudy, regions: WarpRegion[], timeMs: number, durationMs: number, reduced = false, landmarks?: FaceLandmarksPayload | null, cueMs?: number) {
  const time = Math.max(0, Math.min(1, timeMs / Math.max(1, durationMs)))
  const envelope = cueMs === undefined
    ? reduced ? 1 : smoothMotion((time-.12)/.18)*(1-smoothMotion((time-.82)/.16))
    : reduced ? Number(timeMs >= cueMs) : smoothMotion((timeMs - cueMs) / Math.max(1, Math.min(850, durationMs - cueMs)))
  const contrast = study.effect==='brow-contrast' ? study.amount*envelope : 0
  const strength = study.effect==='brow-contrast' ? 0 : study.amount*envelope
  const mode=study.mode ?? (['cheeks','jaw','brows'].includes(study.feature)?'drag':'pinch')
  const axis=study.axis ?? (['cheeks','brows'].includes(study.feature)?'y':study.feature==='eyes'?'both':'x')
  const a=landmarks?.anchors, ratio=landmarks?.image ? landmarks.image.width/landmarks.image.height : 1
  const span=a?.leftPupil && a.rightPupil ? Math.abs(a.rightPupil.x-a.leftPupil.x) : 0
  const fixed=[study.feature==='eyes' && mode==='drag'?undefined:a?.leftPupil,study.feature==='eyes' && mode==='drag'?undefined:a?.rightPupil,study.feature==='lips'?undefined:a?.mouthCenter,study.feature==='nose'?undefined:a?.noseTip].filter((p):p is NormalizedPoint=>Boolean(p))
  const pins=span>.03?fixed.map(p=>({...p,rx:span*.16,ry:span*.16*ratio})):[]
  const warp: PortraitWarp={regions,strengths:regions.map(()=>strength),mode,axis,pins,
    ...(mode==='drag'?{shifts:regions.map((region,index)=>({x:region.rx*strength*(axis==='y'?0:study.feature==='jaw'?(index===0?-1:1):1),y:region.ry*strength*(axis==='x'?0:['cheeks','brows'].includes(study.feature)?-1:1)}))}:{})}
  const grab={x:regions[0].x+regions[0].rx*.48,y:regions[0].y}, target=warpDestinationPoint(grab,warp)
  const approach=smoothMotion((time-.03)/.09)
  const cursor={x:grab.x+regions[0].rx*.55*(1-approach)+(target.x-grab.x)*approach,y:grab.y-regions[0].ry*.6*(1-approach)+(target.y-grab.y)*approach}
  const opacity=reduced || study.cursor!==true ? 0 : smoothMotion(time/.04)*(1-smoothMotion((time-.65)/.1))
  return {warp,grab,target,cursor,pressed:time>=.12 && time<.3,opacity,contrast}
}

// Texture changes use the detected closed brow silhouettes, not stretched skin.
const browEdits = new WeakMap<HTMLImageElement|HTMLCanvasElement,{landmarks:FaceLandmarksPayload;dark:HTMLCanvasElement;light:HTMLCanvasElement}>()
export function prepareBrowContrast(image: HTMLImageElement|HTMLCanvasElement, landmarks: FaceLandmarksPayload | null | undefined) {
  const cached=browEdits.get(image);if(cached && cached.landmarks===landmarks)return cached
  const contours=(['leftBrow','rightBrow'] as const).map(key=>landmarks?faceContourPaths(landmarks,key).find(path=>path.length>=8 && path[0].x===path.at(-1)!.x && path[0].y===path.at(-1)!.y):undefined)
  if(!landmarks || landmarks.confidence<.75 || contours.some(points=>!points || points.length<8))throw new Error('Brow contrast needs refined, closed contours for both eyebrows.')
  const base=document.createElement('canvas');base.width=image.width;base.height=image.height
  const source=base.getContext('2d',{willReadFrequently:true})!;source.drawImage(image,0,0)
  const luminance=(data:Uint8ClampedArray,index:number)=>.2126*data[index]+.7152*data[index+1]+.0722*data[index+2]
  const patches=contours.map(points=>{
    const xs=points!.map(p=>p.x*image.width),ys=points!.map(p=>p.y*image.height),pad=Math.max(3,(Math.max(...ys)-Math.min(...ys))*.5)
    const x=Math.max(0,Math.floor(Math.min(...xs)-pad)),y=Math.max(0,Math.floor(Math.min(...ys)-pad))
    const width=Math.min(image.width-x,Math.ceil(Math.max(...xs)+pad-x)),height=Math.min(image.height-y,Math.ceil(Math.max(...ys)+pad-y))
    const pixels=source.getImageData(x,y,width,height),values:number[]=[]
    for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i+3]>127)values.push(luminance(pixels.data,i))
    values.sort((a,b)=>a-b)
    const skin=values[Math.floor(values.length*.85)] ?? 0
    const mask=document.createElement('canvas');mask.width=width;mask.height=height
    const m=mask.getContext('2d')!;m.filter=`blur(${Math.max(.5,image.width*.00045)}px)`;m.fillStyle='#fff';m.beginPath()
    points!.forEach((p,i)=>i?m.lineTo(p.x*image.width-x,p.y*image.height-y):m.moveTo(p.x*image.width-x,p.y*image.height-y));m.closePath();m.fill()
    return {x,y,pixels,skin,mask:m.getImageData(0,0,width,height).data}
  })
  const bake=(exposure:number)=>{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
    const ctx=canvas.getContext('2d')!
    // Transparent patches preserve every pixel outside the detected brow hairs.
    for(const patch of patches){
      const output=ctx.createImageData(patch.pixels.width,patch.pixels.height),data=patch.pixels.data;output.data.set(data)
      for(let i=0;i<data.length;i+=4){
        const t=Math.max(0,Math.min(1,(patch.skin*.9-luminance(data,i))/Math.max(1,patch.skin*.6)))
        const hair=t*t*(3-2*t)*patch.mask[i+3]/255
        for(let channel=0;channel<3;channel++)output.data[i+channel]=data[i+channel]*exposure
        output.data[i+3]=data[i+3]*hair
      }
      const layer=document.createElement('canvas');layer.width=output.width;layer.height=output.height
      layer.getContext('2d')!.putImageData(output,0,0);ctx.drawImage(layer,patch.x,patch.y)
    }
    return canvas
  }
  const result={landmarks,dark:bake(.65),light:bake(1.4)};browEdits.set(image,result);return result
}

export function warpStudyOverlay(overlay: ReportOverlay, warp: PortraitWarp): ReportOverlay {
  if (warp.strengths.every(strength => Math.abs(strength) < .00001)) return overlay
  const point = (value: { x: number; y: number }) => {
    const moved = warpDestinationPoint({ x: value.x / overlay.size.width, y: value.y / overlay.size.height }, warp)
    return { x: moved.x * overlay.size.width, y: moved.y * overlay.size.height }
  }
  return { ...overlay, faceBoundary: overlay.faceBoundary?.map(point), dots: overlay.dots.map(dot => ({ ...dot, ...point(dot) })), measurement: overlay.measurement ? { ...overlay.measurement, anchors: Object.fromEntries(Object.entries(overlay.measurement.anchors).map(([key, value]) => [key, value ? point(value) : value])) } : undefined,
    primitives: overlay.primitives.filter(primitive => primitive.kind === 'polyline' || primitive.kind === 'point').map(primitive => primitive.kind === 'polyline' ? { ...primitive, pixelPoints: primitive.pixelPoints.map(point) } : { ...primitive, point: point(primitive.point) }) }
}

export function drawPhotoStudy(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, landmarks: FaceLandmarksPayload | null | undefined, study: PhotoStudy, timeMs: number, durationMs: number, reduced: boolean, effects: { lighting?: PortraitLighting; mask?: HTMLCanvasElement; overlay?: ReportOverlay | null; appearance?: PortraitEffects['overlay']; paint?: CanvasPainter; measuring?: boolean; cueMs?: number } = {}) {
  const browEdit=study.effect==='brow-contrast'?prepareBrowContrast(image,landmarks):undefined
  const gesture = photoStudyGesture(study, photoStudyRegions(landmarks, study.feature), timeMs, durationMs, reduced, landmarks, effects.cueMs)
  if (effects.measuring || !effects.lighting && gesture.warp.strengths.every(strength => Math.abs(strength) < .00001)) ctx.drawImage(image, 0, 0)
  else drawPortraitEffects(ctx, image, { lighting: effects.lighting, mask: effects.mask, landmarks, timeMs, reduced, warp: gesture.warp })
  if(!effects.measuring && gesture.contrast && browEdit) {
    const photo=gesture.contrast>0?browEdit.dark:browEdit.light
    ctx.save();ctx.globalAlpha*=Math.min(1,Math.abs(gesture.contrast)/.25)
    if(effects.lighting)drawPortraitEffects(ctx,photo,{lighting:effects.lighting,mask:effects.mask,landmarks,timeMs,reduced})
    else ctx.drawImage(photo,0,0)
    ctx.restore()
  }
  if (effects.overlay) (effects.paint ?? paintCanvasNode)(ctx, { id: 'overlay', label: 'Deforming feature outlines', frame: { x: 0, y: 0, width: image.width, height: image.height }, draw: ctx => {
    if (!effects.measuring) drawFaceTreatment(ctx, warpStudyOverlay(effects.overlay!, gesture.warp), image.width, timeMs, reduced, 1, { durationMs, appearance: effects.appearance })
  } })
  if (!gesture.opacity || effects.measuring) return
  const transform = ctx.getTransform(), unit = 1 / Math.max(.001, Math.hypot(transform.a, transform.b))
  ctx.save(); ctx.globalAlpha *= gesture.opacity
  ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = unit; ctx.setLineDash([3 * unit, 5 * unit])
  ctx.beginPath(); ctx.moveTo(gesture.grab.x * image.width, gesture.grab.y * image.height); ctx.lineTo(gesture.target.x * image.width, gesture.target.y * image.height); ctx.stroke(); ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(gesture.target.x * image.width, gesture.target.y * image.height, (gesture.pressed ? 10 : 7) * unit, 0, Math.PI * 2); ctx.stroke()
  ctx.translate(gesture.cursor.x * image.width, gesture.cursor.y * image.height); ctx.scale(unit, unit)
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 2
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 25); ctx.lineTo(7, 18); ctx.lineTo(12, 29); ctx.lineTo(17, 27); ctx.lineTo(12, 16); ctx.lineTo(22, 16); ctx.closePath()
  ctx.fillStyle = gesture.pressed ? '#dadde0' : '#fff'; ctx.strokeStyle = 'rgba(20,24,29,.85)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke(); ctx.restore()
}
