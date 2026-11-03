import type { VideoScene } from './video-composition'

export const videoSize = { width: 1316, height: 2340 } as const
export const videoExportSize = { width: 1080, height: 1920 } as const
export const videoMotion = { cutMs: 300, portraitEnterMs: 420, styleWaveMs: 300, reportWaveMs: 260, reportWaveGapMs: 12000, reportWaveLimit: 2 } as const
const videoInset = 94.3
export const videoContent = { inset: videoInset, width: videoSize.width - 2 * videoInset, captionTop: 384, tickerTop: 88 } as const
export const portraitStage = { x: 0, y: videoContent.captionTop + 80, width: videoSize.width, height: videoSize.height - videoContent.captionTop - 80 } as const
export const captionDesign = { inset: videoContent.inset, width: videoContent.width, top: videoContent.captionTop - 78, weight: 400, lineHeight: 1.16, focusMs: 420, inactiveOpacity: .5, inactiveBlur: .7 } as const
export const videoContentSafeFrame = { x: 120, y: 600, width: 980, height: 1200 } as const
export const reportCaptionFrame = { x: 0, y: videoSize.height - 520, width: videoSize.width, height: 190 } as const
export const scorePresentation = { top: 1810, width: 890, rowHeight: 104 } as const
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
// The shared surface moves through the full boundary. Supporting elements
// finish their exit before the scene swaps, then arrive in reading order.
export function sharedElementEntrance(progress: number, outgoing: boolean, order: number) {
  const delay = Math.min(3, Math.max(0, order)) * .045
  if (outgoing) {
    const t = Math.max(0, Math.min(1, (progress - delay) / .34))
    return { opacity: 1 - t * t, y: -8 * t * t }
  }
  const t = Math.max(0, Math.min(1, (progress - .5 - delay) / .34))
  const settled = 1 - (1 - t) ** 3
  return { opacity: settled, y: 12 * (1 - settled) }
}

export function featureStageLayout(region: { width: number; height: number }, _layout: VideoScene['layout'] = 'stacked', focus = '') {
  const scale = Math.min(900 / region.width, 360 / region.height)
  const width = region.width * scale, height = region.height * scale
  const metricY = 1460 + (360 - height) / 2
  return { face: { ...portraitStage, height: Math.min(portraitStage.height, videoSize.height - 120 - portraitStage.y, metricY - 60 - portraitStage.y) }, metric: { x: (videoSize.width - width) / 2, y: metricY, width, height } }
}

export function sharesPortrait(previous: VideoScene | undefined, next: VideoScene) {
  return Boolean(previous?.source.imageId && previous.source.imageId === next.source.imageId && ['portrait', 'component'].includes(previous.source.kind) && ['portrait', 'component'].includes(next.source.kind))
}

export function sharesReport(previous: VideoScene | undefined, next: VideoScene) {
  return previous?.source.kind === 'report' && next.source.kind === 'report' && previous.source.imageId === next.source.imageId && previous.source.categoryId === next.source.categoryId && previous.source.currentScore === next.source.currentScore && previous.source.potentialScore === next.source.potentialScore && previous.source.metricScore === next.source.metricScore && JSON.stringify(previous.source.report) === JSON.stringify(next.source.report)
}
