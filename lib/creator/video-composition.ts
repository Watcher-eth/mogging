import { portraitInstrumentSchema } from './portrait-instruments'
import { decodeVisualBeat } from './video-semantics'
import { portraitProgramSchema, planPortraitProgram } from './portrait-program'
import { featureStudySchema } from './feature-study'
import { narratedFaceMetric } from './face-metric-guides'
import { videoSize, videoMotion, sharesPortrait, sharesReport } from './video-layout'
import { z } from 'zod'
import { glassOverlaySchema, portraitLightingSchema, portraitEffectsSchema } from './video-portrait-effects'
import { photoStudySchema } from './video-photo-study'
import { profileStudySchema } from './video-profile'
import { editorialStudyMotion, editorialStudySchema } from './video-editorial-study'
import { deliverySchema, voiceDirectionSchema } from './video-speech'
import { scriptVisualSeed, type VideoScript, bindScriptScenes, createVideoScript, scriptRevision, normalizedScriptWord, recordingSchema, scriptRangeSchema, scriptSchema, scriptTokens, scriptWords } from './video-script'
import { motionPrimitives, primitiveDefinition, type MotionPrimitiveId } from './motion-primitives'
import type { AnalysisPostInput, AnalysisPostPlan } from './analysis-post'
import { reportFeatureSchema, type ReportCategory } from './mobile-overlay-engine/report-data'
import { buildMockOverallCategory } from './mock-report-data'
import { planScriptShots, shortHeading } from './script-edit'
import { explainerGraphicSchema, reportScoreGrid, scriptGraphic, stableInstrumentGrid } from './video-explainer'

export const videoRecipes = {
  'report-led': 'App-led analysis',
  'portrait-audit': 'Portrait feature audit',
  'measurement-explainer': 'Measurement explainer',
  'minimal-explainer': 'Minimal kinetic explainer',
  'hybrid-story': 'Explainer + app proof',
  'feature-study': 'Focused feature study',
} as const
export type VideoRecipe = keyof typeof videoRecipes

export const videoStyles = {
  creator: { label: 'Creator editorial', description: 'Light app-led edit, crisp cuts, feature-card expansions and clean typography.', accent: '#008dc9', text: 'rise-in' as MotionPrimitiveId, camera: 'slow-push' as MotionPrimitiveId },
  diagnostic: { label: 'Feature breakdown', description: 'Precise app scrolling, native metric cards and matched feature cutaways.', accent: '#008dc9', text: 'rise-in' as MotionPrimitiveId, camera: 'punch-in' as MotionPrimitiveId },
  brand: { label: 'Mogging editorial', description: 'White surfaces, blue-to-mint UI highlights and continuous screen transitions.', accent: '#00a8ef', text: 'rise-in' as MotionPrimitiveId, camera: 'slow-push' as MotionPrimitiveId },
} as const
export type VideoStyleId = keyof typeof videoStyles
export const trackTargets = ['camera', 'content', 'text', 'overlay', 'decoration', 'report', 'element'] as const
export type TrackTarget = (typeof trackTargets)[number]
export const anchorSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()
const primitiveSchema = z.custom<MotionPrimitiveId>(value => typeof value === 'string' && motionPrimitives.some(item => item.id === value), 'Unknown motion primitive')
export const motionTrackSchema = z.object({
  id: z.string().min(1).max(100), primitive: primitiveSchema, target: z.enum(trackTargets),
  startMs: z.number().finite().min(0), durationMs: z.number().finite().min(1).max(180000),
  intensity: z.number().finite().min(0).max(3).default(1),
  anchor: anchorSchema.default({ x: .5, y: .5 }),
  from: anchorSchema.optional(), to: anchorSchema.optional(),
  section: z.string().max(160).optional(), fromScroll: z.number().finite().min(0).max(20000).optional(), toScroll: z.number().finite().min(0).max(20000).optional(),
  wordIndex: z.number().int().min(0).max(5000).optional(),
  wordId: z.string().max(140).optional(),
  elementId: z.string().min(1).max(240).optional(),
}).strict()
export type MotionTrack = z.infer<typeof motionTrackSchema>

export const spokenWordSchema = z.object({ text: z.string().min(1).max(200), startMs: z.number().finite().min(0), endMs: z.number().finite().min(0), wordId: z.string().max(140).optional() }).strict()

const reportSchema = z.object({
  assessmentId: z.string().optional(),
  id: z.string().max(80), title: z.string().max(120), subtitle: z.string().max(300), scoreLabel: z.string().max(120), score: z.number().min(0).max(10),
  explanation: z.string().max(5000), recommendation: z.string().max(5000), eyeColor: z.string().max(30).optional(), hairColor: z.string().max(30).optional(),
  features: z.array(reportFeatureSchema).max(100),
}).strict()

export const videoSceneSchema = z.object({
  id: z.string().min(1).max(100), label: z.string().max(120), startMs: z.number().finite().min(0), durationMs: z.number().finite().min(100).max(180000),
  source: z.object({ potentialScale: z.union([z.literal(8),z.literal(10)]).optional(), potentialCurrentScore: z.number().finite().min(0).max(10).optional(), hidePotential: z.boolean().optional(), hideScores: z.boolean().optional(), kind: z.enum(['portrait', 'report', 'component', 'title', 'screen', 'explainer']), imageId: z.string().max(100).nullable(), secondaryImageId: z.string().max(100).nullable().optional(), categoryId: z.string().max(80), overlay: z.enum(['none', 'category', 'face-map']), currentScore: z.number().finite().min(0).max(10), potentialScore: z.number().finite().min(0).max(10), metricScore: z.number().finite().min(0).max(10), report: reportSchema.optional(), captureInsets: z.object({ top: z.number().min(0).max(.2), bottom: z.number().min(0).max(.2) }).strict().optional() }).strict(),
  customSlideId: z.string().max(80).optional(),
  text: z.string().max(240), subtitle: z.string().max(500), narration: z.string().max(5000).default(''), cueId: z.string().max(160).default(''), focus: z.string().max(160).default('scores'),
  framing: z.enum(['full', 'captioned', 'device', 'detail']).default('full'), tracks: z.array(motionTrackSchema).max(30),
  layout: z.enum(['stacked', 'split', 'portrait']).default('stacked'),
  words: z.array(spokenWordSchema).max(5000).optional(),
  scoreCallouts: z.array(z.object({ label: z.string().max(120), value: z.number().min(0).max(10), word: z.number().int().min(0) }).strict()).max(6).optional(),
  graphic: explainerGraphicSchema.optional(),
  photoStudy: photoStudySchema.optional(),
  featureStudy: featureStudySchema.optional(),
  portraitProgram: portraitProgramSchema.optional(),
  portraitFX: portraitEffectsSchema.optional(),
  profileStudy: profileStudySchema.optional(),
  editorial: z.enum(['context', 'detail', 'compare']).optional(),
  study: editorialStudySchema.optional(),
  delivery: deliverySchema.optional(),
  scriptRange: scriptRangeSchema.optional(),
}).strict()
export type VideoScene = z.infer<typeof videoSceneSchema>
export function videoImageIds(scenes: VideoScene[]) {
  return new Set(scenes.flatMap(scene => [scene.source.imageId, scene.source.secondaryImageId, ...(scene.study?.references.map(reference => reference.imageId) ?? []), ...(scene.featureStudy?.images ?? [])]).filter((id): id is string => Boolean(id)))
}
export type VideoDirection = { scoreCallouts?: VideoScene['scoreCallouts']; kind: 'portrait' | 'explainer' | 'report' | 'component'; imageId?: string; categoryId?: string; graphic?: VideoScene['graphic']; photoStudy?: VideoScene['photoStudy']; portraitFX?: VideoScene['portraitFX']; profileStudy?: VideoScene['profileStudy']; editorial?: VideoScene['editorial']; study?: VideoScene['study']; featureStudy?: VideoScene['featureStudy']; portraitProgram?: VideoScene['portraitProgram']; delivery?: VideoScene['delivery']; focus?: string; emphasis?: 'section-lift' | 'section-expand' | 'border-beam' }

export const compositionSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(160), disclosure: z.string().max(240).optional(), width: z.preprocess(width => width === 1080 ? videoSize.width : width, z.literal(videoSize.width)), height: z.preprocess(height => height === 1920 ? videoSize.height : height, z.literal(videoSize.height)), fps: z.literal(30),
  style: z.enum(['creator', 'diagnostic', 'brand']), theme: z.enum(['light', 'dark']).default('light'), durationMs: z.number().finite().min(100).max(180000), scenes: z.array(videoSceneSchema).min(1).max(250),
  recipe: z.enum(['report-led', 'portrait-audit', 'measurement-explainer', 'minimal-explainer', 'hybrid-story', 'feature-study']).default('report-led'), variation: z.number().int().min(0).max(9999).default(0),
  voice: voiceDirectionSchema.optional(), timing: z.enum(['estimated', 'segments', 'words']).optional(),
  script: scriptSchema.optional(), recording: recordingSchema.optional(),
}).strict().superRefine((composition, ctx) => {
  let end = 0
  const sceneIds = new Set<string>()
  for (const [index, scene] of composition.scenes.entries()) {
    if (scene.featureStudy && (scene.source.kind !== 'portrait' || scene.study || scene.photoStudy || scene.profileStudy || scene.portraitFX?.print || scene.portraitFX?.lighting || scene.portraitFX?.overlay)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'featureStudy'], message: 'Feature studies own their portrait treatment.' })
    if (scene.study && (scene.source.kind !== 'portrait' || scene.photoStudy)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'study'], message: 'Editorial studies need an unmodified portrait source.' })
    if (scene.portraitFX && scene.source.kind !== 'portrait') ctx.addIssue({ code: 'custom', path: ['scenes', index, 'portraitFX'], message: 'Portrait effects belong only to portrait scenes.' })
    if (scene.photoStudy && scene.source.kind !== 'portrait') ctx.addIssue({ code: 'custom', path: ['scenes', index, 'photoStudy'], message: 'Illustrative image variations belong only to portrait scenes, never report measurements.' })
    if (scene.portraitProgram && scene.source.kind !== 'portrait') ctx.addIssue({ code: 'custom', path: ['scenes', index, 'portraitProgram'], message: 'Portrait programs belong only to photographic portrait scenes.' })
    if (scene.portraitProgram?.actions.some(action => action.word >= scriptTokens(scene.narration).length || action.labelWord !== undefined && action.labelWord >= scriptTokens(scene.narration).length)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'portraitProgram'], message: 'Visual actions must address words in their original scene.' })
    if (scene.profileStudy && (scene.source.kind !== 'portrait' || scene.photoStudy)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'profileStudy'], message: 'Profile annotations need an unmodified portrait scene.' })
    if (scene.source.kind === 'explainer' && !scene.graphic) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'graphic'], message: 'Explainer scenes need a graphic layout' })
    if (sceneIds.has(scene.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'id'], message: 'Scene IDs must be unique' })
    sceneIds.add(scene.id)
    let wordEnd = 0
    for (const word of scene.words ?? []) {
      if (word.startMs < wordEnd || word.endMs <= word.startMs || word.endMs > scene.durationMs) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'words'], message: 'Spoken words must be ordered and fit within their scene' })
      wordEnd = word.endMs
    }
    if (Math.abs(scene.startMs - end) > .01) ctx.addIssue({ code: 'custom', path: ['scenes', index], message: 'Scenes must form a contiguous timeline' })
    end = scene.startMs + scene.durationMs
    const ids = new Set<string>()
    for (const [trackIndex, track] of scene.tracks.entries()) {
      if (ids.has(track.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Track IDs must be unique in a scene' })
      ids.add(track.id)
      if (track.target === 'element' && !track.elementId) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Choose a canvas component for this track' })
      if (scene.words && track.wordIndex !== undefined && track.wordIndex >= scene.words.length) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex, 'wordIndex'], message: 'Spoken cue must reference a word in this scene' })
      if (scene.words && track.wordId) {
        const word = scene.words.find(word => word.wordId === track.wordId)
        if (!word || Math.abs(word.startMs - track.startMs) > .01) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex, 'wordId'], message: 'Spoken motion must use the same recorded word clock as captions' })
      }
      if (track.startMs + track.durationMs > scene.durationMs + .01) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Track extends beyond the scene' })
      if (!allowedPrimitives(track.target).some(item => item.id === track.primitive)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Primitive is incompatible with its target' })
    }
  }
  if (Math.abs(end - composition.durationMs) > .01) ctx.addIssue({ code: 'custom', path: ['durationMs'], message: 'Duration must match the timeline' })
  if (composition.script) {
    const expected = scriptWords(composition.script), projected: string[] = []
    for (const [index, scene] of composition.scenes.entries()) {
      const range = scene.scriptRange, cue = composition.script.cues.find(cue => cue.id === range?.cueId)
      const words = cue && range ? scriptTokens(cue.text).slice(range.startWord, range.startWord + range.wordCount) : []
      if (!range || !cue || cue.text.slice(range.startChar, range.endChar) !== scene.narration.replace(/\s+/g, ' ').trim() || normalizedScriptWord(words.map(word => word.text).join(' ')) !== normalizedScriptWord(scene.narration)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'scriptRange'], message: 'Scene narration must project its original script words; edit and recut the script instead' })
      if (cue && JSON.stringify(scene.delivery) !== JSON.stringify(cue.delivery)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'delivery'], message: 'Scene delivery must project its original script cue' })
      if (range && cue) projected.push(...words.map((_, offset) => `${cue.id}/word:${range.startWord + offset}`))
    }
    if (expected.map(word => word.id).join('|') !== projected.join('|')) ctx.addIssue({ code: 'custom', path: ['script'], message: 'Scenes must cover the original script once, in script order' })
    if (composition.recording) {
      const recording = composition.recording
      if (recording.scriptRevision !== composition.script.revision || recording.words.map(word => word.wordId).join('|') !== expected.map(word => word.id).join('|')) ctx.addIssue({ code: 'custom', path: ['recording'], message: 'Recording belongs to a different script revision or word sequence' })
      let previous = 0
      for (const word of recording.words) {
        if (word.startMs < previous || word.endMs <= word.startMs || word.endMs > composition.durationMs) ctx.addIssue({ code: 'custom', path: ['recording'], message: 'Recorded words must be ordered within the audio duration' })
        previous = word.endMs
      }
      const projected = composition.scenes.flatMap(scene => (scene.words ?? []).map(word => ({ wordId: word.wordId, startMs: scene.startMs + word.startMs, endMs: scene.startMs + word.endMs })))
      if (projected.length !== recording.words.length || projected.some((word, index) => word.wordId !== recording.words[index]?.wordId || Math.abs(word.startMs - recording.words[index].startMs) > .01 || Math.abs(word.endMs - recording.words[index].endMs) > .01)) ctx.addIssue({ code: 'custom', path: ['recording'], message: 'Caption timing must project the same recorded word clock' })
    }
  } else if (composition.recording) ctx.addIssue({ code: 'custom', path: ['script'], message: 'A recording needs its original script' })
})
export type VideoComposition = z.infer<typeof compositionSchema>

export function allowedPrimitives(target: TrackTarget) {
  if (target === 'element') return motionPrimitives.filter(item => ['entry', 'exit'].includes(item.category) || ['punch-in', 'slow-push', 'pull-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'snap-reframe', 'focus-rack', 'section-expand', 'gradient-outline', 'section-spotlight', 'border-beam', 'section-lift'].includes(item.id))
  const categories: Record<Exclude<TrackTarget, 'element'>, string[]> = { camera: ['camera'], content: ['transition', 'entry', 'exit'], text: ['text', 'entry', 'exit'], overlay: ['overlay', 'entry', 'exit'], decoration: ['cursor', 'cinematic'], report: ['report'] }
  return motionPrimitives.filter(item => categories[target].includes(item.category))
}

export function parseComposition(value: unknown): VideoComposition {
  const composition = compositionSchema.parse(value)
  const first = composition.scenes[0]
  first.framing = ['portrait', 'component'].includes(first.source.kind) || composition.recipe === 'portrait-audit' ? 'captioned' : 'full'
  first.tracks = first.tracks.filter(track => track.primitive !== 'component-focus')
  let previousGraphic: VideoScene['graphic']
  for (const scene of composition.scenes) {
    if (scene.graphic) scene.graphic = stableInstrumentGrid(scene.graphic, previousGraphic)
    previousGraphic = scene.source.kind === 'explainer' ? scene.graphic : undefined
    scene.tracks = scene.tracks.filter(track => track.primitive !== 'border-beam' || !['scores', 'potential', 'category-score', 'hero', 'current-score', 'overall', 'overall-score'].includes(track.elementId ?? track.section ?? scene.focus))
    if (scene.layout === 'split') scene.layout = 'stacked'
    if (scene.source.kind === 'report' || scene.source.kind === 'screen') scene.framing = 'full'
    else if (scene !== first) scene.framing = 'captioned'
  }
  return composition
}

export function activeScene(composition: VideoComposition, timeMs: number) {
  const time = Math.max(0, Math.min(composition.durationMs - .001, timeMs))
  return composition.scenes.find(scene => time >= scene.startMs && time < scene.startMs + scene.durationMs) ?? composition.scenes[0]
}

export function ensureEarlyAppProof(composition: VideoComposition, imageId = composition.scenes.find(scene => scene.source.imageId)?.source.imageId): VideoComposition {
  if (composition.script?.cues.every(cue => cue.section) || composition.durationMs < 10000 || !imageId) return composition
  const visible = (scene: VideoScene) => Math.min(10000, scene.startMs + scene.durationMs) - scene.startMs - 600 >= 2000
  if (composition.scenes.some(scene => ['report', 'screen'].includes(scene.source.kind) && visible(scene))) return composition
  const candidates = composition.scenes.filter(scene => (scene.source.imageId || imageId) && visible(scene))
  const editorial = candidates.filter(scene => scene.graphic?.layout !== 'dashboard')
  const candidate = editorial.find(scene => scene.startMs >= 2000) ?? editorial[0] ?? candidates.find(scene => scene.startMs >= 2000) ?? candidates[0]
  const selection = candidate ? [candidate] : composition.scenes.filter(scene => scene.startMs < 2600)
  const report = selection[0].source.report ?? buildMockOverallCategory(String(selection[0].source.currentScore), {})
  return { ...composition, scenes: composition.scenes.map(scene => {
    if (!selection.includes(scene)) return scene
    const startMs = scene.words?.[0]?.startMs ?? 0
    const wordId = scene.words?.[0]?.wordId ?? (scene.scriptRange ? `${scene.scriptRange.cueId}/word:${scene.scriptRange.startWord}` : undefined)
    const track = { ...createMotionTrack('scroll-to-section', 'report', scene.durationMs), section: 'scores', startMs, durationMs: Math.min(1400, scene.durationMs - startMs), wordIndex: 0, wordId }
    return { ...scene, label: 'Report · Early app proof', source: { ...scene.source, imageId, categoryId: report.id, report, kind: 'report', overlay: 'none' }, focus: 'scores', framing: 'full', graphic: undefined, profileStudy: undefined, photoStudy: undefined, portraitProgram: undefined, portraitFX: undefined, editorial: undefined, study: undefined, tracks: [createMotionTrack(candidate && scene.startMs ? 'focus-cut' : 'hard-cut', 'content', Math.min(videoMotion.cutMs, scene.durationMs)), ...scene.tracks.filter(track => track.target === 'text'), track] }
  }) }
}

export function choreographVideoTransitions(composition: VideoComposition): VideoComposition {
  let lastRippleMs = -Infinity, rippleCount = 0
  return { ...composition, scenes: composition.scenes.map((scene, index) => {
    const previous = composition.scenes[index - 1]
    if (!previous) return scene
    if (previous.source.kind === 'report' && scene.source.kind === 'report') {
      const continuous = sharesReport(previous, scene)
      return { ...scene, tracks: scene.tracks.map(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition' ? { ...track, primitive: continuous ? 'hard-cut' : 'crossfade', durationMs: Math.min(180, scene.durationMs * .25) } : track) }
    }
    const reportBoundary = (previous.source.kind === 'report') !== (scene.source.kind === 'report')
    const continuousFace = sharesPortrait(previous, scene)
    if (!reportBoundary && !continuousFace) return scene
    const ripple = reportBoundary && scene.source.kind === 'report' && rippleCount < videoMotion.reportWaveLimit && scene.startMs - lastRippleMs >= videoMotion.reportWaveGapMs
    if (ripple) { lastRippleMs = scene.startMs; rippleCount++ }
    const primitive = ripple ? 'liquid-ripple' : reportBoundary ? 'crossfade' : 'cinematic-flow'
    const durationMs = ripple ? videoMotion.reportWaveMs : reportBoundary ? 180 : videoMotion.portraitEnterMs
    return { ...scene, tracks: scene.tracks.map(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition'
      ? { ...track, primitive, durationMs: Math.min(durationMs, scene.durationMs * .25) } : track) }
  }) }
}

export function arrangeVideoScenes(composition: VideoComposition, scenes: VideoScene[]) {
  let startMs = 0
  const originalCues = new Map(composition.script?.cues.filter(cue => cue.section).map(cue => [cue.id, cue]))
  const groups: VideoScene[][] = []
  for (const scene of scenes) {
    const previous = groups.at(-1)
    if (previous && previous[0].scriptRange?.cueId === scene.scriptRange?.cueId) previous.push(scene)
    else groups.push([scene])
  }
  const keepSections = originalCues.size > 0 && new Set(groups.map(group => group[0].scriptRange?.cueId)).size === groups.length && groups.every(group => {
    const cue = originalCues.get(group[0].scriptRange?.cueId ?? '')
    return cue?.section && cue.text === group.map(scene => scene.narration).join(' ')
  })
  const arranged = scenes.map((scene, index) => { const next = { ...scene, cueId: keepSections ? originalCues.get(scene.scriptRange!.cueId)!.sourceId : `script-${index}`, startMs, words: undefined, tracks: scene.tracks.map(track => ({ ...track, wordId: undefined })) }; startMs += scene.durationMs; return next })
  const script = keepSections ? { ...composition.script!, cues: groups.map(group => originalCues.get(group[0].scriptRange!.cueId)!) } : createVideoScript(arranged.map(scene => ({ id: scene.cueId, narration: scene.narration, delivery: scene.delivery })))
  script.revision = scriptRevision(script.cues)
  script.references = composition.script?.references
  return parseComposition({ ...composition, script, recording: undefined, timing: 'estimated', scenes: bindScriptScenes(script, arranged), durationMs: startMs })
}

export function retimeVideoScene(scene: VideoScene, durationMs: number): VideoScene {
  const ratio = durationMs / scene.durationMs
  return { ...scene, durationMs, words: scene.words?.map(word => ({ ...word, startMs: word.startMs * ratio, endMs: word.endMs * ratio })), tracks: scene.tracks.map(track => ({ ...track, startMs: track.startMs * ratio, durationMs: track.durationMs * ratio })) }
}

export function createMotionTrack(primitive: MotionPrimitiveId, target: TrackTarget, sceneDuration: number): MotionTrack {
  const definition = primitiveDefinition(primitive)
  return { id: `${target}-${primitive}`, primitive, target, startMs: definition.category === 'exit' ? Math.max(0, sceneDuration - definition.durationMs) : 0, durationMs: Math.min(definition.durationMs, sceneDuration), intensity: 1, anchor: { x: .5, y: .5 } }
}

export function compileAnalysisVideo(plan: AnalysisPostPlan, input: AnalysisPostInput, imageIds: string[], style: VideoStyleId, reports: ReportCategory[], options: { recipe?: VideoRecipe; variation?: number; directions?: Record<string, VideoDirection>; script?: VideoScript } = {}): VideoComposition {
  const readScore = (value: string, fallback: number) => value.trim() && Number.isFinite(Number(value)) ? Math.max(0, Math.min(10, Number(value))) : fallback
  const currentScore = readScore(input.overallScore, 7.1)
  const potentialScore = readScore(input.potentialScore, 8.2)
  const overallReport = reports.find(report => report.id === 'overall' && report.assessmentId) ?? buildMockOverallCategory(String(currentScore), { [featureCategory(input.strongestFeature)]: input.strongestScore, [featureCategory(input.opportunityFeature)]: input.opportunityScore })
  const scenes: VideoScene[] = []
  let previousCategory = 'overall'
  const shots = planScriptShots(plan, style === 'diagnostic' || options.recipe === 'report-led' || options.recipe === 'portrait-audit' ? 2300 : 2900)
  for (const [index, shot] of shots.entries()) {
    const { durationMs, narration } = shot
    const cue = narration
    const inferredCategory = inferScriptCategory(narration) ?? inferScriptCategory(shot.beat.onScreen)
    const categoryId = inferredCategory === 'proportions' && /\bspacing\b/i.test(narration) && previousCategory === 'eyes' ? previousCategory : inferredCategory ?? previousCategory
    previousCategory = categoryId
    const report = categoryId === 'overall' ? overallReport : reports.find(report => report.id === categoryId) ?? reports.find(report => report.id === 'overall')
    const inferredFocus = inferReportFocus(cue, report)
    let focus = shot.first && inferredFocus === 'scores' && !/score|rating|overall/i.test(narration) ? 'hero' : inferredFocus
    const componentCue = /\b(slider|graph|chart|gauge|enlarge|isolat|center|big|zoom into|zoom in on)\w*\b/i.test(`${narration} ${shot.beat.narration}`)
    const portrait = !componentCue && wantsFeaturePortrait(narration, categoryId, focus)
    const featureCue = categoryId !== 'overall' && !/\b(report|scroll|open|evaluation|screen|dashboard)\b/i.test(narration) && (focus.startsWith('feature:') || ['features', 'category-score'].includes(focus))
    const component = !shot.first && (componentCue || !portrait && featureCue)
    if (portrait || component) {
      const wholeFocus = inferReportFocus(shot.beat.narration, report)
      if (wholeFocus.startsWith('feature:') || ['category-score', 'potential'].includes(wholeFocus)) focus = wholeFocus
    }
    if (component && ['features', 'scores'].includes(focus)) {
      const feature = report?.features.find(feature => feature.visual && feature.visual !== 'Text')
      if (feature) focus = `feature:${feature.id ?? report!.features.indexOf(feature)}`
    }
    const title = shot.last && /CTA|Closing/i.test(shot.beat.label)
    const metricScore = categoryId === featureCategory(input.strongestFeature) ? readScore(input.strongestScore, 8.1) : categoryId === featureCategory(input.opportunityFeature) ? readScore(input.opportunityScore, 6.2) : currentScore
    const source: VideoScene['source'] = { kind: shot.first ? 'report' : title ? 'title' : portrait ? 'portrait' : component ? 'component' : 'report', imageId: imageIds[0] ?? null, secondaryImageId: imageIds[1] ?? imageIds[0] ?? null, categoryId,
      potentialScale: input.potentialScale, potentialCurrentScore: input.potentialCurrentScore, hidePotential: !input.potentialScore.trim(), overlay: portrait || component || title || shot.first && categoryId !== 'overall' ? 'category' : focus === 'hero' ? 'face-map' : 'none', currentScore, potentialScore, metricScore, report: focus === 'action-plan' && report ? { ...report, recommendation: input.recommendation.trim() || report.recommendation } : report }
    const captioned = !shot.first && (title || portrait || component)
    const framing = captioned ? 'captioned' : 'full'
    const previous = scenes.at(-1)
    if (component && previous?.source.kind === 'report' && previous.source.categoryId === categoryId) {
      previous.focus = focus
      previous.tracks = previous.tracks.map(track => track.target === 'report' ? { ...track, section: focus } : track)
    }
    const sameReport = previous?.source.kind === 'report' && source.kind === 'report' && previous.source.categoryId === categoryId
    const shared = previous?.source.imageId === source.imageId && (captioned || previous?.framing === 'captioned') && source.kind !== 'screen' && previous?.source.kind !== 'screen'
    const transition = index === 0 || sameReport ? 'hard-cut' : title ? 'luma-cut' : shared ? previous?.focus !== focus ? 'transition-panel' : 'cinematic-flow' : 'focus-cut'
    const tracks: MotionTrack[] = [{ ...createMotionTrack(transition, 'content', durationMs), durationMs: Math.min(transition === 'cinematic-flow' ? 620 : primitiveDefinition(transition).durationMs, durationMs * .4) }]
    if (captioned) tracks.push({ ...createMotionTrack('caption-swish', 'text', durationMs), startMs: Math.min(180, durationMs * .1), durationMs: durationMs - Math.min(180, durationMs * .1), intensity: .2 })
    if (source.kind === 'report' || source.kind === 'component') {
      const scrollStart = shot.first ? Math.min(320, durationMs * .2) : previous?.source.kind === 'component' && source.kind === 'report' ? Math.min(750, durationMs * .4) : 0
      tracks.push({ ...createMotionTrack('scroll-to-section', 'report', durationMs), section: focus, startMs: scrollStart, durationMs: Math.min(1500, durationMs * .62, durationMs - scrollStart) })
      if (source.kind === 'report' && focus.startsWith('feature:')) tracks.push({ ...createMotionTrack('border-beam', 'report', durationMs), section: focus, startMs: Math.min(durationMs * .35, 900), durationMs: durationMs - Math.min(durationMs * .35, 900) })
      if (source.kind === 'component') tracks.push({ ...createMotionTrack('component-focus', 'report', durationMs), section: focus, durationMs: Math.min(900, durationMs * .5) })
    }
    if (source.overlay !== 'none') {
      tracks.push({ ...createMotionTrack(source.overlay === 'face-map' ? 'landmark-stagger' : 'contour-trace', 'overlay', durationMs), durationMs: Math.min(950, durationMs) })
      if (source.overlay === 'category') tracks.push({ ...createMotionTrack(index % 2 ? 'measurement-sweep' : 'landmark-halo', 'overlay', durationMs), startMs: Math.min(450, durationMs * .2), durationMs: Math.min(1200, durationMs * .7), intensity: .45 })
    }
    const previousShot = shots[index - 1]
    if (previous && previousShot?.beat.id === shot.beat.id && ['component', 'portrait'].includes(source.kind) && previous.source.kind === source.kind && previous.source.categoryId === categoryId && previous.focus === focus) {
      previous.durationMs += durationMs
      previous.narration += ` ${narration}`
      previous.text = previous.narration.slice(0, 240)
      previous.tracks = previous.tracks.map(track => track.target === 'camera' ? { ...track, durationMs: previous.durationMs } : track)
      continue
    }
    scenes.push({ id: `scene-${index}`, label: `${source.kind === 'report' ? report?.title ?? 'Report' : source.kind === 'component' ? 'Feature stage' : title ? 'Mogging' : 'Face detail'} · ${focusLabel(focus)}`, startMs: shot.startMs, durationMs, source, focus, framing, narration, cueId: shot.beat.id,
      layout: portrait ? 'portrait' : 'stacked',
      text: narration.slice(0, 240), subtitle: '', tracks })
  }
  const recipe = options.recipe ?? 'report-led', variation = options.variation ?? 0
  const cueText = new Map<string, string>()
  for (const scene of scenes) cueText.set(scene.cueId, [cueText.get(scene.cueId), scene.narration].filter(Boolean).join(' '))
  const proofScene = (scene: VideoScene) => /\b(open|scroll|report|screen|dashboard)\b/i.test(cueText.get(scene.cueId) ?? scene.narration)
  const graphicScene = (scene: VideoScene) => recipe === 'minimal-explainer' || recipe === 'hybrid-story' && !proofScene(scene) || recipe === 'measurement-explainer' && !proofScene(scene) && !['eyes', 'brows', 'jaw', 'nose', 'mouth', 'cheeks', 'face-shape', 'proportions', 'symmetry'].includes(inferScriptCategory(cueText.get(scene.cueId) ?? scene.narration) ?? scene.source.categoryId)
  for (let index = 1; index < scenes.length; index++) {
    const previous = scenes[index - 1], current = scenes[index]
    if (current.cueId !== previous.cueId || !options.directions?.[current.cueId] && (!graphicScene(previous) || !graphicScene(current))) continue
    const durationMs = previous.durationMs + current.durationMs
    const narration = `${previous.narration} ${current.narration}`
    Object.assign(previous, retimeVideoScene(previous, durationMs), { narration, text: narration.slice(0, 240) })
    scenes.splice(index--, 1)
  }
  for (const [index, scene] of scenes.entries()) {
    if (index === 0 && options.recipe === 'report-led' && scene.source.categoryId === 'overall' && !proofScene(scene)) {
      scene.source.kind = 'portrait'; scene.source.overlay = 'face-map'; scene.framing = 'captioned'; scene.layout = 'portrait'; scene.label = 'Face audit · Hook'
      scene.tracks = scene.tracks.filter(track => !['overlay', 'report'].includes(track.target))
      scene.tracks.push({ ...createMotionTrack('landmark-stagger', 'overlay', scene.durationMs), durationMs: Math.min(950, scene.durationMs) })
    }
    if (graphicScene(scene)) {
      scene.graphic = scriptGraphic(scene.narration, scene.source, input, variation, index, scenes[index - 1]?.graphic)
      scene.source = { ...scene.source, kind: 'explainer', imageId: null, secondaryImageId: scene.graphic.items.some(item => item.diagram === 'expression') ? imageIds[0] ?? null : null, overlay: 'none' }
      scene.text = scene.narration.length <= 240 ? scene.narration : shortHeading(scene.narration); scene.subtitle = ''; scene.label = `Explainer · ${scene.graphic.layout === 'story' ? '3D anatomy' : scene.graphic.layout}`
      scene.tracks = [createMotionTrack(index ? 'layout-morph' : 'hard-cut', 'content', scene.durationMs), { ...createMotionTrack('caption-swish', 'text', scene.durationMs), durationMs: scene.durationMs }]
      const words = scene.narration.split(/\s+/)
      const spokenTrack = (primitive: MotionPrimitiveId, target: TrackTarget, wordIndex: number, elementId?: string) => {
        if (wordIndex < 0) return
        const startMs = wordIndex / Math.max(1, words.length) * scene.durationMs
        scene.tracks.push({ ...createMotionTrack(primitive, target, scene.durationMs), id: `${primitive}-${wordIndex}-${scene.tracks.length}`, wordIndex, startMs, durationMs: Math.min(1100, scene.durationMs - startMs), ...(elementId ? { elementId, intensity: .45 } : {}) })
      }
      if (scene.graphic.layout === 'constellation' && /\b(groups?|split|divide|regroup)\b/i.test(scene.narration)) {
        spokenTrack('graphic-regroup', 'decoration', words.findIndex(word => /groups?|split|divide|regroup/i.test(word)))
      }
    } else if (recipe === 'portrait-audit' || recipe === 'measurement-explainer' && !proofScene(scene)) {
      scene.source.kind = scene.focus === 'action-plan' ? 'component' : 'portrait'; scene.source.overlay = 'category'; scene.framing = 'captioned'
    }
    if (scene.graphic && ['hybrid-story', 'measurement-explainer'].includes(recipe) && imageIds.length && /\b(face|facial|photos?|portrait|camera|lighting|grooming)\b/i.test(scene.narration)) {
      scene.source = { ...scene.source, kind: 'portrait', imageId: imageIds[0], overlay: 'face-map' }; scene.graphic = undefined
      scene.focus = 'hero'; scene.layout = 'portrait'; scene.framing = 'captioned'; scene.editorial = 'context'; scene.label = 'Photo study · Feature focus'
      scene.tracks = [createMotionTrack(index ? 'focus-cut' : 'hard-cut', 'content', scene.durationMs), createMotionTrack('caption-swish', 'text', scene.durationMs), { ...createMotionTrack('contour-trace', 'overlay', scene.durationMs), durationMs: Math.min(900, scene.durationMs) }]
    }
    const direction = options.directions?.[scene.cueId]
    if (direction) {
      const portrait = direction.kind === 'portrait', component = direction.kind === 'component', report = direction.kind === 'report'
      const categoryId = direction.categoryId ?? 'overall'
      const category = categoryId === 'overall' ? overallReport : reports.find(item => item.id === categoryId)
      if (direction.imageId && !imageIds.includes(direction.imageId)) throw new Error(`Missing directed image: ${direction.imageId}`)
      scene.source = { ...scene.source, kind: direction.kind, imageId: portrait || component || report ? direction.imageId ?? imageIds[0] ?? null : null, secondaryImageId: null, categoryId, overlay: portrait ? 'face-map' : component ? 'category' : 'none', report: category, metricScore: category?.score ?? scene.source.metricScore }
      scene.scoreCallouts = portrait ? direction.scoreCallouts : undefined
      scene.graphic = direction.kind === 'explainer' ? direction.graphic : undefined
      scene.photoStudy = portrait ? direction.photoStudy : undefined
      scene.portraitFX = portrait ? direction.portraitFX : undefined
      scene.profileStudy = portrait ? direction.profileStudy : undefined
      scene.study = portrait ? direction.study : undefined
      scene.featureStudy = portrait ? direction.featureStudy : undefined
      scene.portraitProgram = portrait ? direction.portraitProgram : undefined
      if (scene.featureStudy) scene.source.overlay = 'none'
      if (scene.study?.references.some(reference => !imageIds.includes(reference.imageId))) throw new Error('An editorial study reference photo is missing.')
      scene.editorial = portrait ? direction.editorial ?? (categoryId === 'overall' ? 'context' : direction.profileStudy ? 'compare' : 'detail') : undefined
      scene.delivery = direction.delivery
      scene.focus = direction.focus ?? 'hero'; scene.framing = report ? 'full' : 'captioned'; scene.layout = 'portrait'
      scene.label = portrait ? scene.study ? `Visual argument · ${scene.study.operation}` : `Photo study · ${scene.source.categoryId}` : report ? `Report · ${direction.emphasis ?? 'overview'}` : `Educational · ${scene.graphic?.layout}`
      scene.tracks = [createMotionTrack(index ? portrait && scenes[index - 1].source.kind === 'portrait' ? 'cinematic-flow' : portrait ? 'focus-cut' : 'layout-morph' : 'hard-cut', 'content', scene.durationMs), { ...createMotionTrack('caption-swish', 'text', scene.durationMs), durationMs: scene.durationMs }]
      if (scene.study) scene.tracks[0].durationMs = Math.min(editorialStudyMotion.reframeMs, scene.durationMs * .4)
      if (portrait && !scene.study && !scene.featureStudy) {
        const movement = scene.editorial === 'context' ? 'pull-out' : 'slow-push'
        scene.tracks.push({ ...createMotionTrack('contour-trace', 'overlay', scene.durationMs), durationMs: Math.min(900, scene.durationMs) }, { ...createMotionTrack(movement, 'element', scene.durationMs), elementId: 'subject', durationMs: scene.durationMs, intensity: .3, anchor: { x: .5, y: scene.source.categoryId === 'eyes' ? .38 : scene.source.categoryId === 'jaw' ? .65 : .5 } })
      }
      if (report) {
        scene.tracks[0] = createMotionTrack(index && scenes[index - 1].source.kind === 'report' ? 'hard-cut' : 'focus-cut', 'content', scene.durationMs)
        scene.tracks.push({ ...createMotionTrack('scroll-to-section', 'report', scene.durationMs), section: scene.focus, durationMs: Math.min(1200, scene.durationMs * .25) })
        if (direction.emphasis) {
          const startMs = Math.min(1300, scene.durationMs * .27), durationMs = scene.durationMs - startMs
          scene.tracks.push({ ...createMotionTrack(direction.emphasis, 'report', scene.durationMs), section: scene.focus, startMs, durationMs, intensity: direction.emphasis === 'section-expand' ? .6 : 1 })
          if (direction.emphasis !== 'border-beam') scene.tracks.push({ ...createMotionTrack('border-beam', 'report', scene.durationMs), section: scene.focus, startMs, durationMs, intensity: .7 })
        }
      }
    }
    if (!options.script && !direction && recipe !== 'report-led' && (scene.source.kind === 'report' || proofScene(scene)) && /\b(features|categories|scores|values|separates)\b/i.test(scene.narration)) {
      scene.graphic = reportScoreGrid(scene.source, input, variation + index)
      scene.source = { ...scene.source, kind: 'explainer', overlay: 'none', secondaryImageId: null }
      scene.framing = 'captioned'; scene.focus = 'hero'; scene.label = 'Report · Category timeline grid'
      scene.tracks = [createMotionTrack(index ? 'layout-morph' : 'hard-cut', 'content', scene.durationMs)]
    }
    // Restore effects from the spoken argument, rather than from a rotating demo.
    // Authored directions retain ownership when they already specify an effect.
    const hypothetical = /bigger jaw|larger jaw|bigger is not automatically better|narrower nose|more cheek width|wider cheeks|smaller nose|larger lips|fuller lips/i.test(scene.narration)
    const relight = /shadow|grazing light|dramatic light|light changes|lighting changes|frontal source|tonal pattern/i.test(scene.narration)
    if (!options.script && !direction && (hypothetical || relight) && ['portrait', 'component', 'explainer'].includes(scene.source.kind) && imageIds.length) {
      scene.source = { ...scene.source, kind: 'portrait', imageId: scene.source.imageId ?? imageIds[0], overlay: scene.source.overlay === 'none' ? 'category' : scene.source.overlay }
      scene.graphic = undefined; scene.framing = 'captioned'; scene.focus = 'hero'; scene.editorial ??= 'context'
      if (hypothetical && !scene.photoStudy) {
        const feature = /nose/i.test(scene.narration) ? 'nose' : /cheek/i.test(scene.narration) ? 'cheeks' : /lips/i.test(scene.narration) ? 'lips' : 'jaw'
        scene.study = undefined; scene.profileStudy = undefined
        scene.photoStudy = { feature, mode: feature === 'nose' ? 'pinch' : 'stretch', axis: 'x', amount: .16, cursor: true }
      }
      if (relight && !scene.photoStudy && !scene.portraitFX?.lighting) scene.portraitFX = { ...scene.portraitFX, overlay: scene.portraitFX?.overlay ?? glassOverlaySchema.parse({}), lighting: portraitLightingSchema.parse({ target: /jaw|chin/i.test(scene.narration) ? 'jaw' : 'cheeks', ambientEv: -1, intensity: 1.8 }) }
    }
    if (scene.source.kind === 'portrait' && !scene.photoStudy && !scene.profileStudy && !scene.featureStudy && !scene.study) {
      if (scene.source.categoryId !== 'overall' && /close.?up|zoom|inspect|detail|eyelids?|nasal bridge|jaw contour/i.test(scene.narration)) scene.editorial = 'detail'
      if (!scene.tracks.some(track => track.target === 'element' && track.elementId === 'subject')) scene.tracks.push({ ...createMotionTrack(scene.editorial === 'detail' ? 'slow-push' : 'pull-out', 'element', scene.durationMs), elementId: 'subject', durationMs: scene.durationMs, intensity: .85 })
      else scene.tracks = scene.tracks.map(track => track.target === 'element' && track.elementId === 'subject' ? { ...track, intensity: Math.max(.85, track.intensity) } : track)
    }
    if (scene.graphic?.items.some(item => item.diagram)) scene.source.secondaryImageId ??= imageIds[0] ?? null
    if (scene.graphic?.layout === 'story' && index && scenes[index - 1].source.kind === 'portrait') scene.tracks = scene.tracks.map(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition' ? createMotionTrack('hard-cut', 'content', scene.durationMs) : track)
  }
  for (const scene of scenes) {
    if (scene.source.kind !== 'portrait' || scene.photoStudy || scene.profileStudy || scene.portraitFX?.lighting) continue
    const metric = narratedFaceMetric(scene.narration, scene.source.categoryId)
    if (metric) scene.focus = `metric:${metric.id}`
    if (recipe === 'measurement-explainer' && !['overall', 'symmetry', 'proportions'].includes(scene.source.categoryId)) {
      scene.editorial = 'detail'; scene.source.overlay = 'category'
      if (scene.study && ['compare', 'recap'].includes(scene.study.operation)) scene.study = undefined
    }
  }
  // Legacy script compilers share the production action engine; authored multi-card studies own their choreography.
  for (const scene of scenes) if (scene.source.kind === 'portrait' && !scene.portraitProgram && !scene.study && scene.narration) {
    const feature = decodeVisualBeat(scene.narration).feature
    scene.portraitProgram = planPortraitProgram(scene.narration, feature, recipe, variation, scene.profileStudy?.view ?? 'front')
  }
  // One accent per four eligible portraits, spread across all format grammars.
  // Explicit editor choices keep ownership; reports, edits and lighting stay intact.
  const trackerCandidates=scenes.filter(scene=>scene.source.kind==='portrait' && !scene.customSlideId && !scene.portraitFX?.instrument && !scene.photoStudy && !scene.profileStudy && !scene.study && !scene.portraitFX?.lighting && !scene.featureStudy?.edit && !/mogging\.com|Get your face analysis/i.test(scene.narration))
  for(let start=0;start<trackerCandidates.length;start+=4) {
    const seed=scriptVisualSeed(recipe,String(variation),String(start))
    if(trackerCandidates.length<3 && seed%3!==0)continue
    const scene=trackerCandidates[start+seed%Math.min(3,trackerCandidates.length-start)]
    const combined=recipe==='feature-study' && seed%3===0
    scene.portraitFX={...scene.portraitFX,instrument:portraitInstrumentSchema.parse({trackers:seed%3===1?'dense':'sparse',links:seed%3!==2,scan:combined,trails:combined})}
  }
  // Hold a print treatment across a portrait run; alternate paper and colour print, then return to natural colour.
  let printChapter = -1, printImage: string | null = null
  for (const scene of scenes) {
    const eligible = ['portrait-audit', 'measurement-explainer', 'hybrid-story'].includes(recipe) && scene.source.kind === 'portrait' && !scene.portraitFX?.print && !scene.portraitFX?.lighting && !scene.photoStudy && !scene.profileStudy && !scene.featureStudy && !['compare', 'recap', 'light'].includes(scene.study?.operation ?? '')
    if (!eligible) { printImage = null; continue }
    if (!scene.source.imageId) continue
    if (scene.source.imageId !== printImage) { printChapter++; printImage = scene.source.imageId }
    const print = (['paper','cmyk','paper',undefined] as const)[printChapter%4]
    if (print) scene.portraitFX = { ...scene.portraitFX, print }
  }
  for (const [index, scene] of scenes.entries()) {
    const previous = scenes[index - 1]
    const sameGraphic = previous?.graphic && scene.graphic && JSON.stringify(previous.graphic) === JSON.stringify(scene.graphic)
    scene.tracks = scene.tracks.map(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition'
      ? sameGraphic ? createMotionTrack('hard-cut', 'content', scene.durationMs) : { ...track, durationMs: Math.min(track.durationMs, videoMotion.cutMs, scene.durationMs * .25) }
      : track)
  }
  const script = options.script ?? createVideoScript(plan.scenes.map(cue => ({ ...cue, delivery: options.directions?.[cue.id]?.delivery })))
  const anchored = bindScriptScenes(script, scenes).map(scene => ({ ...scene, tracks: scene.tracks.map(track => {
    const wordIndex = track.wordIndex ?? (['text', 'overlay', 'report'].includes(track.target) ? 0 : undefined)
    return wordIndex === undefined || wordIndex >= scene.scriptRange.wordCount ? track : { ...track, wordId: `${scene.scriptRange.cueId}/word:${scene.scriptRange.startWord + wordIndex}` }
  }) }))
  return parseComposition(choreographVideoTransitions(ensureEarlyAppProof({ version: 1, title: plan.title, width: videoSize.width, height: videoSize.height, fps: 30, durationMs: Math.round(plan.duration * 1000), style, theme: 'light', scenes: anchored, script, recipe, variation }, imageIds[0])))
}

export function wantsFeaturePortrait(text: string, category: string, focus: string) {
  if (category === 'overall' || ['potential', 'action-plan'].includes(focus)) return false
  if (/\b(overlay|portrait|photo|image|without the report|no report)\b/i.test(text)) return true
  if (['category-score', 'scores'].includes(focus)) return false
  if (/\b(report|scroll|screen|card|dashboard|evaluation|open)\b/i.test(text) && !/\b(without|instead|no report)\b/i.test(text)) return false
  return /\b(overlay|portrait|photo|image|look at|highlight|canthal|spacing|definition|contour|angle|symmetry)\b/i.test(text)
}

export function inferScriptCategory(text: string) {
  const patterns: Array<[string, RegExp]> = [['eyes', /\b(eyes?|canthal|eyelids?|lashes|pupils?)\b/i], ['brows', /\b(brows?|eyebrows?)\b/i], ['jaw', /\b(jaw|jawline|chin|mandible)\b/i], ['nose', /\b(nose|nasal|nostrils?)\b/i], ['mouth', /\b(mouth|lips?)\b/i], ['cheeks', /\b(cheeks?|cheekbones?)\b/i], ['skin', /\b(skin|complexion|texture)\b/i], ['symmetry', /\b(symmetry|asymmetry|symmetric)\b/i], ['proportions', /\b(ratios?|thirds|proportions|spacing)\b/i]]
  const first = patterns.map(([id, pattern]) => ({ id, index: text.search(pattern) })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index)[0]
  if (first) return first.id
  if (/\b(overall|total|scan|Mogging)\b/i.test(text)) return 'overall'
  return null
}

export function inferReportFocus(text: string, report?: ReportCategory) {
  if (/potential|upside|growth/i.test(text)) return 'potential'
  if (/protocol|routine|roadmap|action|priorit|recommend|plan|next move|track.*progress/i.test(text)) return 'action-plan'
  if (/landmark|face map|maps|scan|46.point/i.test(text)) return 'hero'
  if (report && report.id !== 'overall' && /score|scoring|rating|rated|out of/i.test(text)) return 'category-score'
  const features = report?.features ?? []
  const matched = features.find(feature => feature.label.toLowerCase().split(/\W+/).filter(word => word.length > 3 && !['score','overall','feature'].includes(word)).some(word => text.toLowerCase().includes(word)))
  if (matched) return `feature:${matched.id ?? features.indexOf(matched)}`
  if (/feature|strength|opportunity|ratio|detail|canthal|angle|spacing/i.test(text)) return 'features'
  return report && report.id !== 'overall' ? 'features' : 'scores'
}

function focusLabel(focus: string) {
  return ({ hero: 'Face scan', scores: 'Score reveal', 'category-score': 'Category score', features: 'Feature detail', potential: 'Potential', 'action-plan': 'Action plan' } as Record<string, string>)[focus] ?? 'Metric close-up'
}

function featureCategory(label: string) {
  if (/eye|brow|lash/i.test(label)) return 'eyes'
  if (/jaw|chin|mandib/i.test(label)) return 'jaw'
  if (/nose|nasal/i.test(label)) return 'nose'
  if (/lip|mouth/i.test(label)) return 'mouth'
  if (/skin/i.test(label)) return 'skin-age'
  if (/cheek|shape|third/i.test(label)) return 'face-shape'
  return 'symmetry'
}
