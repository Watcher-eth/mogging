import type { VideoScene } from './video-composition'

export const studyTimelineMotion = { delayMs: 160, durationMs: 1550 } as const

export function studyTimelineVariant(scene: VideoScene, chapter: number, variation: number) {
  return scene.studyMeasurement?.unit === '°' ? 4 : [0, 2, 5][(chapter + variation) % 3]
}
