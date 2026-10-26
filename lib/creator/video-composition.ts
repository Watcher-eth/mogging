import { z } from 'zod'
import { motionPrimitives, primitiveDefinition, type MotionPrimitiveId } from './motion-primitives'
import type { AnalysisPostInput, AnalysisPostPlan } from './analysis-post'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import { buildMockOverallCategory } from './mock-report-data'
import { planScriptShots, shortHeading } from './script-edit'

export const videoStyles = {
  creator: { label: 'Creator editorial', description: 'Light app-led edit, crisp cuts, feature-card expansions and clean typography.', accent: '#008dc9', text: 'rise-in' as MotionPrimitiveId, camera: 'slow-push' as MotionPrimitiveId },
  diagnostic: { label: 'Feature breakdown', description: 'Precise app scrolling, native metric cards and matched feature cutaways.', accent: '#008dc9', text: 'rise-in' as MotionPrimitiveId, camera: 'punch-in' as MotionPrimitiveId },
  brand: { label: 'Mogging editorial', description: 'White surfaces, blue-to-mint UI highlights and continuous screen transitions.', accent: '#00a8ef', text: 'rise-in' as MotionPrimitiveId, camera: 'slow-push' as MotionPrimitiveId },
} as const
export type VideoStyleId = keyof typeof videoStyles
export const trackTargets = ['camera', 'content', 'text', 'overlay', 'decoration', 'report'] as const
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
}).strict()
export type MotionTrack = z.infer<typeof motionTrackSchema>

const reportSchema = z.object({
  id: z.string().max(80), title: z.string().max(120), subtitle: z.string().max(300), scoreLabel: z.string().max(120), score: z.number().min(0).max(10),
  explanation: z.string().max(5000), recommendation: z.string().max(5000), eyeColor: z.string().max(30).optional(),
  features: z.array(z.object({ label: z.string().max(160), value: z.string().max(1000), measurement: z.string().max(120).optional(), id: z.string().max(120).optional(), visual: z.string().max(80).optional(), positions: z.array(z.number().finite()).max(20).optional(), grade: z.number().finite().nullable().optional(), scale: z.enum(['range', 'quality']).optional() }).strict()).max(100),
}).strict()

export const videoSceneSchema = z.object({
  id: z.string().min(1).max(100), label: z.string().max(120), startMs: z.number().finite().min(0), durationMs: z.number().finite().min(100).max(180000),
  source: z.object({ kind: z.enum(['portrait', 'report', 'component', 'title', 'screen']), imageId: z.string().max(100).nullable(), secondaryImageId: z.string().max(100).nullable().optional(), categoryId: z.string().max(80), overlay: z.enum(['none', 'category', 'face-map']), currentScore: z.number().finite().min(0).max(10), potentialScore: z.number().finite().min(0).max(10), metricScore: z.number().finite().min(0).max(10), report: reportSchema.optional(), captureInsets: z.object({ top: z.number().min(0).max(.2), bottom: z.number().min(0).max(.2) }).strict().optional() }).strict(),
  text: z.string().max(240), subtitle: z.string().max(500), narration: z.string().max(5000).default(''), cueId: z.string().max(160).default(''), focus: z.string().max(160).default('scores'),
  framing: z.enum(['full', 'captioned', 'device', 'detail']).default('full'), tracks: z.array(motionTrackSchema).max(30),
}).strict()
export type VideoScene = z.infer<typeof videoSceneSchema>

export const compositionSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(160), width: z.literal(1080), height: z.literal(1920), fps: z.literal(30),
  style: z.enum(['creator', 'diagnostic', 'brand']), theme: z.enum(['light', 'dark']).default('light'), durationMs: z.number().finite().min(100).max(180000), scenes: z.array(videoSceneSchema).min(1).max(250),
}).strict().superRefine((composition, ctx) => {
  let end = 0
  const sceneIds = new Set<string>()
  for (const [index, scene] of composition.scenes.entries()) {
    if (sceneIds.has(scene.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'id'], message: 'Scene IDs must be unique' })
    sceneIds.add(scene.id)
    if (Math.abs(scene.startMs - end) > .01) ctx.addIssue({ code: 'custom', path: ['scenes', index], message: 'Scenes must form a contiguous timeline' })
    end = scene.startMs + scene.durationMs
    const ids = new Set<string>()
    for (const [trackIndex, track] of scene.tracks.entries()) {
      if (ids.has(track.id)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Track IDs must be unique in a scene' })
      ids.add(track.id)
      if (track.startMs + track.durationMs > scene.durationMs + .01) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Track extends beyond the scene' })
      if (!allowedPrimitives(track.target).some(item => item.id === track.primitive)) ctx.addIssue({ code: 'custom', path: ['scenes', index, 'tracks', trackIndex], message: 'Primitive is incompatible with its target' })
    }
  }
  if (Math.abs(end - composition.durationMs) > .01) ctx.addIssue({ code: 'custom', path: ['durationMs'], message: 'Duration must match the timeline' })
})
export type VideoComposition = z.infer<typeof compositionSchema>

export function allowedPrimitives(target: TrackTarget) {
  const categories: Record<TrackTarget, string[]> = { camera: ['camera'], content: ['transition', 'entry', 'exit'], text: ['text', 'entry', 'exit'], overlay: ['overlay', 'entry', 'exit'], decoration: ['cursor', 'cinematic'], report: ['report'] }
  return motionPrimitives.filter(item => categories[target].includes(item.category))
}

export function parseComposition(value: unknown): VideoComposition {
  const composition = compositionSchema.parse(value)
  const first = composition.scenes[0]
  first.framing = 'full'
  if (first.source.kind === 'component' || first.source.kind === 'title') first.source.kind = 'report'
  first.tracks = first.tracks.filter(track => track.primitive !== 'component-focus')
  for (const scene of composition.scenes) {
    if (scene.source.kind === 'report' || scene.source.kind === 'screen') scene.framing = 'full'
    else if (scene !== first) scene.framing = 'captioned'
  }
  return composition
}

export function activeScene(composition: VideoComposition, timeMs: number) {
  const time = Math.max(0, Math.min(composition.durationMs - .001, timeMs))
  return composition.scenes.find(scene => time >= scene.startMs && time < scene.startMs + scene.durationMs) ?? composition.scenes[0]
}

export function arrangeVideoScenes(composition: VideoComposition, scenes: VideoScene[]) {
  let startMs = 0
  return parseComposition({ ...composition, scenes: scenes.map(scene => {
    const next = { ...scene, startMs }; startMs += scene.durationMs; return next
  }), durationMs: scenes.reduce((sum, scene) => sum + scene.durationMs, 0) })
}

export function retimeVideoScene(scene: VideoScene, durationMs: number): VideoScene {
  const ratio = durationMs / scene.durationMs
  return { ...scene, durationMs, tracks: scene.tracks.map(track => ({ ...track, startMs: track.startMs * ratio, durationMs: track.durationMs * ratio })) }
}

export function createMotionTrack(primitive: MotionPrimitiveId, target: TrackTarget, sceneDuration: number): MotionTrack {
  const definition = primitiveDefinition(primitive)
  return { id: `${target}-${primitive}`, primitive, target, startMs: definition.category === 'exit' ? Math.max(0, sceneDuration - definition.durationMs) : 0, durationMs: Math.min(definition.durationMs, sceneDuration), intensity: 1, anchor: { x: .5, y: .5 } }
}

export function compileAnalysisVideo(plan: AnalysisPostPlan, input: AnalysisPostInput, imageIds: string[], style: VideoStyleId, reports: ReportCategory[]): VideoComposition {
  const look = videoStyles[style]
  const readScore = (value: string, fallback: number) => value.trim() && Number.isFinite(Number(value)) ? Math.max(0, Math.min(10, Number(value))) : fallback
  const currentScore = readScore(input.overallScore, 7.1)
  const potentialScore = readScore(input.potentialScore, 8.2)
  const scenes: VideoScene[] = []
  let previousCategory = 'overall'
  const shots = planScriptShots(plan, style === 'diagnostic' ? 2300 : 2900)
  for (const [index, shot] of shots.entries()) {
    const { durationMs, narration } = shot
    const cue = narration
    const categoryId = inferScriptCategory(narration) ?? inferScriptCategory(shot.beat.onScreen) ?? previousCategory
    previousCategory = categoryId
    const report = categoryId === 'overall' ? buildMockOverallCategory(String(currentScore), { [featureCategory(input.strongestFeature)]: input.strongestScore, [featureCategory(input.opportunityFeature)]: input.opportunityScore }) : reports.find(report => report.id === categoryId) ?? reports.find(report => report.id === 'overall')
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
      overlay: portrait || component || title || shot.first && categoryId !== 'overall' ? 'category' : focus === 'hero' ? 'face-map' : 'none', currentScore, potentialScore, metricScore, report: focus === 'action-plan' && report ? { ...report, recommendation: input.recommendation.trim() || report.recommendation } : report }
    const captioned = !shot.first && (title || portrait || component)
    const framing = captioned ? 'captioned' : 'full'
    const previous = scenes.at(-1)
    if (component && previous?.source.kind === 'report' && previous.source.categoryId === categoryId) {
      previous.focus = focus
      previous.tracks = previous.tracks.map(track => track.target === 'report' ? { ...track, section: focus } : track)
    }
    const sameReport = previous?.source.kind === 'report' && source.kind === 'report' && previous.source.categoryId === categoryId
    const tracks: MotionTrack[] = [{ ...createMotionTrack(index === 0 || sameReport ? 'hard-cut' : 'cinematic-flow', 'content', durationMs), durationMs: Math.min(720, durationMs * .45) }]
    if (captioned && !(component && previous?.source.kind === 'component' && previous.focus === focus && shots[index - 1]?.beat.id === shot.beat.id)) tracks.push({ ...createMotionTrack(portrait || component || focus === 'action-plan' ? 'type-on' : look.text, 'text', durationMs), startMs: Math.min(180, durationMs * .1), durationMs: Math.min(850, durationMs * .48), intensity: .2 })
    if (source.kind === 'report' || source.kind === 'component') {
      const scrollStart = shot.first ? Math.min(320, durationMs * .2) : previous?.source.kind === 'component' && source.kind === 'report' ? Math.min(750, durationMs * .4) : 0
      tracks.push({ ...createMotionTrack('scroll-to-section', 'report', durationMs), section: focus, startMs: scrollStart, durationMs: Math.min(900, durationMs * .38) })
      if (source.kind === 'component') tracks.push({ ...createMotionTrack('component-focus', 'report', durationMs), section: focus, durationMs: Math.min(900, durationMs * .5) })
    }
    if (source.overlay !== 'none') tracks.push({ ...createMotionTrack(source.overlay === 'face-map' ? 'landmark-stagger' : 'contour-trace', 'overlay', durationMs), durationMs: Math.min(1500, durationMs) })
    const previousShot = shots[index - 1]
    if (previous && previousShot?.beat.id === shot.beat.id && ['component', 'portrait'].includes(source.kind) && previous.source.kind === source.kind && previous.source.categoryId === categoryId && previous.focus === focus) {
      previous.durationMs += durationMs
      previous.narration += ` ${narration}`
      previous.tracks = previous.tracks.map(track => track.target === 'camera' ? { ...track, durationMs: previous.durationMs } : track)
      continue
    }
    scenes.push({ id: `scene-${index}`, label: `${source.kind === 'report' ? report?.title ?? 'Report' : source.kind === 'component' ? 'Feature stage' : title ? 'Mogging' : 'Face detail'} · ${focusLabel(focus)}`, startMs: shot.startMs, durationMs, source, focus, framing, narration, cueId: shot.beat.id,
      text: title ? shot.beat.onScreen : shot.first && /\?|Hook|interrupt/i.test(`${narration} ${shot.beat.label}`) ? shot.beat.onScreen : reportHeading(focus, report, narration), subtitle: title ? 'MOGGING.COM' : '', tracks })
  }
  return parseComposition({ version: 1, title: plan.title, width: 1080, height: 1920, fps: 30, durationMs: Math.round(plan.duration * 1000), style, theme: 'light', scenes })
}

export function wantsFeaturePortrait(text: string, category: string, focus: string) {
  if (category === 'overall' || ['potential', 'action-plan'].includes(focus)) return false
  if (/\b(overlay|portrait|photo|image|without the report|no report)\b/i.test(text)) return true
  if (['category-score', 'scores'].includes(focus)) return false
  if (/\b(report|scroll|screen|card|dashboard|evaluation|open)\b/i.test(text) && !/\b(without|instead|no report)\b/i.test(text)) return false
  return /\b(overlay|portrait|photo|image|look at|highlight|canthal|spacing|definition|contour|angle|symmetry)\b/i.test(text)
}

export function inferScriptCategory(text: string) {
  const patterns: Array<[string, RegExp]> = [['eyes', /\b(eye|eyes|canthal|eyelid|lash)\b/i], ['brows', /\b(brow|brows|eyebrow)\b/i], ['jaw', /\b(jaw|jawline|chin|mandible)\b/i], ['nose', /\b(nose|nasal|nostril)\b/i], ['mouth', /\b(mouth|lip|lips)\b/i], ['cheeks', /\b(cheek|cheeks|cheekbone|cheekbones)\b/i], ['skin', /\b(skin|complexion|texture)\b/i], ['symmetry', /\b(symmetry|asymmetry|symmetric)\b/i], ['proportions', /\b(ratio|ratios|thirds|proportions|spacing)\b/i]]
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

function reportHeading(focus: string, report: ReportCategory | undefined, narration: string) {
  if (focus === 'hero') return 'Your face, mapped.'
  if (focus === 'scores') return 'Your overall evaluation.'
  if (focus === 'category-score') return `${report?.title ?? 'Your features'}, in detail.`
  if (focus === 'potential') return 'See your improvement potential.'
  if (focus === 'action-plan') return 'A plan built around you.'
  if (focus.startsWith('feature:')) {
    const id = focus.slice(8)
    return report?.features.find((feature, index) => (feature.id ?? String(index)) === id)?.label ?? shortHeading(narration)
  }
  return `${report?.title ?? 'Your features'}, explained.`
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
