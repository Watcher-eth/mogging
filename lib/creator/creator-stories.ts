import profileGuides from '@/public/creator/profile-guides.json'
import { profileStudySchema, profileFeatureForText, profileFeatureLabels, type ProfileStudy } from './video-profile'
import { narratedPortraitProgram } from './portrait-program'
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
import { scriptTokens, type VideoScript } from './video-script'
import type { SemanticBeat } from './video-semantics'

export const creatorSubjectAnalysisSchema = z.object({
  version: z.literal(1), subjectId: z.string(), subject: z.string(), analyzedAt: z.string(), provider: z.string(), model: z.string(), promptVersion: z.string(), scope: z.string(),
  source: z.object({ imageId: z.string(), sha256: z.string().length(64), width: z.number(), height: z.number() }),
  result: analysisProviderResultSchema, webReport: webReportSchema,
})
export type CreatorSubjectAnalysis = z.infer<typeof creatorSubjectAnalysisSchema>
type FeatureOpening = 'lip-choice' | 'jaw-choice' | 'jaw-width-choice' | 'smile-choice'
export type CreatorStoryOption = { id: string; title: string; kind?: 'feature-story' | 'score-walkthrough'; recording?: string; draft?: string; voice?: VoiceDirection; preview?: string; imageIds?: string[]; defaultLength?: 45 | 60; featureOpening?: FeatureOpening; directions?: Record<string, VideoDirection>; editorialRatings?: Array<{feature:string;score:number}> }
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
  return [{ id: story.id, title: story.title, kind: story.kind ?? 'feature-story', recording: story.recording, imageIds: story.imageIds, defaultLength: story.defaultLength, featureOpening: story.featureOpening, directions: story.directions, editorialRatings: story.editorialRatings }, ...story.alternatives ?? []]
    .toSorted((a, b) => Number(b.id === story.id) - Number(a.id === story.id) || Number(b.kind === 'score-walkthrough') - Number(a.kind === 'score-walkthrough'))
}
export async function loadCreatorStoryCatalog(subjectId: string): Promise<CreatorStory> {
  return readJson(`/creator/stories/${subjectId}/story.json`)
}
export async function loadCreatorStory(subjectId: string, storyId?: string) {
  const base = await loadCreatorStoryCatalog(subjectId)
  const stories = creatorStoryOptions(base)
  const option = stories.find(option => option.id === (storyId ?? stories[0]?.id))
  if (!option || Boolean(option.recording) === Boolean(option.draft)) throw new Error('Choose an available story for this person.')
  const story = { ...base, ...option, featureOpening: option.featureOpening, directions: option.directions, editorialRatings: option.editorialRatings, recording: option.recording, draft: option.draft, images: option.imageIds ? option.imageIds.map(id => { const image = base.images.find(image => image.id === id); if (!image) throw new Error('A story image is missing.'); return image }) : base.images }
  const [resource, analysis] = await Promise.all([readJson(option.recording ?? option.draft!), base.analysis ? readJson(base.analysis).then(value => creatorSubjectAnalysisSchema.parse(value)) : undefined])
  if (analysis && (analysis.subjectId !== subjectId || analysis.source.imageId !== base.images[0]?.id)) throw new Error('The saved analysis does not match this person’s source portrait.')
  if (option.draft && (resource.subjectId !== subjectId || resource.assessmentId !== analysis?.source.sha256)) throw new Error('Review this score story against the current saved portrait assessment before using it.')
  const saved = option.recording ? restoreProductionRecording(resource) : { script: validateProductionScript(resource.script), voice: voiceDirectionSchema.parse(option.voice), clips: new Map<string, SectionAudio>() }
  return { story, stories, assets: base.images, analysis, ...saved }
}

// Use only the saved provider observations: no preview values or guessed missing metrics.
export function creatorAnalysisReports(analysis: CreatorSubjectAnalysis): ReportCategory[] {
  const web = analysis.webReport
  const entries = new Map(web.entries.map(entry => [entry.id,entry]))
  const categories: ReportCategory[] = web.categories.map(category => {
    const id = category.id === 'face' ? 'face-shape' : category.id
    const group = buildWebRubricGroups(id, web.entries)[0]
    return { assessmentId: analysis.source.sha256, assessmentImageId: analysis.source.imageId, id, title: group?.title ?? id, subtitle: group?.title ?? id, scoreLabel: group?.title ?? id, score: category.score,
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
  const editorial = recipe === 'feature-study'
  const alternate = portraits.find(image => /three-quarter/.test(image.id)) ?? portraits.find(image => /profile/.test(image.id))
  const planningImages = portraits.length ? [...portraits, ...images.filter(image => !portraits.includes(image))] : images
  for (const shot of productionVisualPlan(script, input, planningImages, reports, recipe, variation)) {
    const authored = story.directions?.[shot.cue.sourceId]
    if (authored) {
      let portraitProgram = authored.portraitProgram
      if (portraitProgram) {
        const offset = shot.cue.text.indexOf(shot.beat.quote)
        const start = scriptTokens(shot.cue.text).filter(token => token.offset < offset).length
        const count = scriptTokens(shot.beat.quote).length
        const prior = portraitProgram.actions.findLast(action => action.word <= start)
        const actions = portraitProgram.actions.filter(action => action.word > start && action.word < start + count)
        portraitProgram = { wordCount: count, actions: [
          ...(prior ? [{ ...prior, word: 0, labelWord: 0 }] : []),
          ...actions.map(action => ({ ...action, word: action.word - start, labelWord: action.labelWord === undefined ? undefined : Math.max(0, Math.min(count - 1, action.labelWord - start)) })),
        ] }
      }
      directions[shot.id] = { portraitProgram: undefined, photoStudy: undefined, portraitFX: undefined, study: undefined, profileStudy: undefined, featureStudy: undefined, graphic: undefined, ...authored, ...(portraitProgram ? {portraitProgram} : {}) }
      continue
    }
    const cue = shot.cue.sourceId
    const requiresComparison = story.featureOpening === 'jaw-width-choice' && ['hook', 'proof', 'reveal'].includes(cue)
    if (story.featureOpening && (editorial || requiresComparison)) {
      const opening = story.featureOpening
      const [front, alternate] = images
      const jawWidth = opening === 'jaw-width-choice'
      const jaw = jawWidth || opening === 'jaw-choice'
      const categoryId = jaw ? 'jaw' : 'mouth'
      const base = { kind: 'portrait' as const, imageId: front.id, categoryId, overlay: 'none' as const, editorial: 'context' as const, portraitProgram: undefined, photoStudy: undefined, portraitFX: undefined, study: undefined, profileStudy: undefined, featureStudy: undefined, graphic: undefined }
      if (cue === 'score' || cue === 'close' || cue === 'closing-lead') {
        directions[shot.id] = { ...base, kind: 'report', closingReport: cue === 'close', focus: cue === 'score' ? 'scores' : 'features' }
      } else if (cue === 'hook' || cue === 'proof' || opening === 'smile-choice') {
        directions[shot.id] = { ...base, featureStudy: { topic: jaw ? 'jaw' : 'lips', layout: 'compare', edit: 0, editMode: 'warp', annotation: '', images: [jawWidth ? front.id : alternate.id], opening, phase: jaw && cue === 'proof' || opening === 'smile-choice' && cue === 'reveal' ? 'reveal' : opening === 'smile-choice' && cue === 'proof' ? 'clue' : 'hold' } }
      } else if (opening === 'lip-choice' && cue === 'evidence') {
        directions[shot.id] = { ...base, featureStudy: { editorial: true, topic: 'lips', layout: 'hero', edit: -1, editMode: 'photo', comparison: 'wipe', images: [alternate.id], annotation: 'Lip to chin', annotationStyle: 'leader', footnote: '' } }
      } else {
        const program = narratedPortraitProgram(shot.beat.quote, recipe, variation, jawWidth ? 'cheeks' : categoryId)
        if (jawWidth) program.actions = program.actions.map((action, index) => index === 0
          ? { ...action, feature: 'cheeks', guide: 'detail:under-cheekbones', treatment: 'ink-callout', stroke: 'dotted', label: 'Under the cheekbone' }
          : action)
        directions[shot.id] = { ...base, imageId: jaw ? alternate.id : front.id, portraitProgram: program }
      }
      continue
    }
    const visuals = shot.cue.section!.visuals
    const explicit = visuals.find(visual => visual.imageId && visual.match && shot.beat.quote.toLowerCase().includes(visual.match.toLowerCase())) ?? visuals.find(visual => visual.imageId && !visual.match)
    if (explicit?.imageId) {
      if (!images.some(image => image.id === explicit.imageId)) throw new Error('The approved shot references a missing image.')
      const assessed = explicit.imageId === images[0]?.id
      const scores = explicit.focus === 'scores' ? spokenScoreCallouts(shot.beat.quote, reports, explicit.categoryId) : undefined
      const categoryId = scores?.[0] ? reports.find(report => report.title === scores[0].label)?.id ?? explicit.categoryId : explicit.categoryId
      const kind = shot.cue.section!.role === 'takeaway' || visuals.some(visual => visual.crop) || explicit.crop || explicit.treatment === 'detail' || scores && scores.length > 1 ? 'portrait' : assessed && recipe === 'report-led' ? 'report' : 'portrait'
      const featureDetail = explicit.treatment === 'detail' || shot.cue.section!.role !== 'hook' &&
        shot.cue.section!.role !== 'takeaway' && shot.beat.feature !== 'whole' && ['observe', 'measure'].includes(shot.beat.intent)
      const storyInsert = ['compare', 'views'].includes(shot.beat.intent) || /\b(?:works? together|as part of|relationship|relative to)\b/i.test(shot.beat.quote)
      // Registered source photos own their identity and category. Never inherit a
      // synthetic edit or an unrelated comparison from the generic director.
      directions[shot.id] = {
        kind, imageId: explicit.imageId, categoryId, overlay: 'none', portraitCrop: explicit.crop,
        editorial: recipe === 'hybrid-story' && !explicit.crop && !scores?.length && storyInsert ? 'compare'
          : explicit.treatment === 'detail' || recipe === 'measurement-explainer' && !scores?.length && shot.beat.feature !== 'whole' ? 'detail' : 'context',
        focus: scores?.length ? 'scores' : kind === 'report' ? shot.direction.focus ?? 'features' : 'features', scoreCallouts: kind === 'portrait' ? scores ?? [] : undefined,
        emphasis: kind === 'report' ? 'section-lift' : undefined,
        featureStudy: recipe === 'feature-study' && kind === 'portrait' && !scores?.length && !explicit.crop && !visuals.some(visual => visual.crop)
          ? { editorial, topic: shot.beat.feature, edit: 0, editMode: 'warp', layout: featureDetail ? 'detail' : 'hero', motion: featureDetail && variation % 3 === 0 ? 'push' : variation % 2 ? 'pan-right' : 'pan-left', annotation: '', images: featureDetail && alternate && alternate.id !== explicit.imageId ? [explicit.imageId, alternate.id] : [] } : undefined,
        graphic: undefined, photoStudy: undefined, portraitFX: undefined, profileStudy: undefined, study: undefined, portraitProgram: undefined,
      }
      if (!/profile/.test(explicit.imageId)) {
        directions[shot.id].portraitProgram = narratedPortraitProgram(shot.beat.quote, recipe, variation, categoryId)
      }
      const view = /profile/.test(explicit.imageId) ? 'profile' : /three-quarter/.test(explicit.imageId) ? 'three-quarter' : undefined
      if (view && kind === 'portrait') {
        const authored = (profileGuides as Record<string, {dataUrl:string;side:ProfileStudy['side'];contours:ProfileStudy['contours'];angle?:ProfileStudy['angle']}>)[explicit.imageId]
        const image = images.find(image=>image.id===explicit.imageId)!
        const profile = profileStudySchema.parse({view,side:'left',...(authored?.dataUrl===image.dataUrl?{contours:authored.contours,angle:authored.angle,side:authored.side}:{}),feature:profileFeatureForText(shot.beat.quote,categoryId)})
        const program = narratedPortraitProgram(shot.beat.quote,recipe,variation,categoryId)
        const tokens=scriptTokens(shot.beat.quote)
        const actions = program?.actions.map((action,index)=>{
          const feature: ProfileStudy['feature'] = action.feature==='cheeks' ? action.guide.includes('under-') ? 'under-cheek' : 'cheek'
            : action.feature==='jaw' ? action.guide.includes('gonial') ? 'angle' : profile.feature==='chin' || /chin/i.test(tokens[action.word]?.text??'') ? 'chin' : 'jaw'
            : action.feature==='lips' ? 'lips' : action.feature==='eyes'||action.feature==='brows'||action.feature==='nose' ? action.feature : profile.feature
          return {...action,word:index===0?0:action.word,labelWord:action.word,guide:`profile:${feature}`,label:profileFeatureLabels[feature],stroke:'solid' as const}
        })
        directions[shot.id] = {...directions[shot.id],editorial:'context',featureStudy:undefined,portraitFX:undefined,profileStudy:profile,
          portraitProgram:program?{...program,view,actions:actions!}:undefined}
      }

      continue
    }
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
        featureStudy: { editorial, topic: evidence.topic, layout: reveal && editorial ? 'detail' : 'hero', editMode: 'photo', comparison: editorial ? 'wipe' : 'blend', motion: reveal ? 'push' : 'hold', edit: reveal ? evidence.revealEdit ?? 1 : 1, annotation: reveal && recipe === 'feature-study' ? evidence.revealLabel : '', images: [evidence.comparisonId], labels: ['A','B'], footnote: '' },
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
