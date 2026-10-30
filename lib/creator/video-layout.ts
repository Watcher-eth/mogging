import type { VideoScene } from './video-composition'

export const videoSize = { width: 1316, height: 2340 } as const
export const videoMotion = { cutMs: 300, portraitEnterMs: 420, styleWaveMs: 300, reportWaveMs: 260, reportWaveGapMs: 12000, reportWaveLimit: 2 } as const
export const videoContent = { inset: 120, width: videoSize.width - 240, captionTop: 400 } as const
export const portraitStage = { x: 0, y: videoContent.captionTop + 220, width: videoSize.width, height: videoSize.height - videoContent.captionTop - 320 } as const
export const captionDesign = { inset: videoContent.inset, width: videoContent.width, top: videoContent.captionTop - 40, bottomInset: 120, weight: 400, lineHeight: 1.16, focusMs: 420, inactiveOpacity: .5, inactiveBlur: .7 } as const
export type VideoFrame = { x: number; y: number; width: number; height: number }
export function hasCaption(scene: Pick<VideoScene, 'framing'> & { source?: Pick<VideoScene['source'], 'kind'> }) {
  if (scene.source?.kind === 'report' || scene.source?.kind === 'screen') return false
  return scene.framing === 'captioned' || scene.framing === 'device'
}
export function appReportFrame(_framing: VideoScene['framing']): VideoFrame {
  return { x: 0, y: 0, ...videoSize }
}
export function sceneFrame(scene: VideoScene, _localMs: number, _previous?: VideoFrame, _reduced = false): VideoFrame {
  return appReportFrame(scene.framing)
}
export const sharedElementMotion = (value: number) => { const amount = Math.max(0, Math.min(1, value)); return amount * amount * (3 - 2 * amount) }
export { smoothMotion } from './report-motion'
import { smoothMotion } from './report-motion'
export function elementEntrance(localMs: number, startMs = 0, durationMs = 700) {
  return smoothMotion((localMs - startMs) / durationMs)
}
export function featureStageLayout(region: { width: number; height: number }, _layout: VideoScene['layout'] = 'stacked', focus = '') {
  const scale = Math.min(videoContent.width / region.width, 420 / region.height)
  const width = region.width * scale, height = region.height * scale
  const metricY = 1700 + (420 - height) / 2
  return { face: { ...portraitStage, height: Math.min(portraitStage.height, videoSize.height - 120 - portraitStage.y, metricY + 400 - portraitStage.y) }, metric: { x: (videoSize.width - width) / 2, y: metricY, width, height } }
}

export function sharesPortrait(previous: VideoScene | undefined, next: VideoScene) {
  return Boolean(previous?.source.imageId && previous.source.imageId === next.source.imageId && ['portrait', 'component'].includes(previous.source.kind) && ['portrait', 'component'].includes(next.source.kind))
}

export function sharesReport(previous: VideoScene | undefined, next: VideoScene) {
  return previous?.source.kind === 'report' && next.source.kind === 'report' && previous.source.imageId === next.source.imageId && previous.source.categoryId === next.source.categoryId && previous.source.currentScore === next.source.currentScore && previous.source.potentialScore === next.source.potentialScore && previous.source.metricScore === next.source.metricScore && JSON.stringify(previous.source.report) === JSON.stringify(next.source.report)
}
