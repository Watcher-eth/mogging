import { planPortraitProgram, portraitAnnotation } from './portrait-program'
import { decodeVisualSection, validateSemanticSection, type SemanticBeat, type SemanticSection } from './video-semantics'
import { scriptVisualSeed, type ScriptSection } from './video-script'
import { reportScoreGrid } from './video-explainer'
import { profileFeatureForText } from './video-profile'
import type { VideoDirection, VideoRecipe } from './video-composition'
import type { GeneratorImage } from './content-generator'
import type { AnalysisPostInput } from './analysis-post'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { FeatureStudy, FeatureTopic } from './feature-study'

export const visualPrimitiveLabels = {
  portrait: 'Whole portrait', detail: 'Feature close-up', callout: 'Drawn feature callout', measurement: 'Anchored measurement', component: 'Focused app measurement',
  edit: 'Reversible shape edit', compare: 'Registered before & after', wipe: 'Before & after wipe', grid: 'Portrait to four-view grid',
  profile: 'Side-profile outline', lighting: 'Lighting demonstration', report: 'App report', 'report-grid': 'Category timeline grid',
} as const
export type VisualPrimitive = keyof typeof visualPrimitiveLabels
export type VisualDecision = { primitive: VisualPrimitive; feature: SemanticBeat['feature']; intent: SemanticBeat['intent']; quote: string; reason: string; missing: string[]; alternatives: VisualPrimitive[] }
export type DirectedBeat = { beat: SemanticBeat; direction: VideoDirection; decision: VisualDecision }
const topicFeatures = ['philtrum', 'freckles', 'facial-hair', 'ears', 'symmetry', 'dimorphism'] as const
const isTopic = (feature: string): feature is FeatureTopic => (topicFeatures as readonly string[]).includes(feature)
const categoryFor: Record<SemanticBeat['feature'], string> = { whole: 'overall', philtrum: 'mouth', freckles: 'skin', 'facial-hair': 'jaw', ears: 'face-shape', symmetry: 'symmetry', dimorphism: 'face-shape', eyes: 'eyes', brows: 'eyes', nose: 'nose', lips: 'mouth', jaw: 'jaw', cheeks: 'cheeks' }
// A format owns its visual vocabulary; meaning and available evidence still own the subject.
const grammar: Record<VideoRecipe, VisualPrimitive[]> = {
  'portrait-audit': ['portrait', 'callout', 'detail', 'wipe', 'profile', 'compare', 'measurement', 'grid'],
  'report-led': ['report', 'report-grid', 'measurement', 'detail', 'portrait', 'callout'],
  'measurement-explainer': ['component', 'measurement', 'detail', 'callout', 'edit', 'compare', 'profile', 'portrait'],
  'hybrid-story': ['grid', 'compare', 'wipe', 'callout', 'detail', 'portrait', 'report-grid'],
  'minimal-explainer': ['portrait', 'measurement', 'detail', 'compare', 'callout', 'report-grid'],
  'feature-study': ['callout', 'detail', 'wipe', 'edit', 'compare', 'grid', 'profile', 'portrait'],
}
export function sectionMeaning(section: ScriptSection, text: string, fallback: SemanticBeat['feature']): SemanticSection {
  if (section.semantic?.sourceText === text) return validateSemanticSection(section.semantic, text)
  return decodeVisualSection(text, fallback)
}
export function directVisualBeats(section: ScriptSection, text: string, recipe: VideoRecipe, images: GeneratorImage[], reports: ReportCategory[], input: AnalysisPostInput, variant: number, history: VisualDecision[], fallback: SemanticBeat['feature'] = 'whole', amount = 1): DirectedBeat[] {
  const meaning = sectionMeaning(section, text, fallback)
  const original = images.find(image => /front/.test(image.id) && !/-study-/.test(image.id)) ?? images.find(image => !/-study-/.test(image.id))
  const angled = images.find(image => /three-quarter|angle/.test(image.id) && !/-study-/.test(image.id))
  const profile = images.find(image => /profile/.test(image.id) && !/-study-/.test(image.id))
  return meaning.beats.map(raw => {
    const beat = raw.confidence < .7 && meaning.decoder === 'model-v1' ? { ...raw, intent: 'observe' as const, operation: 'none' as const } : raw
    const seed = scriptVisualSeed(original?.id ?? input.subject, recipe, beat.quote)
    const authored = section.visuals.find(visual => visual.styles?.includes(recipe)) ?? section.visuals[0]
    const categoryId = beat.feature === 'whole' ? authored.categoryId : categoryFor[beat.feature]
    const topic = isTopic(beat.feature) ? beat.feature : undefined
    const edited = images.findLast(image => image.retouch?.feature === beat.feature && image.retouch.baselineImageId === original?.id && (beat.operation === 'none' || image.retouch.operation === beat.operation))
    const studyTopic = topic ?? (recipe === 'feature-study' || edited ? beat.feature : undefined)
    const texture = topic === 'freckles' || topic === 'facial-hair'
    // A bundled added beard/freckles is not evidence of removal or ear replacement.
    const validOperation = !['add', 'remove', 'replace'].includes(beat.operation) || texture && beat.operation === 'add'
    // Generic scaling cannot demonstrate a translated/arched brow, symmetry alignment or an expression.
    const specificShape = /\b(?:smil\w*|expression)\b/i.test(beat.quote) || beat.feature === 'brows' && /\b(?:arch\w*|raise\w*|lift\w*|moves? up|moves? down|higher|lower)\b/i.test(beat.quote)
    const genericShape = ['eyes', 'brows', 'nose', 'lips', 'jaw', 'cheeks'].includes(beat.feature) && ['shorten', 'lengthen', 'widen', 'narrow'].includes(beat.operation) && !specificShape
    const supportedEdit = Boolean(edited) || validOperation && (topic ? !texture || Boolean(edited) || topic === 'freckles' && beat.operation === 'add' : genericShape)
    const missing: string[] = []
    if ((beat.intent === 'edit' || beat.intent === 'compare') && !supportedEdit) missing.push(`A registered ${beat.operation === 'none' ? 'edited' : beat.operation} ${beat.feature} portrait is needed; show the original instead.`)
    if (beat.view === 'profile' && !profile) missing.push('A side-profile photo is needed.')
    if (beat.view === 'three-quarter' && !angled) missing.push('A three-quarter photo is needed.')
    let eligible: VisualPrimitive[]
    if (section.role === 'cta' || section.role === 'product' || beat.intent === 'report') eligible = section.role === 'product' ? [authored.treatment === 'grid' ? 'report-grid' : 'report'] : /\b(?:categories|grid|across features|overview|together)\b/i.test(beat.quote) && section.role !== 'cta' ? ['report-grid', 'report'] : ['report']
    else if (section.role === 'takeaway') eligible = ['portrait']
    else if (beat.intent === 'context') eligible = ['portrait', 'detail']
    else if (beat.intent === 'lighting') eligible = ['lighting']
    else if (beat.intent === 'views') eligible = profile && beat.view === 'profile' ? ['profile'] : ['portrait']
    else if (beat.intent === 'edit') eligible = supportedEdit ? topic ? ['edit', 'wipe', 'compare'] : ['edit'] : ['portrait', 'detail']
    else if (beat.intent === 'compare') eligible = supportedEdit && topic ? /\b(?:side by side|beside each other|both versions together)\b/i.test(beat.quote) ? ['compare', 'wipe'] : ['wipe', 'detail', 'portrait'] : ['portrait', 'detail']
    else if (beat.intent === 'measure') eligible = topic ? ['callout', 'detail', 'measurement'] : ['measurement', 'detail']
    else eligible = topic ? ['portrait', 'detail', 'callout'] : ['portrait', 'detail', 'measurement']
    if (recipe === 'report-led' && ['observe', 'measure'].includes(beat.intent)) eligible.push('report', 'report-grid')
    const measured = [input.overallScore, input.strongestScore, input.opportunityScore].some(value => value?.trim())
    const illustrative = !['edit', 'compare', 'lighting', 'views'].includes(beat.intent) && !['takeaway', 'cta', 'product'].includes(section.role)
    if (illustrative && recipe === 'report-led') eligible = ['report', 'report-grid', 'component']
    if (illustrative && recipe === 'measurement-explainer') eligible = beat.feature === 'whole' ? ['portrait', 'component'] : ['component', 'measurement']
    if (illustrative && recipe === 'hybrid-story') eligible.push('grid')
    if (!measured && eligible.some(primitive => ['report', 'report-grid', 'component'].includes(primitive))) missing.push('App preview only: no measured subject scores were supplied.')
    if (history.slice(history.findLastIndex(item => item.primitive === 'grid')).reduce((ms, item) => ms + item.quote.split(/\s+/).length / 165 * 60000, 0) < 16000 && history.some(item => item.primitive === 'grid')) eligible = eligible.filter(item => item !== 'grid')
    const dimensional = /\b(?:width|ratio|spacing|symmetr\w*|front\w*|paired|both)\b/i.test(beat.quote)
    const alternateContour = beat.intent === 'observe' && beat.view === 'front' && !dimensional && ['jaw', 'cheeks', 'facial-hair'].includes(beat.feature)
    if (alternateContour && profile && beat.feature === 'jaw' && /\b(?:contour|outline|border|edge|jawline)\b/i.test(beat.quote) && ['portrait-audit', 'hybrid-story'].includes(recipe)) eligible.push('profile')
    const last = history.at(-1), previous = history.at(-2)
    const annotatedDetail = ['brows','eyes','lips','nose'].includes(beat.feature) && Boolean(portraitAnnotation(beat.quote,beat.feature))
    const ranked = eligible.map(primitive => ({ primitive, score: (annotatedDetail && primitive === 'detail' ? 3 : 0) + (grammar[recipe].includes(primitive) ? Math.max(0, 4 - Math.floor(grammar[recipe].indexOf(primitive) / 2)) : 0) - (last?.primitive === primitive ? 3 : 0) - (previous?.primitive === primitive && last?.primitive === primitive ? 8 : 0) }))
    const best = Math.max(...ranked.map(item => item.score)), alternatives = ranked.filter(item => item.score >= best - 2).map(item => item.primitive)
    const primitive = alternatives[(seed + variant) % alternatives.length]
    let image = primitive === 'profile' ? profile ?? original : beat.view === 'profile' ? profile ?? original : beat.view === 'three-quarter' ? angled ?? original : original
    if (primitive !== 'profile' && beat.intent !== 'views' && (topic || primitive === 'edit' || primitive === 'lighting' || primitive === 'measurement')) image = original
    if (primitive === 'portrait' && alternateContour && angled && (seed + variant) % 2) image = angled
    if (primitive === 'portrait' && beat.feature === 'whole' && beat.view === 'front' && angled && seed % 2) image = angled
    const base: VideoDirection = { kind: 'portrait', imageId: image?.id, categoryId, editorial: primitive === 'detail' || primitive === 'measurement' ? 'detail' : 'context', focus: authored.focus }
    let direction = base
    if (primitive === 'report') {
      const features = reports.find(report => report.id === categoryId)?.features ?? []
      const named = features.find(feature => beat.quote.toLowerCase().includes(feature.label.toLowerCase()))
      direction = { ...base, kind: 'report', focus: section.role === 'cta' && measured ? 'scores' : named ? `feature:${named.id ?? features.indexOf(named)}` : authored.focus ?? 'features', emphasis: 'section-lift' }
    } else if (primitive === 'component') direction = { ...base, kind: 'component', focus: authored.focus?.startsWith('feature:') ? authored.focus : 'features' }
    else if (primitive === 'grid' && original) {
      const categories = beat.feature === 'whole' || beat.feature === 'symmetry' ? ['eyes', 'mouth', 'jaw'] : [categoryId ?? categoryFor[beat.feature], categoryFor[beat.feature] === 'eyes' ? 'brows' : 'face-shape']
      direction = { ...base, study: { id: `evidence-${seed}`, operation: 'recap', references: categories.map((categoryId, index) => ({ id: `detail-${index}`, imageId: original.id, categoryId, label: reports.find(report => report.id === categoryId)?.title ?? 'Facial detail' })) } }
    } else if (primitive === 'report-grid') {
      const category = reports.find(report => report.id === categoryId)
      const graphic = reportScoreGrid({ kind: 'report', imageId: image?.id ?? null, categoryId, report: category?.assessmentId ? category : undefined, overlay: 'none', currentScore: Number(input.overallScore) || 0, potentialScore: 0, metricScore: category?.score ?? 0 }, input, (seed + variant) % 12, beat.quote)
      direction = { ...base, kind: 'explainer', graphic }
    }
    else if (primitive === 'profile') direction = { ...base, profileStudy: { view: 'profile', side: 'left', feature: profileFeatureForText(beat.quote, categoryId) }, editorial: 'compare' }
    else if (primitive === 'lighting') direction = { ...base, portraitFX: { lighting: { preset: /\b(?:soft|softer|frontal|diffuse|even)\b/i.test(beat.quote) && !/\bside\b/i.test(beat.quote) ? 'soft' : 'split', target: 'whole', side: seed % 2 ? 'left' : 'right', lightX: seed % 2 ? -.7 : .7, lightY: -.4, radius: 1.5, intensity: 1.5, ambientEv: -.65, depth: 1.2, color: 'natural' } } }
    else if (studyTopic && original && image?.id === original.id && primitive !== 'measurement' && (topic || primitive !== 'edit')) {
      const layout: FeatureStudy['layout'] = primitive === 'grid' ? 'grid' : primitive === 'compare' ? 'compare' : primitive === 'detail' || primitive === 'callout' ? 'detail' : 'hero'
      // Positive philtrum drag increases length; a shortening reverses that displacement.
      const sign = ['shorten', 'narrow'].includes(beat.operation) ? -1 : 1
      const edit = ['edit', 'compare', 'wipe', 'grid'].includes(primitive) && supportedEdit ? sign * amount : 0
      direction = { ...base, focus: 'hero', featureStudy: { topic: studyTopic, layout, edit, motion: primitive === 'detail' ? (['hold', 'push', 'pull'] as const)[(seed + variant) % 3] : primitive === 'portrait' ? (seed % 2 ? 'pull' : 'hold') : 'hold', annotationStyle: primitive === 'callout' ? 'leader' : primitive === 'detail' ? 'guide' : 'circle', annotation: primitive === 'callout' || primitive === 'detail' ? studyTopic.replace('-', ' ') : '', editMode: edited ? 'photo' : 'warp', comparison: primitive === 'wipe' ? 'wipe' : 'blend', images: [edited?.id ?? original!.id, angled?.id ?? original!.id, profile?.id ?? original!.id] } }
    } else if (primitive === 'edit') direction = { ...base, photoStudy: { feature: beat.feature as 'eyes' | 'brows' | 'nose' | 'lips' | 'jaw' | 'cheeks', mode: 'stretch', axis: /\b(?:width|wide\w*|narrow\w*|broader)\b/i.test(beat.quote) ? 'x' : ['shorten', 'lengthen'].includes(beat.operation) || /\b(?:thick\w*|thin\w*|height|fuller)\b/i.test(beat.quote) ? 'y' : 'x', amount: (['shorten', 'narrow', 'remove'].includes(beat.operation) ? -.055 : .055) * amount, cursor: false } }
    if (direction.kind === 'portrait' && !direction.featureStudy && !direction.study) direction.portraitProgram = planPortraitProgram(beat.quote, beat.feature, recipe, variant + seed, image?.id === profile?.id && profile ? 'profile' : image?.id === angled?.id && angled ? 'three-quarter' : beat.view)
    const decision = { primitive, feature: beat.feature, intent: beat.intent, quote: beat.quote, reason: `${beat.rationale}${direction.portraitProgram ? ` ${direction.portraitProgram.actions.length} linked visual actions follow the narration.` : ''}`, missing, alternatives }
    history.push(decision)
    return { beat, direction, decision }
  })
}
