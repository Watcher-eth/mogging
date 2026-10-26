import type { VideoScene } from './video-composition'

export const videoSize = { width: 1080, height: 1920 } as const
export type VideoFrame = { x: number; y: number; width: number; height: number }
export function subjectAboveComponent(subject: VideoFrame, component: VideoFrame): VideoFrame {
  return { ...subject, height: Math.min(subject.height, Math.max(0, component.y - subject.y - 48)) }
}
export function hasCaption(scene: Pick<VideoScene, 'framing'> & { source?: Pick<VideoScene['source'], 'kind'> }) {
  if (scene.source?.kind === 'report' || scene.source?.kind === 'screen') return false
  return scene.framing === 'captioned' || scene.framing === 'device'
}
export function appReportFrame(_framing: VideoScene['framing']): VideoFrame {
  return { x: 0, y: 0, width: 1080, height: 1920 }
}
export function sceneFrame(scene: VideoScene, _localMs: number, _previous?: VideoFrame, _reduced = false): VideoFrame {
  return appReportFrame(scene.framing)
}
export const smoothMotion = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10) }
export function elementEntrance(localMs: number, startMs = 0, durationMs = 700) {
  return smoothMotion((localMs - startMs) / durationMs)
}
export function featureHandoff(progress: number) {
  return { outgoing: 1 - elementEntrance(progress, 0, .48), incoming: elementEntrance(progress, .52, .48) }
}
export function featureStageLayout(region: { width: number; height: number }) {
  const scale = Math.min(992 / region.width, 410 / region.height)
  const width = region.width * scale, height = region.height * scale
  return { face: { x: 40, y: 290, width: 1000, height: 1050 }, metric: { x: (1080 - width) / 2, y: 1390 + (410 - height) / 2, width, height } }
}
