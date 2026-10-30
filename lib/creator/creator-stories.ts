import { spokenScoreCallouts } from './spoken-score'
import { z } from 'zod'
import { reportTriangulation } from './report-triangulation'
import { isInstrumentGrid, reportScoreGrid } from './video-explainer'
import { restoreProductionRecording, productionVisualPlan, validateProductionScript, type SectionAudio } from './video-production'
import { buildWebRubricGroups } from '@/lib/analysis-v2/web-report'
import { webReportSchema } from '@/lib/analysis-v2/report-schema'
import { analysisProviderResultSchema } from '@/lib/analysis/schema'
import { voiceDirectionSchema, type VoiceDirection } from './video-speech'
import type { AnalysisPostInput } from './analysis-post'
import type { GeneratorImage } from './content-generator'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { VideoDirection, VideoRecipe } from './video-composition'
import type { VideoScript } from './video-script'
import type { SemanticBeat } from './video-semantics'

export const creatorSubjectAnalysisSchema = z.object({
  version: z.literal(1), subjectId: z.string(), subject: z.string(), analyzedAt: z.string(), provider: z.string(), model: z.string(), promptVersion: z.string(), scope: z.string(),
  source: z.object({ imageId: z.string(), sha256: z.string().length(64), width: z.number(), height: z.number() }),
  result: analysisProviderResultSchema, webReport: webReportSchema,
})
export type CreatorSubjectAnalysis = z.infer<typeof creatorSubjectAnalysisSchema>
export type CreatorStoryOption = { id: string; title: string; kind?: 'feature-story' | 'score-walkthrough'; recording?: string; draft?: string; voice?: VoiceDirection; preview?: string }
export type CreatorStory = CreatorStoryOption & {
  images: GeneratorImage[]; portraitImageIds?: string[]; analysis?: string; alternatives?: CreatorStoryOption[];
  evidence: { baselineId: string; comparisonId: string; topic: SemanticBeat['feature']; revealLabel: string; photoComparison?: boolean; revealEdit?: number }
}
async function readJson(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the saved creator resource (${response.status}).`)
  return response.json()
}
export function creatorStoryOptions(story: CreatorStory): CreatorStoryOption[] {
  return [{ id: story.id, title: story.title, kind: story.kind ?? 'feature-story', recording: story.recording }, ...story.alternatives ?? []]
}
export async function loadCreatorStoryCatalog(subjectId: string): Promise<CreatorStory> {
  return readJson(`/creator/stories/${subjectId}/story.json`)
}
export async function loadCreatorStory(subjectId: string, storyId?: string) {
  const base = await loadCreatorStoryCatalog(subjectId)
  const stories = creatorStoryOptions(base)
  const option = stories.find(option => option.id === (storyId ?? base.id))
  if (!option || Boolean(option.recording) === Boolean(option.draft)) throw new Error('Choose an available story for this person.')
  const story = { ...base, ...option, recording: option.recording, draft: option.draft }
  const [resource, analysis] = await Promise.all([readJson(option.recording ?? option.draft!), base.analysis ? readJson(base.analysis).then(value => creatorSubjectAnalysisSchema.parse(value)) : undefined])
  if (analysis && (analysis.subjectId !== subjectId || analysis.source.imageId !== base.images[0]?.id)) throw new Error('The saved analysis does not match this person’s source portrait.')
  if (option.draft && (resource.subjectId !== subjectId || resource.assessmentId !== analysis?.source.sha256)) throw new Error('Review this score story against the current saved portrait assessment before using it.')
  const saved = option.recording ? restoreProductionRecording(resource) : { script: validateProductionScript(resource.script), voice: voiceDirectionSchema.parse(option.voice), clips: new Map<string, SectionAudio>() }
  return { story, stories, analysis, ...saved }
}

// Use only the saved provider observations: no preview values or guessed missing metrics.
export function creatorAnalysisReports(analysis: CreatorSubjectAnalysis): ReportCategory[] {
  const web = analysis.webReport
  const entries = new Map(web.entries.map(entry => [entry.id,entry]))
  const categories: ReportCategory[] = web.categories.map(category => {
    const id = category.id === 'face' ? 'face-shape' : category.id
    const group = buildWebRubricGroups(id, web.entries)[0]
    return { assessmentId: analysis.source.sha256, id, title: group?.title ?? id, subtitle: group?.title ?? id, scoreLabel: group?.title ?? id, score: category.score,
      features: (group?.rubrics ?? []).map(feature => ({ ...feature, triangulation: reportTriangulation(feature.id,entries) })), explanation: category.explanation, recommendation: category.recommendation ?? '', ...(id === 'eyes' && web.eyeColor ? { eyeColor: web.eyeColor } : {}) }
  })
  const result = analysis.result
  const metrics = [
    ...(result.pslScore == null ? [] : [{ id: 'overall.psl', label: 'PSL score', value: `${result.pslScore.toFixed(1)} / 8`, visual: 'Orbit', positions: [result.pslScore/8], grade: null, scale: 'quality' as const }]),
    ...([['eyes','Eye area'],['jaw','Jaw & chin'],['cheeks','Cheekbone structure'],['proportions','Facial thirds'],['symmetry','Symmetry'],['skin','Skin quality']] as const).flatMap(([id,label]) => {
      const score = web.categories.find(category => category.id === id)?.score
      return score == null ? [] : [{ id: `overall.${id}`, label, value: `${score.toFixed(1)} / 10`, visual: id === 'jaw' ? 'Orbit' : 'Rail', positions: [score/10], grade: null, scale: 'quality' as const, triangulation: reportTriangulation(`overall.${id}`,entries) }]
    }),
  ]
  categories.push({ assessmentId: analysis.source.sha256, id: 'overall', title: 'Overall', subtitle: 'Saved front-photo assessment', scoreLabel: 'Overall Score', score: web.overallScore, explanation: web.summary, recommendation: '', features: metrics })
  return categories
}
export function creatorAnalysisInput(input: AnalysisPostInput, subject: string, analysis?: CreatorSubjectAnalysis): AnalysisPostInput {
  const categories = analysis?.webReport.categories.filter(c => c.id !== 'hair').toSorted((a,b) => b.score-a.score) ?? []
  const strongest = categories[0], opportunity = categories.at(-1)
  const potential = analysis?.result.report?.potential?.score
  const validPotential = potential !== undefined && analysis?.result.pslScore != null && potential >= analysis.result.pslScore && potential <= 8
  return { ...input, subject, overallScore: analysis ? String(analysis.webReport.overallScore) : '',
    potentialScore: validPotential ? String(potential) : '',
    potentialScale: validPotential ? 8 : undefined,
    potentialCurrentScore: analysis?.result.pslScore ?? undefined,
    strongestFeature: strongest?.id ?? '', strongestScore: strongest ? String(strongest.score) : '', opportunityFeature: opportunity?.id ?? '', opportunityScore: opportunity ? String(opportunity.score) : '' }
}

// Evidence bindings supplement the existing director; the selected format still owns layout.
export function creatorStoryDirections(story: CreatorStory, script: VideoScript, input: AnalysisPostInput, images: GeneratorImage[], reports: ReportCategory[], recipe: VideoRecipe, variation: number) {
  const directions: Record<string, VideoDirection> = {}, evidence = story.evidence
  const portraits = (story.portraitImageIds ?? []).flatMap(id => images.find(image => image.id === id) ?? [])
  const planningImages = portraits.length ? [...portraits, ...images.filter(image => !portraits.includes(image))] : images
  for (const shot of productionVisualPlan(script, input, planningImages, reports, recipe, variation)) {
    if (portraits.length) {
      directions[shot.id] = shot.direction
      // Wider context shots can vary; precise feature shots retain the registered close-up.
      if (shot.direction.kind === 'portrait' && shot.beat.feature === 'whole' && shot.beat.intent === 'context' && !shot.direction.featureStudy) {
        const section = script.cues.findIndex(cue => cue.sourceId === shot.cue.sourceId)
        directions[shot.id] = { ...shot.direction, imageId: portraits[(section + variation) % portraits.length].id }
      }
      // Scores remain attached to the original assessed photograph.
      if (shot.direction.kind === 'report' || shot.direction.kind === 'component') directions[shot.id] = { ...shot.direction, imageId: images[0]?.id }
    }
    if (story.kind === 'score-walkthrough') {
      // The authored category owns its number, even when a sentence names a neighbouring feature.
      const categoryId = shot.cue.section!.visuals[0].categoryId
      const report = reports.find(report => report.id === categoryId)
      if (!report?.assessmentId) throw new Error('Score walkthroughs need a saved assessment for each narrated category.')
      const spokenScores = spokenScoreCallouts(shot.beat.quote, reports, categoryId)
      let graphic = shot.direction.graphic && isInstrumentGrid(shot.direction.graphic) && !shot.direction.graphic.items.some(item => item.diagram)
        ? reportScoreGrid({ kind: 'report', categoryId, report, imageId: images[0]?.id ?? null, overlay: 'none', currentScore: Number(input.overallScore), potentialScore: 0, metricScore: report.score }, input, variation, shot.beat.quote)
        : shot.direction.graphic
      if (graphic && isInstrumentGrid(graphic) && !graphic.items.some(item => item.diagram) && spokenScores?.length) {
        graphic = { ...graphic, items: spokenScores.map((cue,index) => ({ id:`spoken-score-${index}`, label:cue.label, value:`${cue.value.toFixed(1)} / 10`, detail:'', role:'main' as const, metric:{ visual:'Rail', positions:[cue.value/10], scale:'quality' as const } })) }
      }
      const focus = shot.beat.quote.match(/\b(?:score|scores|gets?|seven|eight|nine|six|five)\b/i) || categoryId === 'overall' ? 'scores' : 'features'
      directions[shot.id] = recipe === 'report-led'
        ? { kind: 'report', imageId: images[0]?.id, categoryId, focus }
        : { ...directions[shot.id] ?? shot.direction, categoryId, graphic, featureStudy: shot.direction.featureStudy ? { ...shot.direction.featureStudy, edit: 0, layout: shot.direction.featureStudy.layout === 'detail' ? 'detail' : 'hero', images: [], editMode: 'warp' } : undefined, photoStudy: undefined, portraitFX: undefined }
      if (['portrait','component'].includes(directions[shot.id].kind)) {
        directions[shot.id] = { ...directions[shot.id], kind:'portrait', editorial: directions[shot.id].editorial ?? 'context', scoreCallouts: spokenScores ?? [] }
      }
      continue
    }
    const opening = shot.cue.sourceId === 'hook', reveal = shot.cue.sourceId === 'reveal'
    if ((opening || reveal) && ['portrait-audit','feature-study'].includes(recipe)) {
      directions[shot.id] = { kind: 'portrait', imageId: evidence.baselineId, editorial: opening ? 'context' : 'detail',
        featureStudy: { topic: evidence.topic, layout: reveal && recipe === 'feature-study' ? 'detail' : 'hero', editMode: 'photo', comparison: 'blend', motion: reveal ? 'push' : 'hold', edit: reveal ? evidence.revealEdit ?? 1 : 1, annotation: reveal && recipe === 'feature-study' ? evidence.revealLabel : '', images: [evidence.comparisonId], labels: ['A','B'], footnote: '' },
        photoStudy: undefined, portraitFX: undefined, profileStudy: undefined, study: undefined, portraitProgram: undefined }
    } else if (shot.direction.featureStudy?.layout === 'compare') {
      directions[shot.id] = { ...shot.direction, featureStudy: { ...shot.direction.featureStudy, layout: 'hero', comparison: 'blend' } }
    } else if (evidence.photoComparison) {
      directions[shot.id] = { ...shot.direction, photoStudy: undefined, portraitFX: undefined, imageId: variation % 2 && ['mechanism','consequence'].includes(shot.cue.sourceId) ? evidence.comparisonId : evidence.baselineId }
    }
  }
  // A curated image plan owns the complete treatment; do not inherit effects
  // from the default plan, whose image seed may choose a different primitive.
  if (portraits.length) return Object.fromEntries(Object.entries(directions).map(([id, direction]) => [id, {
    graphic: undefined, photoStudy: undefined, portraitFX: undefined, profileStudy: undefined,
    study: undefined, featureStudy: undefined, portraitProgram: undefined, ...direction,
  }]))
  return directions
}
