import { portraitInstruments, portraitInstrumentSchema, type PortraitInstrument } from './portrait-instruments'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { ProfileStudy } from './video-profile'
import { facialDetailGuides } from './facial-detail-guides'
import { featureStudySchema } from './feature-study'
import { faceMetricGuides } from './face-metric-guides'
import { portraitPrintStyles, type PortraitPrint } from './portrait-print'
import { arrangeVideoScenes, choreographVideoTransitions, createMotionTrack, parseComposition, type VideoComposition, type VideoScene, retimeVideoScene } from './video-composition'
import { reportScoreGrid, explainerGraphicSchema } from './video-explainer'
import { glassOverlaySchema, portraitLightingSchema } from './video-portrait-effects'
import { metricTimelineStyles } from './metric-timeline'
import { reportCategories } from './mock-report-data'
import { buildCategoryActionPlan } from './mobile-overlay-engine/category-action-plan'
import type { ExplainerGraphic } from './video-explainer'
import type { AnalysisPostInput } from './analysis-post'

export const slideCategories = ['All layouts', 'Portraits', 'App reports', 'Graphics'] as const
export const portraitTreatments = ['Face guides', 'Lighting', 'Filters', 'Particles & tracking'] as const
export type PortraitTreatment = typeof portraitTreatments[number]
export type SlideCategory = typeof slideCategories[number]
type Slide = { id: string; label: string; detail: string; kind: 'portrait' | 'closeup' | 'measurement' | 'report' | 'grid' | 'feature' | 'lighting' | 'comparison' | 'graphic' | 'study' | 'profile' | 'print' | 'instrument'; categoryId?: string; metricId?: string; focus?: string; variant?: number; layout?: ExplainerGraphic['layout']; operation?: 'planes' | 'contour' | 'compare' | 'recap'; preset?: string; profileFeature?: ProfileStudy['feature'] }
const featureTitles: Record<string, string> = { eyes: 'Eye', brows: 'Brow', nose: 'Nose', cheeks: 'Cheek', jaw: 'Jaw', mouth: 'Lip', symmetry: 'Symmetry', proportions: 'Facial proportion' }
export const customSlides: readonly Slide[] = [
  { id: 'portrait', label: 'Whole-face guides', detail: 'A centered portrait shows guides for the segment’s main facial feature.', kind: 'portrait' },
  { id: 'closeup', label: 'Feature close-up', detail: 'The camera moves into the facial feature discussed in this segment.', kind: 'closeup' },
  { id: 'feature', label: 'Annotated feature card', detail: 'A large photo crop shows the relevant feature with its outline highlighted.', kind: 'feature' },
  { id: 'measurement', label: 'Portrait with score ruler', detail: 'A large portrait sits above a ruler showing one report measurement.', kind: 'measurement' },
  ...['eyes', 'brows', 'nose', 'cheeks', 'jaw', 'mouth', 'symmetry', 'proportions'].map(categoryId => ({ id: `overlay-${categoryId}`, label: `${featureTitles[categoryId]} guides`, detail: `Guides highlight ${categoryId === 'symmetry' ? 'the relationship between both sides of the face' : categoryId === 'proportions' ? 'the proportions between facial features' : 'the ' + categoryId + ' in the photograph'}.`, kind: 'portrait' as const, categoryId })),
  ...faceMetricGuides.map(metric => ({ id: `metric-${metric.id}`, label: metric.label, detail: metric.detail, kind: 'portrait' as const, categoryId: metric.category, metricId: metric.id })),
  ...(['jaw', 'cheek', 'angle', 'nose', 'lips', 'chin'] as const).map(profileFeature => ({ id: `profile-${profileFeature}`, label: { jaw: 'Jaw contour', cheek: 'Cheek contour', angle: 'Jaw turn', nose: 'Nose profile', lips: 'Lip profile', chin: 'Chin contour' }[profileFeature], detail: `One clean guide follows the detected ${profileFeature === 'angle' ? 'change in jaw direction' : profileFeature + ' landmarks'} on the visible side of the face.`, kind: 'profile' as const, profileFeature })),
  ...(['planes', 'contour', 'compare', 'recap'] as const).map(operation => ({ id: `study-${operation}`, label: { planes: 'Facial surface regions', contour: 'Contour tracing', compare: 'Floating feature details', recap: 'Face detail mosaic' }[operation], detail: { planes: 'Outlined regions highlight the visible cheek and jaw surfaces.', contour: 'Animated guides trace the face’s visible contours.', compare: 'Small annotated crops float beside a larger portrait to compare features.', recap: 'Three photo sections separate and reconnect into one portrait.' }[operation], kind: 'study' as const, operation })),
  ...[{ id: 'report', label: 'Scores and overview', focus: 'scores' }, { id: 'report-hero', label: 'Portrait header', focus: 'hero' }, { id: 'report-features', label: 'Feature measurements', focus: 'features' }, { id: 'report-potential', label: 'Potential score', focus: 'potential' }, { id: 'report-actions', label: 'Recommended next steps', focus: 'action-plan' }].map(item => ({ ...item, detail: { scores: 'The report scrolls to its headline scores and category overview.', hero: 'The report opens on its full-width portrait and headline scores.', features: 'The report scrolls to its feature cards and measurement gauges.', potential: 'The report scrolls to the potential score and improvement section.', 'action-plan': 'The report scrolls to the category’s recommended actions.' }[item.focus]!, kind: 'report' as const })),
  { id: 'grid', label: 'Automatic gauge style', detail: 'Three score tiles use a gauge style selected for the segment.', kind: 'grid' },
  ...metricTimelineStyles.map((style, variant) => ({ id: `timeline-${variant}`, label: variant === 0 ? 'Native report grid' : `Feature selection ${variant + 1}`, detail: 'Up to three supported measurements use their native app card and chart styles.', kind: 'grid' as const, variant })),
  ...['lighting', 'rim', 'split'].map(preset => ({ id: preset, label: preset === 'lighting' ? 'Sculpted side light' : preset === 'rim' ? 'Rim lighting' : 'Split monochrome', detail: preset === 'rim' ? 'A narrow rim of light highlights the portrait’s outer contours.' : preset === 'split' ? 'Monochrome split lighting separates the bright and shaded sides of the face.' : 'Directional light reveals the cheek and jaw contours in the portrait.', kind: 'lighting' as const, preset })),
  ...portraitInstruments.map(effect => ({ id: effect.id, label: effect.label, detail: effect.detail, kind: 'instrument' as const })),
  ...portraitPrintStyles.map(({ id, label, detail }) => ({ id: `print-${id}`, label, detail, kind: 'print' as const, preset: id })),
  { id: 'comparison', label: 'Segment’s main feature', detail: 'A reversible shape edit compares the segment’s main feature with its original appearance.', kind: 'comparison' },
  { id: 'edit-natural-freckles', label: 'Soft freckle texture', detail: 'Irregular translucent freckles develop across the nose and upper cheeks while retaining the original skin texture.', kind: 'comparison', categoryId: 'skin' },
  { id: 'edit-facial-thirds', label: 'Lower-third balance', detail: 'Detected brow, nose-base and chin distances drive a small reversible lower-face adjustment, capped at 2% of eye spacing.', kind: 'comparison', categoryId: 'proportions' },
  { id: 'edit-facial-width', label: 'Cheek-to-jaw balance', detail: 'A restrained reversible edit compares detected cheek and jaw widths without changing the eyes, nose or skin texture.', kind: 'comparison', categoryId: 'proportions' },
  ...['nose', 'cheeks', 'jaw', 'mouth', 'eyes', 'brows'].map(categoryId => ({ id: `edit-${categoryId}`, label: `${featureTitles[categoryId]} shape`, detail: `A reversible edit compares the ${categoryId} with their original appearance.`, kind: 'comparison' as const, categoryId })),
  ...(['comparison', 'scale', 'dial', 'calendar', 'story', 'constellation', 'pillars', 'sequence', 'evidence'] as const).map(layout => ({ id: `graphic-${layout}`, label: { comparison: 'Strength and opportunity', scale: 'Single score ruler', dial: 'Single score dial', calendar: 'Weekly overview', story: 'Anatomy reference', constellation: 'Feature map', pillars: 'Category score tiles', sequence: 'Action checklist', evidence: 'Feature count' }[layout], detail: { comparison: 'Two stacked score cards compare a strong feature and an improvement opportunity.', scale: 'One report score appears on a graduated measurement ruler.', dial: 'One report score appears in an animated circular gauge.', calendar: 'An empty seven-day calendar shows a week without assuming a routine.', story: 'A single illustrative 3D skull provides an anatomy reference.', constellation: 'An animated dot map represents the number of features in the report.', pillars: 'Three category scores appear together in one large tile and two smaller tiles.', sequence: 'A short checklist presents the category’s recommended next steps.', evidence: 'An animated count shows how many features appear in the report.' }[layout], kind: 'graphic' as const, layout })),
]
function templateId(slide: Slide) {
  if (slide.kind === 'instrument' || slide.kind === 'portrait' || slide.kind === 'print' || slide.kind === 'lighting' || slide.kind === 'profile' || (slide.kind === 'study' && ['planes', 'contour'].includes(slide.operation!))) return 'portrait'
  if (slide.kind === 'grid' || slide.layout === 'pillars') return 'grid'
  if (slide.kind === 'report' || slide.kind === 'comparison') return slide.kind
  return slide.id
}
export function portraitTreatment(slide: Slide): PortraitTreatment {
  return slide.kind === 'instrument' ? 'Particles & tracking' : slide.kind === 'lighting' ? 'Lighting' : slide.kind === 'print' ? 'Filters' : 'Face guides'
}

const templateCopy: Record<string, { label: string; detail: string; optionTitle: string; optionNoun: string }> = {
  portrait: { label: 'Full-face portrait', detail: 'Show a centered portrait with your choice of face guides or lighting.', optionTitle: 'Choose a portrait look', optionNoun: 'looks' },
  report: { label: 'Scrolling app report', detail: 'Show the mobile report and scroll to the section you choose.', optionTitle: 'Choose the report section', optionNoun: 'sections' },
  grid: { label: 'Score tile grid', detail: 'Compare three report values in one large tile and two smaller tiles.', optionTitle: 'Choose the gauge style', optionNoun: 'gauge styles' },
  comparison: { label: 'Portrait edits', detail: 'Compare subtle shape adjustments or add natural-looking skin detail.', optionTitle: 'Choose an edit', optionNoun: 'edits' },
}
export const customSlideTemplates = customSlides.reduce<Array<{ id: string; label: string; detail: string; category: SlideCategory; optionTitle: string; optionNoun: string; options: Slide[] }>>((templates, slide) => {
  const id = templateId(slide)
  const existing = templates.find(template => template.id === id)
  if (existing) existing.options.push(slide)
  else templates.push({ id, category: id === 'report' ? 'App reports' : slide.kind === 'graphic' || slide.kind === 'grid' ? 'Graphics' : 'Portraits', ...(templateCopy[id] ?? { label: slide.label, detail: slide.detail, optionTitle: 'Choose a variation', optionNoun: 'options' }), options: [slide] })
  return templates
}, [])
export type CustomSlideId = string

export function customSlideId(scene: VideoScene): CustomSlideId {
  const authored = customSlides.find(slide => slide.id === scene.customSlideId) ?? customSlides.find(slide => slide.label === scene.label)
  if (authored) return authored.id
  const metricId = `metric-${scene.focus.slice(7)}`
  if (scene.focus.startsWith('metric:') && customSlides.some(slide => slide.id === metricId)) return metricId
  if (scene.portraitFX?.instrument) return portraitInstruments.find(effect => JSON.stringify(portraitInstrumentSchema.parse(effect.settings)) === JSON.stringify(scene.portraitFX!.instrument))?.id ?? 'instrument-custom'
  if (scene.portraitFX?.print) return `print-${scene.portraitFX.print}`
  if (scene.profileStudy) return `profile-${scene.profileStudy.feature}`
  if (scene.photoStudy) return 'comparison'
  if (scene.portraitFX?.lighting) return 'lighting'
  if (scene.source.kind === 'report' || scene.source.kind === 'screen') return 'report'
  if (scene.source.kind === 'component') return 'measurement'
  if (scene.graphic) return scene.graphic.items.some(item => item.diagram) ? 'feature' : 'grid'
  return scene.editorial === 'detail' || scene.study?.operation === 'inspect' ? 'closeup' : 'portrait'
}

export const customClipPreviewTime = (scene: VideoScene) => scene.startMs + Math.min(600, scene.durationMs * .35)

export function replaceCustomSlide(composition: VideoComposition, sceneId: string, slideId: CustomSlideId, input: AnalysisPostInput, reports: ReportCategory[] = reportCategories): VideoComposition {
  const slide = customSlides.find(item => item.id === slideId)
  if (!slide) throw new Error('Unknown slide')
  const imageId = composition.scenes.find(scene => scene.source.imageId)?.source.imageId ?? null
  const scenes = composition.scenes.map(scene => {
    if (scene.id !== sceneId) return scene
    const category = slide.categoryId ?? scene.source.categoryId
    const report = slide.categoryId ? reports.find(item => item.id === category) ?? scene.source.report : scene.source.report
    const feature = ['eyes', 'brows'].includes(category) ? 'eyes' : category === 'nose' ? 'nose' : category === 'mouth' ? 'lips' : category === 'cheeks' ? 'cheeks' : 'jaw'
    const image = scene.source.imageId ?? imageId
    const next: VideoScene = { ...scene, customSlideId: slide.id, label: slide.label, graphic: undefined, study: undefined, photoStudy: undefined, profileStudy: undefined, featureStudy: undefined, portraitProgram: undefined, portraitFX: undefined,
      source: { ...scene.source, kind: 'portrait', imageId: image, secondaryImageId: null, overlay: 'category', categoryId: category, report, metricScore: report?.score ?? scene.source.metricScore }, editorial: 'context', framing: 'captioned', layout: 'portrait', focus: 'hero',
      tracks: [createMotionTrack('crossfade', 'content', scene.durationMs)] }
    if (slide.kind === 'portrait' && scene.source.kind === 'portrait' && scene.portraitFX?.print) next.portraitFX = { print: scene.portraitFX.print }
    if (slide.metricId) {
      next.focus = `metric:${slide.metricId}`; next.editorial = 'detail'
      const guide = facialDetailGuides.find(guide => guide.id === slide.metricId)
      if (guide) next.portraitProgram = { wordCount: Math.max(1,scene.words?.length ?? 1), actions: [{ word: 0, feature: category === 'mouth' ? 'lips' : category === 'proportions' || category === 'face-shape' ? 'whole' : feature, guide: guide.id, stroke: guide.stroke, treatment: 'trace', label: guide.label }] }
    }
    if (slide.kind === 'closeup') { next.editorial = 'detail'; if (['overall', 'symmetry', 'proportions', 'face-shape'].includes(category)) next.source.categoryId = 'jaw' }
    if (slide.kind === 'measurement') {
      next.source.kind = 'component'
      const metric = scene.source.report?.features.find(item => item.visual && item.visual !== 'Text')
      next.focus = metric ? `feature:${metric.id ?? 0}` : 'category-score'
    }
    if (slide.kind === 'report') { next.source.kind = 'report'; next.source.overlay = 'none'; next.editorial = undefined; next.framing = 'full'; next.focus = slide.focus ?? 'scores'; next.tracks.push({ ...createMotionTrack('scroll-to-section', 'report', scene.durationMs), section: next.focus }) }
    if (slide.kind === 'grid' || slide.kind === 'feature') {
      next.graphic = slide.kind === 'grid' ? { ...reportScoreGrid(next.source, input, slide.variant ?? 0), timelineStyle: slide.variant } : explainerGraphicSchema.parse({ layout: 'pillars', tone: 'light', items: [{ id: 'feature', label: scene.source.report?.title ?? 'Feature detail', diagram: feature === 'eyes' ? 'orbits' : feature === 'nose' ? 'nasal' : feature === 'lips' ? 'expression' : feature === 'cheeks' ? 'width' : 'contour' }] })
    }
    if (slide.kind === 'print') {
      if (scene.source.kind === 'portrait') return { ...scene, customSlideId: slide.id, label: slide.label, portraitFX: { ...scene.portraitFX, print: slide.preset as PortraitPrint } }
      next.portraitFX = { print: slide.preset as PortraitPrint }
    }
    if (slide.kind === 'instrument') {
      next.portraitFX = { instrument: portraitInstrumentSchema.parse(portraitInstruments.find(effect => effect.id === slide.id)!.settings) }; next.source.overlay = 'none'
      if (slide.id === 'specimen-frame' && scene.source.kind === 'portrait' && !scene.featureStudy && !scene.study && !scene.photoStudy && !scene.profileStudy) return { ...scene, customSlideId: slide.id, label: slide.label, portraitFX: { ...scene.portraitFX, ...next.portraitFX } }
    }
    if (slide.kind === 'lighting') next.portraitFX = { overlay: glassOverlaySchema.parse({}), lighting: portraitLightingSchema.parse({ target: feature === 'jaw' ? 'jaw' : 'cheeks', ambientEv: -.7, intensity: 1.5, ...(slide.preset === 'rim' ? { preset: 'rim' } : slide.preset === 'split' ? { preset: 'split', color: 'split-mono' } : {}) }) }
    if (slide.kind === 'comparison') next.photoStudy = { feature: category === 'brows' ? 'brows' : feature, mode: 'stretch', axis: 'x', amount: .12, cursor: true }
    if (slide.kind === 'profile') {
      const profile = composition.scenes.map(item => item.source.imageId).find(id => id && /profile/.test(id))
        ?? composition.scenes.map(item => item.source.imageId).find(id => id && /three-quarter|angle/.test(id))
        ?? image
      next.source.imageId = profile
      next.profileStudy = { view: profile && /profile/.test(profile) ? 'profile' : 'three-quarter', side: 'left', feature: slide.profileFeature! }
    }
    if (slide.kind === 'study') {
      next.study = { id: `custom-${scene.id}`, operation: slide.operation!, references: ['cheeks', 'jaw', 'mouth'].map((categoryId, index) => ({ id: `detail-${index}`, imageId: image!, categoryId, label: ['Upper frame', 'Lower contour', 'Expression'][index] })), activeId: 'detail-0' }
      next.portraitFX = { overlay: glassOverlaySchema.parse({ regions: slide.operation === 'planes' }) }
    }
    if (['edit-natural-freckles','edit-facial-thirds','edit-facial-width'].includes(slide.id)) {
      next.photoStudy = undefined; next.portraitFX = undefined; next.editorial = 'context'
      next.featureStudy = featureStudySchema.parse({ topic: slide.id === 'edit-natural-freckles' ? 'freckles' : 'whole', layout: 'hero', editMode: 'warp', edit: .85, motion: 'hold', adjustment: slide.id === 'edit-facial-thirds' ? 'thirds' : slide.id === 'edit-facial-width' ? 'width' : undefined, footnote: '' })
      if (next.featureStudy.adjustment) next.portraitProgram = { wordCount: Math.max(1,scene.words?.length ?? 1), actions: [{ word: 0, feature: 'whole', guide: next.featureStudy.adjustment === 'thirds' ? 'detail.facial-thirds' : 'proportions.width-hierarchy', stroke: 'dashed', treatment: 'trace', label: next.featureStudy.adjustment === 'thirds' ? 'Facial divisions' : 'Width relationships' }] }
    }
    if (slide.kind === 'graphic') {
      const scores = reportScoreGrid(next.source, input).items
      const count = report?.features.length ?? 0
      const items = slide.layout === 'comparison' ? scores.slice(0, 2) : slide.layout === 'pillars' ? scores : slide.layout === 'sequence' ? (report ? buildCategoryActionPlan(report).items : []).slice(0, 4).map((label, index) => ({ id: `step-${index}`, label })) : [{ id: 'main', label: slide.layout === 'calendar' ? 'Weekly routine' : slide.layout === 'constellation' || slide.layout === 'evidence' ? 'Features in this report' : report?.title ?? 'Overall', value: ['constellation', 'evidence'].includes(slide.layout!) ? String(count) : next.source.currentScore.toFixed(1), detail: ['scale', 'dial'].includes(slide.layout!) ? '/ 10' : '' }]
      next.graphic = explainerGraphicSchema.parse({ layout: slide.layout, tone: 'light', items, ...(slide.layout === 'calendar' ? { days: [] } : {}), ...(slide.layout === 'constellation' ? { count } : {}), ...(slide.layout === 'story' ? { anatomy: { focus: 'whole', action: 'focus' } } : {}) })
    }
    if (next.graphic) { next.source.kind = 'explainer'; next.source.overlay = 'none'; next.source.secondaryImageId = image; next.editorial = undefined }
    return next
  })
  return parseComposition(choreographVideoTransitions({ ...composition, scenes }))
}

export function moveCustomClip(composition: VideoComposition, fromId: string, toId: string): VideoComposition {
  const from = composition.scenes.findIndex(scene => scene.id === fromId), to = composition.scenes.findIndex(scene => scene.id === toId)
  if (from < 0 || to < 0 || from === to) return composition
  const fromCue = composition.scenes[from].scriptRange?.cueId, toCue = composition.scenes[to].scriptRange?.cueId
  const modular = fromCue !== toCue && composition.script?.cues.find(cue => cue.id === fromCue)?.section && composition.script?.cues.find(cue => cue.id === toCue)?.section
  const moving = modular ? composition.scenes.filter(scene => scene.scriptRange?.cueId === fromCue) : [composition.scenes[from]]
  const scenes = composition.scenes.filter(scene => !moving.includes(scene))
  const target = scenes.findIndex(scene => scene.id === toId)
  const insertion = from < to ? modular ? scenes.findLastIndex(scene => scene.scriptRange?.cueId === toCue) + 1 : target + 1 : target
  scenes.splice(insertion, 0, ...moving)
  return choreographVideoTransitions(arrangeVideoScenes(composition, scenes))
}


export function customLibraryComposition(composition: VideoComposition, sceneId: string, input: AnalysisPostInput, slides: readonly Slide[], reports: ReportCategory[] = reportCategories) {
  const durationMs = Math.min(2000, Math.floor(180000 / Math.max(1, slides.length)))
  const scenes = slides.map(slide => {
    const scene = replaceCustomSlide(composition, sceneId, slide.id, input, reports).scenes.find(scene => scene.id === sceneId)!
    return { ...retimeVideoScene(scene, durationMs), id: slide.id }
  })
  return arrangeVideoScenes(composition, scenes)
}


export function updatePortraitInstrument(composition: VideoComposition, sceneId: string, patch: Partial<PortraitInstrument>, input: AnalysisPostInput, reports?: ReportCategory[]) {
  const selected = composition.scenes.find(scene => scene.id === sceneId)
  if (!selected) return composition
  const ordinary = selected.source.kind === 'portrait' && !selected.featureStudy && !selected.study && !selected.photoStudy && !selected.profileStudy
  const base = ordinary ? composition : replaceCustomSlide(composition, sceneId, 'portrait', input, reports)
  const instrument = portraitInstrumentSchema.parse({ ...selected.portraitFX?.instrument, ...patch })
  const preset = portraitInstruments.find(effect => JSON.stringify(portraitInstrumentSchema.parse(effect.settings)) === JSON.stringify(instrument))
  return parseComposition({ ...base, scenes: base.scenes.map(scene => scene.id === sceneId ? { ...scene, customSlideId: preset?.id ?? 'instrument-custom', label: preset?.label ?? 'Custom layers', portraitFX: { ...scene.portraitFX, instrument } } : scene) })
}
