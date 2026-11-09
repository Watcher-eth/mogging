import type { VideoScene } from './video-composition'
import type { SemanticBeat } from './video-semantics'
import type { DocumentaryLayout } from './video-documentary-editions'
import { sharedElementMotion } from './video-layout'

export type DocumentaryKind = NonNullable<VideoScene['documentary']>['kind']
export type DocumentaryShot = { scene: VideoScene; kind: DocumentaryKind; index: number; startMs: number; durationMs: number; beat: SemanticBeat; layout?: DocumentaryLayout; alternateView?: boolean }
export type DocumentaryCut = 'hard' | 'occlusion' | 'splice' | 'shutter' | 'rack'

const optical = (kind: DocumentaryKind) => kind === 'stage' || kind === 'inspection' || kind === 'conclusion'

export function sharesDocumentaryPortrait(previous: DocumentaryShot, next: DocumentaryShot) {
  const photoId = (shot: DocumentaryShot) => shot.alternateView ? shot.scene.source.secondaryImageId : shot.scene.source.imageId
  const hasPortrait = (shot: DocumentaryShot) => !shot.scene.photoStudy && !shot.scene.featureStudy &&
    !['comparison', 'anatomy', 'specimen', 'media'].includes(shot.kind) && (shot.kind !== 'blueprint' || Boolean(shot.layout))
  const id = photoId(previous)
  return Boolean(id && id === photoId(next) && hasPortrait(previous) && hasPortrait(next))
}

export function documentaryCut(previous: DocumentaryShot | undefined, next: DocumentaryShot): DocumentaryCut {
  if (!previous || next.kind === 'comparison' || next.kind === 'locator' || previous.kind === 'comparison') return 'hard'
  if (next.kind === 'registration' && previous.scene.source.imageId === next.scene.source.imageId) return 'rack'
  if (next.kind === 'contact' || previous.kind === 'contact') return 'shutter'
  if (next.kind === 'media' && previous.kind !== 'media') return 'splice'
  if (next.alternateView || previous.alternateView || previous.kind === 'media' || !optical(next.kind)) return 'hard'
  return next.kind === 'stage' || previous.kind === 'anatomy' ? 'occlusion' : 'hard'
}

export function documentaryMotion(local: number, duration: number, variant: number, index: number, reduced: boolean) {
  const progress = Math.max(0, Math.min(1, local / Math.max(1, duration)))
  const direction = (variant + index) % 2 ? -1 : 1
  const movement = (variant + index) % 3
  const eased = sharedElementMotion(progress)
  return {
    direction,
    camera: reduced ? 0 : (movement === 0 ? eased - .5 : movement === 1 ? Math.sin((progress - .5) * 1.75) : (Math.min(1, progress / .72) - .5) * .72) * direction,
    push: reduced ? 0 : movement === 1 ? eased : movement === 0 ? eased * .38 : 1 - (1 - progress) ** 3,
    enter: (delay: number, ms: number) => reduced ? Number(local >= delay) : sharedElementMotion((local - delay) / ms),
  }
}

export const documentaryCutMs: Record<DocumentaryCut, number> = { hard: 0, occlusion: 360, splice: 220, shutter: 180, rack: 470 }
