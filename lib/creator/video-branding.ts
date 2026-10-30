import type { CanvasPlacement, CanvasRect } from './canvas-layout'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { VideoComposition, VideoScene } from './video-composition'
import { smoothMotion } from './report-motion'
import { videoSize } from './video-layout'

// Conservative content area checked in TikTok Studio's Feed preview. The live
// interface varies with device, caption length and anchors; this is not an ad template.
export const videoBrandSafeArea = { x: 120, y: 660, width: videoSize.width - 240, height: 1180 } as const
export type BrandObstacle = CanvasRect & { weight: number }
export function isVideoInvitation(cue?: { text: string; section?: { role: string } }) {
  return Boolean(cue && (cue.section?.role === 'cta' || cue.section?.role === 'product' && /\bmogging(?:\.com)?\b/i.test(cue.text) && /if you want|go to|try|use|get your/i.test(cue.text)))
}
export function isVideoCta(composition: VideoComposition, scene: VideoScene) {
  return isVideoInvitation(composition.script?.cues.find(cue => cue.id === scene.scriptRange?.cueId)) || scene.focus === 'action-plan'
}

export function brandFaceObstacles(landmarks: FaceLandmarksPayload | null | undefined, placement?: CanvasPlacement): BrandObstacle[] {
  if (!landmarks || !placement || landmarks.confidence < .58) return []
  const result: BrandObstacle[] = []
  for (const [keys, padding, weight] of [
    [['forehead','chin','jawLeft','jawRight'], 30, 5],
    [['leftEyeOuter','rightEyeOuter','leftPupil','rightPupil'], 75, 100],
    [['mouthLeft','mouthRight','upperLip','lowerLip','mouthCenter'], 65, 100],
  ] as const) {
    const points = keys.flatMap(key => { const point = landmarks.anchors[key as keyof typeof landmarks.anchors]; return point ? [{ x: placement.e + placement.a * point.x + placement.c * point.y, y: placement.f + placement.b * point.x + placement.d * point.y }] : [] })
    if (points.length < 2) continue
    const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y))
    const topPadding = weight === 5 ? Math.max(padding, (Math.max(...points.map(point => point.y)) - top) * .45) : padding
    result.push({ x: left-padding, y: top-topPadding, width: Math.max(...points.map(point => point.x))-left+padding*2, height: Math.max(...points.map(point => point.y))-top+padding+topPadding, weight })
  }
  return result
}
const overlap = (a: CanvasRect, b: CanvasRect) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
export function videoBrandFrame(cta: boolean, obstacles: BrandObstacle[] = []): CanvasRect {
  const width = cta ? 690 : 160, height = cta ? 100 : 36
  const x = cta ? (videoSize.width-width)/2 : videoBrandSafeArea.x
  const top = videoBrandSafeArea.y, bottom = top+videoBrandSafeArea.height-height
  const preferred = cta ? 1650 : top
  let best = { x, y: top, width, height }, cost = Infinity
  for (let y=top; y<=bottom; y+=24) {
    const frame = { x,y,width,height }
    const next = obstacles.reduce((sum, obstacle) => sum+overlap(frame,obstacle)/(width*height)*obstacle.weight,0) + Math.abs(y-preferred)/videoSize.height
    if (next<cost) { cost=next; best=frame }
  }
  return best
}

// A composition clock keeps the ticker continuous across scene cuts.
export function videoTickerMotion(timeMs: number, reduced = false) {
  if (timeMs < 8000) return null
  const local = (timeMs - 8000) % 9000
  const entrance = 420, hold = 2500, exit = 420
  if (local >= (reduced ? hold : entrance + hold + exit)) return null
  const visible = reduced ? 1 : smoothMotion(local / entrance) * (1 - smoothMotion((local - entrance - hold) / exit))
  return { opacity: visible, offset: reduced ? 0 : (visible - 1) * 18, blur: reduced ? 0 : (1 - visible) * 4 }
}
