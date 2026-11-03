import { bindScriptScenes, type VideoScript } from './video-script'
import type { VideoComposition, VideoScene } from './video-composition'
import { videoSize } from './video-layout'
import { planPortraitProgram } from './portrait-program'
import { decodeVisualBeat } from './video-semantics'
import { spokenScoreCallouts } from './spoken-score'
import type { GeneratorImage } from './content-generator'
import type { AnalysisPostInput } from './analysis-post'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { VoiceDirection } from './video-speech'

type DocumentaryImage = Pick<GeneratorImage, 'id'> & { comparison?: { group: string; state: 'before' | 'after'; feature: string } }

export function compileDocumentaryVideo(script: VideoScript, input: AnalysisPostInput, images: DocumentaryImage[], reports: ReportCategory[], voice: VoiceDirection, variation: number, durations: number[]): VideoComposition {
  if (!images.length) throw new Error('Add a portrait before creating a documentary')
  const before = images.find(image => image.comparison?.state === 'before' && script.cues[0].text.toLowerCase().includes(image.comparison.feature))
  const after = before && images.find(image => image.comparison?.state === 'after' && image.comparison.group === before.comparison!.group)
  let startMs = 0
  const scenes: VideoScene[] = script.cues.map((cue, index) => {
    const text = cue.text, feature = decodeVisualBeat(text).feature, category = feature === 'whole' ? 'overall' : feature === 'lips' ? 'mouth' : feature
    const kind = index === 0 ? 'stage' : index === script.cues.length - 1 ? 'conclusion' : before && after && /\b(chang\w*|before|after|straighter)\b/i.test(text) && !/scores?/i.test(text) ? 'comparison' : /\b(bridge|base|tip)\b/i.test(text) && !/scores?/i.test(text) ? 'relations' : 'inspection'
    const photo = kind === 'comparison' ? after! : images[0]
    const boundReports=reports.filter(report=>report.assessmentImageId===photo.id)
    const report=boundReports.find(report=>report.id===category) ?? boundReports[0]
    const durationMs = durations[index], begin = startMs; startMs += durationMs
    return {
      id: `documentary-${cue.id}`, cueId: cue.sourceId, label: cue.section?.title ?? `Scene ${index + 1}`,
      startMs: begin, durationMs, delivery: cue.delivery, narration: text, text, subtitle: '',
      source: { kind: 'portrait', imageId: photo.id, secondaryImageId: kind === 'comparison' ? before!.id : undefined, categoryId: category, report, overlay: cue.section?.role === 'cta' ? 'none' : 'face-map', currentScore: 0, potentialScore: 0, metricScore: 0, hideScores: true },
      framing: 'full', layout: 'portrait', focus: 'hero', tracks: [],
      documentary: { kind, label: index === 0 ? input.subject : cue.section?.title ?? `Scene ${index + 1}` },
      scoreCallouts: kind === 'inspection' ? spokenScoreCallouts(text, boundReports, category) : undefined,
      portraitProgram: planPortraitProgram(text, feature, 'documentary-studio', variation + index, 'front'),
    }
  })
  return { version: 1, title: `${input.subject} · Documentary Studio`, ...videoSize, fps: 30, durationMs: startMs, recipe: 'documentary-studio', style: 'brand', theme: 'dark', variation: variation % 10000, voice, script, scenes: bindScriptScenes(script, scenes) }
}
