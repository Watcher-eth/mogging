import { pillMotion, portraitMetricText, type PillFrame } from './video-pill-morph'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import type { VideoScene } from './video-composition'
import type { PortraitActivity } from './portrait-program'
import { activeSpokenScores } from './spoken-score'
import { scriptVisualSeed } from './video-script'
import { warpDestinationPoint, type PortraitWarp } from './video-portrait-effects'

export type PortraitMetric = { label: string; value: number; unit: '/10' | '%' | '°' | '×'; basis: 'assessment' | 'image-plane' | 'illustration'; imageId: string }
export type CapturedPortraitMetric = { metric: PortraitMetric; chin: NormalizedPoint; opacity: number }
const category = (label: string) => /brow/i.test(label) ? 'brows' : /jaw|chin/i.test(label) ? 'jaw' : /cheek/i.test(label) ? 'cheeks' : /nose/i.test(label) ? 'nose' : /eye/i.test(label) ? 'eyes' : /lip|mouth/i.test(label) ? 'mouth' : /overall|whole/i.test(label) ? 'overall' : label
export const overlayPillEligible = (cue: string, guide: string, index = 0) => scriptVisualSeed(cue, guide, String(index)) % 3 === 0

// Ratios and angles describe the photographed plane. Never infer centimetres from pixels.
export function imagePlaneMetric(imageId: string, landmarks: FaceLandmarksPayload, guide: string, warp?: PortraitWarp): PortraitMetric | undefined {
  if (landmarks.confidence < .75 || Math.abs(landmarks.quality?.yawRadians ?? 0) > .3) return
  const { width, height } = landmarks.image, a = landmarks.anchors
  const moved = (p: NormalizedPoint) => { const q = warp ? warpDestinationPoint(p, warp) : p; return { x: q.x * width, y: q.y * height } }
  if (!a.leftPupil || !a.rightPupil) return
  const left = moved(a.leftPupil), right = moved(a.rightPupil), span = Math.hypot(right.x-left.x, right.y-left.y)
  if (span < width * .03) return
  const u = { x:(right.x-left.x)/span, y:(right.y-left.y)/span }, project = (p: NormalizedPoint) => { const q=moved(p); return q.x*u.x+q.y*u.y }
  const breadth = (points: NormalizedPoint[]) => Math.max(...points.map(project))-Math.min(...points.map(project))
  const basis = warp?.strengths.some(s => Math.abs(s) > .00001) ? 'illustration' : 'image-plane'
  if (/nose.*width/.test(guide) && a.leftCheek && a.rightCheek && (landmarks.contours?.noseBase?.length ?? 0) >= 4) {
    const face=breadth([a.leftCheek,a.rightCheek]); if(face > span) return {label:'Nose / face width',value:100*breadth(landmarks.contours?.noseBase!)/face,unit:'%',basis,imageId}
  }
  if (/taper|jaw.*width/.test(guide) && a.jawLeft && a.jawRight && a.leftCheek && a.rightCheek) {
    const face=breadth([a.leftCheek,a.rightCheek]); if(face > span) return {label:'Jaw / cheek width',value:100*breadth([a.jawLeft,a.jawRight])/face,unit:'%',basis,imageId}
  }
  if (/canthal|eye.*tilt/.test(guide)) {
    const eyes=[landmarks.contours?.leftEye,landmarks.contours?.rightEye]; if(eyes.some(eye=>!eye || eye.length<6)) return
    const angles=eyes.map((eye,index)=>{const sorted=[...eye!].sort((p,q)=>project(p)-project(q));const outer=moved(index ? sorted.at(-1)! : sorted[0]),inner=moved(index ? sorted[0] : sorted.at(-1)!);const dx=outer.x-inner.x,dy=outer.y-inner.y;return Math.atan2(dx*u.y-dy*u.x,Math.abs(dx*u.x+dy*u.y))*180/Math.PI})
    return {label:'Eye tilt',value:(angles[0]+angles[1])/2,unit:'°',basis,imageId}
  }
}

export function portraitMetricFor(scene: VideoScene, activity: PortraitActivity | undefined, landmarks: FaceLandmarksPayload | null | undefined, localMs: number, warp?: PortraitWarp): PortraitMetric | undefined {
  if (!activity || !landmarks || !scene.source.imageId || scene.source.kind !== 'portrait') return
  const feature=category(activity.feature ?? ''), edited=warp?.strengths.some(s=>Math.abs(s)>.00001) || scene.photoStudy?.effect === 'brow-contrast' || Boolean(scene.featureStudy?.edit)
  const report=scene.source.report, bound=report?.assessmentId && report.assessmentImageId===scene.source.imageId
  const spoken=activeSpokenScores(scene,localMs).find(score=>category(score.label)===feature)
  if (!edited && bound && spoken) return {label:spoken.label,value:spoken.value,unit:'/10',basis:'assessment',imageId:scene.source.imageId}
  if (!activity.guide || !overlayPillEligible(scene.source.imageId+':'+(scene.scriptRange?.cueId ?? scene.cueId),activity.guide,activity.index)) return
  let measured:PortraitMetric|undefined
  if(activity.guide==='profile:angle' && Math.abs(landmarks.quality?.yawRadians ?? 0)>.65) {
    const arms=activity.to.primitives.filter(p=>p.kind==='polyline' && ['profile-0','profile-1'].includes(p.id))
    if(arms.length===2 && arms.every(p=>p.kind==='polyline' && p.pixelPoints.length===2)) {
      const points=arms.map(p=>p.kind==='polyline'?p.pixelPoints:[]),[v,a]=points[0],[w,b]=points[1]
      const length=Math.hypot(a.x-v.x,a.y-v.y)*Math.hypot(b.x-w.x,b.y-w.y)
      if(length>0 && Math.hypot(v.x-w.x,v.y-w.y)<.01)measured={label:'Jaw angle',value:Math.acos(Math.max(-1,Math.min(1,((a.x-v.x)*(b.x-w.x)+(a.y-v.y)*(b.y-w.y))/length)))*180/Math.PI,unit:'°',basis:'image-plane',imageId:scene.source.imageId}
    }
  } else measured=imagePlaneMetric(scene.source.imageId,landmarks,activity.guide,warp)
  if (measured) return measured
  if (!edited && bound && category(report.id)===feature && !scene.scoreCallouts?.some(score=>category(score.label)===feature)) return {label:report.title,value:report.score,unit:'/10',basis:'assessment',imageId:scene.source.imageId}
}

export function capturePortraitMetric(ctx: CanvasRenderingContext2D, scene: VideoScene, activity: PortraitActivity, landmarks: FaceLandmarksPayload | null | undefined, localMs: number, width: number, height: number, warp?: PortraitWarp): CapturedPortraitMetric | undefined {
  const chin = landmarks?.anchors.chin
  if (!chin || !activity.to.primitives.length) return
  const metric = portraitMetricFor(scene, activity, landmarks, localMs, warp)
  if (!metric) return
  const point = warp ? warpDestinationPoint(chin, warp) : chin
  const {a, b, c, d, e, f} = ctx.getTransform()
  const x = point.x * width, y = point.y * height
  const progress = Math.min(1, activity.elapsedMs / 260)
  return { metric, chin: { x: a*x + c*y + e, y: b*x + d*y + f }, opacity: progress * progress * (3 - 2*progress) }
}

export function drawPortraitMetricPill(ctx: CanvasRenderingContext2D, captured: CapturedPortraitMetric, reduced = false, motion?: PillFrame) {
  const scale=ctx.canvas.width/1316,{metric,chin}=captured,height=pillMotion.height*scale,gap=16*scale
  if(chin.x<0 || chin.x>ctx.canvas.width || chin.y<ctx.canvas.height*.22 || chin.y+gap+height>ctx.canvas.height*.79)return
  ctx.save();ctx.setTransform(1,0,0,1,0,0)
  ctx.globalAlpha*=motion?motion.opacity:reduced?1:captured.opacity
  ctx.font=`500 ${pillMotion.fontSize*scale}px "Mogging Share", Arial, sans-serif`
  const text=portraitMetricText(metric),width=(motion?.width ?? ctx.measureText(text).width/scale+pillMotion.padding*2)*scale
  const x=Math.max(ctx.canvas.width*.07,Math.min(ctx.canvas.width*.9-width,chin.x-width/2)),y=chin.y+gap
  ctx.shadowColor='rgba(12,18,24,.1)';ctx.shadowBlur=14*scale;ctx.shadowOffsetY=3*scale
  ctx.fillStyle='rgba(255,255,255,.96)';ctx.strokeStyle='rgba(30,40,50,.1)';ctx.lineWidth=scale
  ctx.beginPath();ctx.roundRect(x,y,width,height,height/2);ctx.fill();ctx.shadowColor='transparent';ctx.stroke()
  ctx.clip();ctx.fillStyle='#171b1f';ctx.textBaseline='middle'
  if(motion){for(const glyph of motion.glyphs){if(glyph.opacity<.001)continue;ctx.save();ctx.globalAlpha*=glyph.opacity;ctx.filter=`blur(${(1-glyph.opacity)*1.2*scale}px)`;ctx.fillText(glyph.string,x+glyph.x*scale,y+height*.53+glyph.y*scale);ctx.restore()}}
  else ctx.fillText(text,x+pillMotion.padding*scale,y+height*.53)
  ctx.restore()
  return true
}
