import { bindScriptScenes, scriptTokens, scriptVisualSeed, type VideoScript } from './video-script'
import type { VideoComposition, VideoScene } from './video-composition'
import { documentaryLayout, supportsDocumentaryLayout, type DocumentaryLayout } from './video-documentary-editions'
import { videoSize } from './video-layout'
import { decodeVisualBeat } from './video-semantics'
import { narratedNoseChange, type NoseChangeImage } from './video-nose-change'
import { spokenScoreCallouts } from './spoken-score'
import type { AnalysisPostInput } from './analysis-post'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { MediaAsset } from './media-asset'
import type { VoiceDirection } from './video-speech'

type Kind = NonNullable<VideoScene['documentary']>['kind']

const openings = ['stage', 'projection', 'contact', 'marquee'] as const
const measurementTreatments = ['specimen', 'relations', 'registration', 'blueprint', 'locator', 'ink', 'ledger'] as const
const editionRhythms = [[0, 0, 1, 1, 1], [0, 1, 0, 1, 1], [1, 0, 1, 0, 1], [1, 0, 0, 1, 1]] as const
export const documentaryVariationCount = openings.length * measurementTreatments.length

export function documentaryTreatment(beat: ReturnType<typeof decodeVisualBeat>, variation: number): Kind {
  if (/\b(?:skull|skeleton|bony orbit|bone underneath)\b/i.test(beat.quote) && !['edit', 'compare'].includes(beat.intent)) return 'anatomy'
  if (/\b(bridge|base|tip)\b/i.test(beat.quote) && beat.intent !== 'report') return 'relations'
  if (beat.intent === 'report') return 'inspection'
  if (beat.intent === 'measure' && beat.feature !== 'whole')
    return measurementTreatments[variation % measurementTreatments.length]
  if (beat.intent === 'context') return (['projection', 'dossier', 'contact'] as const)[variation % 3]
  if (beat.intent === 'lighting') return (['stage', 'inspection', 'ink'] as const)[variation % 3]
  if (beat.intent === 'views') return 'contact'
  if (beat.feature === 'whole') return 'projection'
  return (['inspection', 'registration', 'blueprint', 'projection', 'inspection'] as const)[variation % 5]
}

export function compileDocumentaryVideo(script: VideoScript, input: AnalysisPostInput, images: NoseChangeImage[], reports: ReportCategory[], voice: VoiceDirection, variation: number, durations: number[], media: MediaAsset[] = []): VideoComposition {
  if (!images.length) throw new Error('Add a portrait before creating a documentary')
  const before = images.find(image => image.comparison?.state === 'before' && script.cues[0].text.toLowerCase().includes(image.comparison.feature))
  const after = before && images.find(image => image.comparison?.state === 'after' && image.comparison.group === before.comparison!.group && image.comparison.feature === before.comparison!.feature)
  const opening = (scriptVisualSeed(input.subject, script.cues[0].text) + variation) % openings.length
  const rhythm = editionRhythms[variation % editionRhythms.length]
  const phase = Math.floor(variation / editionRhythms.length)
  let startMs = 0
  const lastUsed = new Map<DocumentaryLayout, number>()
  let lastKind: Kind | undefined
  const scenes: VideoScene[] = script.cues.map((cue, index) => {
    const text = cue.text, beat = decodeVisualBeat(text), feature = beat.feature, category = feature === 'whole' ? 'overall' : feature === 'lips' ? 'mouth' : feature
    const change = narratedNoseChange(images, cue, text)
    const comparison = change?.featureStudy
    const variant = scriptVisualSeed(cue.sourceId, text) % measurementTreatments.length + variation
    const angles = [...text.matchAll(/\b(?:three[- ]quarter|profile|side view|from the side)\b/gi)].map(match => ({
      view: /quarter/i.test(match[0]) ? 'three-quarter' as const : 'profile' as const,
      word: scriptTokens(text.slice(0, match.index)).length,
    }))
    const preferred = documentaryTreatment(beat, variant)
    const alternate = preferred === lastKind
      ? [1, 2, 3, 4, 5, 6].map(offset => documentaryTreatment(beat, variant + offset)).find(candidate => candidate !== lastKind)
      : undefined
    const treatment = comparison ? 'comparison' : change?.photoStudy ? 'inspection' : index === 0 ? openings[opening] : index === script.cues.length - 1 ? 'conclusion' : before && after && /\b(chang\w*|before|after|straighter)\b/i.test(text) && !/scores?/i.test(text) ? 'comparison' : angles.length ? 'contact' : alternate ?? preferred
    const findAngle = (view: 'front' | 'profile' | 'three-quarter') => view === 'front' ? undefined : images.find(image => {
      const yaw = Math.abs(image.landmarks?.quality?.yawRadians ?? 0)
      if (image.retouch) return false
      return view === 'profile'
        ? /(?:^|-)profile(?:-|$)/i.test(image.id) || yaw >= .65
        : /three-quarter/i.test(image.id) || yaw >= .22 && yaw < .65
    })
    const firstView = angles[0]?.view ?? beat.view
    const matchingView = findAngle(firstView)
    const assessedImage = !change && treatment !== 'comparison' && images.find(image =>
      spokenScoreCallouts(text, reports.filter(report => report.assessmentImageId === image.id), category)?.length)
    const imageId = comparison?.images[1] ?? (treatment === 'comparison' ? after!.id : change?.imageId ?? (assessedImage || matchingView || images[0]).id)
    const angleCut = !change && ['stage', 'inspection', 'contact'].includes(treatment) ? angles.flatMap(angle => {
      const photo = findAngle(angle.view)
      return angle.word > 3 && photo && photo.id !== imageId ? [{ ...angle, imageId: photo.id }] : []
    })[0] : undefined
    const secondaryImageId = comparison?.images[0] ?? (treatment === 'comparison' ? before!.id : angleCut?.imageId)
    const boundReports=reports.filter(report=>report.assessmentImageId===imageId)
    const scoreCallouts = !change && treatment !== 'comparison' ? spokenScoreCallouts(text, boundReports, category) : undefined
    const kind = scoreCallouts && !['stage', 'conclusion'].includes(treatment) ? (variation % 4 === 3 ? 'ledger' : 'inspection') : treatment
    const editionBeat = index === 0 || rhythm[(index - 1 + phase) % rhythm.length]
    const proposedLayout = editionBeat && !change?.photoStudy && supportsDocumentaryLayout(kind)
      ? documentaryLayout(beat, variation, index) : undefined
    const layout = proposedLayout && index - (lastUsed.get(proposedLayout) ?? -3) > 2 ? proposedLayout : undefined
    if (layout) lastUsed.set(layout, index)
    lastKind = layout ? undefined : kind
    const report=boundReports.find(report=>report.id===category) ?? boundReports[0]
    const durationMs = durations[index], begin = startMs; startMs += durationMs
    return {
      id: `documentary-${cue.id}`, cueId: cue.sourceId, label: cue.section?.title ?? `Scene ${index + 1}`,
      startMs: begin, durationMs, delivery: cue.delivery, narration: text, text, subtitle: '',
      source: { kind: 'portrait', imageId, secondaryImageId, categoryId: change?.categoryId ?? category, report, overlay: change || cue.section?.role === 'cta' ? 'none' : 'face-map', currentScore: 0, potentialScore: 0, metricScore: 0, hideScores: true },
      framing: 'full', layout: 'portrait', focus: 'hero', tracks: [],
      documentary: { kind, layout, label: index === 0 ? input.subject : cue.section?.title ?? `Scene ${index + 1}`, cutWord: angleCut?.word },
      scoreCallouts,
      ...(comparison ? { featureStudy: comparison } : {}),
      ...(change?.photoStudy ? { photoStudy: change.photoStudy } : {}),
    }
  })
  return { version: 1, title: `${input.subject} · Documentary Studio`, ...videoSize, fps: 30, durationMs: startMs, recipe: 'documentary-studio', style: 'brand', theme: 'light', variation: variation % 10000, voice, script, scenes: bindScriptScenes(script, scenes), ...(media.length ? { media } : {}) }
}
