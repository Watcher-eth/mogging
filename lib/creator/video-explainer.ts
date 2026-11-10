import { z } from 'zod'
import { narratedFaceMetric } from './face-metric-guides'
import { reportFeatureSchema, type ReportFeature, type ReportCategory } from './mobile-overlay-engine/report-data'
import { drawFeatureCard, mockFeatureLayout } from './mock-report'
import type { CanvasPainter, CanvasRect } from './canvas-layout'
import type { VideoScene } from './video-composition'
import { videoSize, videoContent, captionDesign, elementEntrance, smoothMotion } from './video-layout'
import { drawRollingNumber, rollingNumberWidth } from './rolling-number'
import type { AnalysisPostInput } from './analysis-post'
import { buildCategoryActionPlan } from './mobile-overlay-engine/category-action-plan'
import { primitiveDefinition, primitiveProgress, sampleMotionPrimitive } from './motion-primitives'
import { sampleAppearance } from './motion-presets'
import { drawFaceTreatment } from './video-face-treatment'
import { defaultGlassOverlay } from './video-portrait-effects'
import { studyReferenceCrop, type StudyReference } from './video-editorial-study'
import { drawMetricTimeline, metricTimelineVariant, metricTimelineStyles } from './video-timeline'
import { anatomyStageFrame, type AnatomyRegistration, type AnatomyRenderer } from './video-anatomy'

export const explainerLayouts = ['statement', 'comparison', 'scale', 'dial', 'dashboard', 'calendar', 'story', 'constellation', 'pillars', 'sequence', 'evidence'] as const
export const graphicItemLimit = (layout: typeof explainerLayouts[number]) => layout === 'statement' ? 0 : layout === 'dashboard' ? 3 : ['scale', 'dial', 'calendar', 'story', 'constellation', 'evidence'].includes(layout) ? 1 : 6
export const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const fullWeekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const explainerGraphicSchema = z.object({
  layout: z.enum(explainerLayouts), tone: z.enum(['light', 'ink', 'paper']).default('light'), variant: z.number().int().min(0).max(11).default(0),
  items: z.array(z.object({ id: z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/, 'Graphic IDs use letters, numbers, underscores or hyphens'), label: z.string().max(160), value: z.string().max(1000).default(''), detail: z.string().max(240).default(''), role: z.enum(['main', 'context']).default('main'), metric: reportFeatureSchema.omit({ label: true, value: true }).optional(), diagram: z.enum(['width', 'taper', 'contour', 'expression', 'orbits', 'nasal', 'symmetry', 'profile']).optional() }).strict()).max(6),
  timelineStyle: z.number().int().min(0).max(metricTimelineStyles.length - 1).optional(),
  count: z.number().int().min(0).max(128).optional(), footnote: z.string().max(240).default(''),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  anatomy: z.object({ focus: z.enum(['whole', 'jaw', 'orbits', 'cheeks', 'nasal']).default('whole'), action: z.enum(['reveal', 'focus', 'isolate', 'cutaway']).default('focus'), deformation: z.number().finite().min(-.5).max(.5).optional(), highlight: z.enum(['tint', 'outline', 'none']).optional() }).strict().optional(),
}).strict().superRefine((graphic, context) => {
  if (new Set(graphic.items.map(item => item.id)).size !== graphic.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Graphic item IDs must be unique' })
  if (graphic.items.length > graphicItemLimit(graphic.layout)) context.addIssue({ code: 'custom', path: ['items'], message: 'Too many items for this graphic layout' })
  if (graphic.layout === 'sequence' && graphic.items.filter(item => item.role === 'context').length > 2) context.addIssue({ code: 'custom', path: ['items'], message: 'A sequence supports at most two context cards' })
  if (graphic.days && new Set(graphic.days).size !== graphic.days.length) context.addIssue({ code: 'custom', path: ['days'], message: 'Weekdays must be unique' })
})
export type ExplainerGraphic = z.infer<typeof explainerGraphicSchema>
export function continuesGraphicItem(previous: ExplainerGraphic | undefined, graphic: ExplainerGraphic, id: string) {
  const before = previous?.items.find(item => item.id === id), after = graphic.items.find(item => item.id === id)
  return Boolean(before && after && before.label === after.label && before.value === after.value && before.detail === after.detail && before.diagram === after.diagram)
}
function metricGridItem(feature: ReportFeature, index: number): ExplainerGraphic['items'][number] {
  const { label, value, ...metric } = feature
  return { id: `metric-${index}-${feature.id ?? label}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0,60), label, value, metric, detail: '', role: 'main' }
}
export function reportScoreGrid(source: VideoScene['source'], input: AnalysisPostInput, variant = 0, narration = ''): ExplainerGraphic {
  const features = source.report?.features.filter(feature => feature.value.trim()) ?? []
  // A named metric leads; variation chooses other supported rows from the same report.
  const spokenMetric = narratedFaceMetric(narration, source.report?.id)
  const named = features.filter(feature => feature.id === spokenMetric?.id || narration.toLowerCase().includes(feature.label.toLowerCase()))
  const remaining = features.filter(feature => !named.includes(feature))
  const offset = remaining.length ? variant % remaining.length : 0
  const selected = [...named, ...remaining.slice(offset), ...remaining.slice(0,offset)].slice(0,3)
  const explicit = [
    { label: input.strongestFeature || 'Eye area', value: input.strongestScore },
    { label: input.opportunityFeature || 'Jaw & chin', value: input.opportunityScore },
    { label: 'Overall', value: input.overallScore },
  ].filter(item => item.value?.trim() && Number.isFinite(Number(item.value)) && Number(item.value) >= 0 && Number(item.value) <= 10)
    .map((item,index) => metricGridItem({ id: `score-${index}`, label: item.label, value: `${Number(item.value).toFixed(1)} / 10`, visual: 'Orbit', positions: [Number(item.value)/10], grade: null, scale: 'quality' },index))
  const items = selected.length ? selected.map(metricGridItem) : source.report?.assessmentId ? [metricGridItem({ id: source.report.id, label: source.report.scoreLabel, value: `${source.report.score.toFixed(1)} / 10`, visual: 'Orbit', positions: [source.report.score/10], scale: 'quality' },0)] : explicit.length ? explicit : [metricGridItem({ label: 'No saved report results', value: '', visual: 'Text' },0)]
  return explainerGraphicSchema.parse({ layout: 'dashboard', tone: 'light', variant: variant % 12, items, footnote: selected.length || explicit.length || source.report?.assessmentId ? '' : 'Measurements unavailable for this photo' })
}

export function graphicMetricFeature(item: ExplainerGraphic['items'][number]): ReportFeature {
  if (item.metric) return { ...item.metric, label: item.label, value: item.value }
  if (isReportScore(item)) return { label: item.label, value: `${item.value} / 10`, visual: 'Orbit', positions: [Number(item.value)/10], scale: 'quality' }
  return { label: item.label, value: item.value || (/^\/\s*\d+$/.test(item.detail) ? '' : item.detail), visual: 'Text' }
}

// Restore missing metadata in older saved grids from the actual attached report.
export function resolveReportGraphic(graphic: ExplainerGraphic, report?: ReportCategory): ExplainerGraphic {
  if (!isInstrumentGrid(graphic) || !report?.assessmentId || graphic.items.every(item => item.metric || item.diagram)) return graphic
  return { ...graphic, items: graphic.items.map(item => {
    if (item.diagram || item.metric) return item
    const feature = report.features.find(feature => feature.id === item.id || feature.label.toLowerCase() === item.label.toLowerCase())
    if (!feature) return item
    const { label: _label, value, ...metric } = feature
    return { ...item, value: item.value.trim() ? item.value + (isReportScore(item) ? ' / 10' : '') : value, metric, detail: '' }
  }) }
}

function nativeGrid(graphic: ExplainerGraphic) {
  return isInstrumentGrid(graphic) && !graphic.items.some(item => item.diagram) ? mockFeatureLayout({ features: graphic.items.map(graphicMetricFeature) }) : undefined
}

export function scriptGraphic(narration: string, source: VideoScene['source'], input: AnalysisPostInput, variation: number, index: number, previous?: ExplainerGraphic): ExplainerGraphic {
  const count = narration.match(/\b(\d{1,3})[- ]+(points?|measurements?|categories?|features?|steps?|weeks?)\b/i)
  const comparison = /\b(versus|vs|strongest|weakest|strength|opportunity)\b/i.test(narration) || /\bcompar(?:e|ison)\b/i.test(narration) && (/\b(features?|eyes?|jaw|scores?)\b/i.test(narration) || previous?.layout === 'comparison')
  const sequence = /\b(routine|protocol|steps?|weeks?)\b/i.test(narration)
  const score = /\b(score|rating|range|scale|number)\b/i.test(narration)
  const regroup = previous?.layout === 'constellation' && /\b(groups?|split|divide|regroup)\b/i.test(narration)
  const frequency = narration.match(/\b([1-7])\s+days?\b/i)
  const days = weekDays.flatMap((day, index) => new RegExp(`\\b(?:${day}|${fullWeekDays[index]})\\b`, 'i').test(narration) ? [index] : [])
  const calendar = /\b(week|weekly|routine|schedule)\b/i.test(narration) && (frequency || days.length)
  const story = /\b(anatomy|anatomical|skull|bones?|mandible|zygomatic)\b/i.test(narration)
  const studies: Array<{ match: RegExp; id: string; label: string; detail: string; diagram: NonNullable<ExplainerGraphic['items'][number]['diagram']> }> = [
    { match: /\b(width|wide|wider|broad|cheeks?|upper frame)\b/i, id: 'width', label: 'Width', detail: 'The space occupied by the upper frame', diagram: 'width' },
    { match: /\b(taper|narrows?|chin|lower frame)\b/i, id: 'taper', label: 'Lower frame', detail: 'How the outline resolves toward the chin', diagram: 'taper' },
    { match: /\b(contours?|borders?|boundar\w*|definition|edges?|jaw)\b/i, id: 'contour', label: 'Contour', detail: 'The visible border and its definition', diagram: 'contour' },
    { match: /\b(eyes?|eyelids?|brows?|orbital|orbits?)\b/i, id: 'orbits', label: 'Eye area', detail: 'The eye sockets within the upper frame', diagram: 'orbits' },
    { match: /\b(nose|nasal)\b/i, id: 'nasal', label: 'Central frame', detail: 'The nasal region in context', diagram: 'nasal' },
    { match: /\b(symmetry|bilateral|balance|relationships?|proportions)\b/i, id: 'symmetry', label: 'Relationships', detail: 'The features in the context of the whole', diagram: 'symmetry' },
    { match: /\b(profile|perspective|angle|distance)\b/i, id: 'profile', label: 'Perspective', detail: 'A reference view of the facial framework', diagram: 'profile' },
    { match: /\b(expression|smil\w*|lips?|mouth|softness)\b/i, id: 'expression', label: 'Expression', detail: 'Soft tissue in the supplied photograph', diagram: 'expression' },
  ]
  const diagrams = studies.filter(study => study.match.test(narration) && (study.diagram !== 'expression' || source.imageId || source.secondaryImageId)).slice(0, 1)
  if (!score && !count && !calendar && !sequence && !story && !comparison && diagrams.length) return explainerGraphicSchema.parse({
    layout: 'pillars', tone: 'light', variant: 0,
    items: diagrams.map(({ id, label, detail, diagram }) => ({ id, label, detail, diagram })),
  })
  const scoreLayout = (variation + index) % 3
  const layout: ExplainerGraphic['layout'] = regroup ? 'constellation' : calendar ? 'calendar' : comparison ? 'comparison' : story ? 'story' : sequence ? 'sequence' : count ? variation % 2 || Number(count[1]) > 128 ? 'evidence' : 'constellation' : score ? scoreLayout === 2 ? 'dial' : scoreLayout === 1 ? 'evidence' : 'scale' : /\b(categories|pillars|features|eyes|jaw|symmetry)\b/i.test(narration) ? 'pillars' : 'statement'
  const item = (id: string, label: string, value = '', detail = '') => ({ id, label, value, detail })
  const items = regroup ? previous!.items : layout === 'calendar' ? [item('primary', 'Your weekly routine', String(frequency ? Number(frequency[1]) : days.length), 'days per week')]
    : layout === 'story' ? [item('primary', 'Facial structure', '', 'Illustrative anatomy · not inferred from your photo')]
    : layout === 'comparison' ? [item('primary', input.strongestFeature || 'Strength', input.strongestScore, '/ 10'), item('secondary', input.opportunityFeature || 'Opportunity', input.opportunityScore, '/ 10')]
    : layout === 'sequence' ? [...(previous && ['comparison', 'dashboard'].includes(previous.layout) ? previous.items.slice(0, 2).map(item => ({ ...item, role: 'context' as const })) : []), ...(source.report ? buildCategoryActionPlan(source.report).items : []).concat(input.productFeatures).slice(0, 4).map((text, index) => item(`step-${index}`, text))]
    : layout === 'pillars' ? reportScoreGrid(source, input).items
    : layout === 'statement' ? [] : [item('primary', count ? count[2] : source.report?.title ?? 'Overall score', count ? count[1] : source.metricScore.toFixed(1), count ? '' : '/ 10')]
  if (layout === 'statement') return previous ?? explainerGraphicSchema.parse({ layout: 'pillars', tone: 'light', items: [{ id: 'context', label: 'Whole-face context', detail: 'Illustrative reference · relationships before isolated features', diagram: 'profile' }] })
  const dashboard = ['comparison', 'pillars', 'evidence'].includes(layout) && !count && items.every(isReportScore)
  const dashboardItems = items.length === 1 && dashboard ? [...items, item('strength', input.strongestFeature || 'Eye area', input.strongestScore, '/ 10'), item('opportunity', input.opportunityFeature || 'Jaw & chin', input.opportunityScore, '/ 10')] : items
  return explainerGraphicSchema.parse({ layout: dashboard ? 'dashboard' : layout, tone: dashboard ? 'light' : story && !comparison ? 'ink' : variation % 4 >= 2 ? 'ink' : 'light', variant: regroup ? previous!.variant : (variation + index) % 12, items: dashboard ? dashboardItems : items, days: layout === 'calendar' ? days : undefined,
    count: layout === 'constellation' ? count ? Number(count[1]) : previous?.count : undefined, anatomy: layout === 'story' ? { focus: source.categoryId === 'jaw' ? 'jaw' : 'whole', action: 'focus' } : undefined, footnote: layout === 'constellation' ? 'Illustrative feature map · not a study population' : '' })
}
const font = '"Mogging Share", Arial, sans-serif'
export const explainerPalette = (tone: ExplainerGraphic['tone']) => tone === 'ink'
  ? { paper: '#101215', ink: '#f4f7fa', muted: '#9ca7b4', surface: '#181d23', line: '#303944', accent: '#79cfff' }
  : tone === 'paper' ? { paper: '#f7f5ef', ink: '#242b30', muted: '#81898d', surface: '#fcfbf7', line: '#dcded9', accent: '#4ca6cc' }
  : { paper: '#fff', ink: '#11151a', muted: '#76808b', surface: '#f8fafc', line: '#e1e8ee', accent: '#32b1ed' }

export const explainerCaptionFrame = { x: 0, y: captionDesign.top, width: videoSize.width, height: 460 } as const
const isReportScore = (item: Pick<ExplainerGraphic['items'][number], 'value' | 'detail'>) => /^\d+(?:\.\d+)?$/.test(item.value) && Number(item.value) <= 10 && /^\/\s*10$/.test(item.detail)
export const isPhotoReference = (graphic?: ExplainerGraphic) => Boolean(graphic && ['dashboard', 'comparison', 'pillars'].includes(graphic.layout) && graphic.items.length === 1 && graphic.items[0].diagram)
export const isInstrumentGrid = (graphic: ExplainerGraphic) => ['dashboard', 'comparison', 'pillars'].includes(graphic.layout)
export const explainerTone = (graphic: ExplainerGraphic) => isInstrumentGrid(graphic) ? 'light' : graphic.tone

export function sameInstrumentGrid(previous: ExplainerGraphic | undefined, graphic: ExplainerGraphic | undefined) {
  if (!previous || !graphic || !isInstrumentGrid(previous) || !isInstrumentGrid(graphic) || previous.items.length !== graphic.items.length) return false
  return graphic.items.every(item => continuesGraphicItem(previous, graphic, item.id) && previous.items.find(before => before.id === item.id)?.role === item.role)
}

export function stableInstrumentGrid(graphic: ExplainerGraphic, previous?: ExplainerGraphic): ExplainerGraphic {
  return sameInstrumentGrid(previous, graphic) ? { ...graphic, layout: previous!.layout, tone: previous!.tone, variant: previous!.variant, items: previous!.items.map(item => graphic.items.find(next => next.id === item.id)!) } : graphic
}

export function explainerTextHeight(ctx: CanvasRenderingContext2D, text: string, graphic: ExplainerGraphic) {
  if (!text) return explainerCaptionFrame.height
  const size = graphic.layout === 'story' ? 72 : 76
  ctx.save(); ctx.font = `400 ${size}px ${font}`
  const height = Math.min(explainerCaptionFrame.height, Math.max(120, lines(ctx, text, captionDesign.width).length * size * captionDesign.lineHeight + 24))
  ctx.restore(); return height
}

export function explainerLayout(graphic: ExplainerGraphic, captionHeight: number = explainerCaptionFrame.height): { headline: CanvasRect; items: CanvasRect[] } {
  const layout = explainerContentLayout(graphic)
  if (isPhotoReference(graphic)) {
    const top = explainerCaptionFrame.y + captionHeight + 48, bottom = videoSize.height - 220
    return { headline: explainerCaptionFrame, items: [{ x: captionDesign.inset, y: top, width: captionDesign.width, height: Math.max(1, bottom - top) }] }
  }
  if (!layout.items.length) return layout
  const left = Math.min(...layout.items.map(item => item.x)), right = Math.max(...layout.items.map(item => item.x + item.width))
  const top = Math.min(...layout.items.map(item => item.y)), bottom = Math.max(...layout.items.map(item => item.y + item.height))
  const scale = Math.min((videoSize.height - 268 - explainerCaptionFrame.y - captionHeight) / (bottom - top), videoContent.width / (right - left))
  const center = (explainerCaptionFrame.y + captionHeight + videoSize.height - 220) / 2
  return { headline: explainerCaptionFrame, items: layout.items.map(item => ({ x: videoSize.width / 2 + (item.x - (left + right) / 2) * scale, y: center + (item.y - (top + bottom) / 2) * scale, width: item.width * scale, height: item.height * scale })) }
}

const instrumentBounds: Partial<Record<ExplainerGraphic['layout'], { width: number; height: number; top: number }>> = {
  dial: { width: 840, height: 970, top: 0 },
  calendar: { width: 840, height: 860, top: 70 },
  story: { width: 840, height: 933, top: 0 },
}

function explainerContentLayout(graphic: ExplainerGraphic): { headline: CanvasRect; items: CanvasRect[] } {
  const count = Math.max(1, graphic.items.length), context = graphic.items.filter(item => item.role === 'context').length
  const headline = explainerCaptionFrame
  const native = nativeGrid(graphic)
  if (native) return { headline, items: native.tiles.map(tile => ({ x: 60 + (tile.x - 18) * 960 / 354, y: tile.top * 960 / 354, width: tile.width * 960 / 354, height: tile.height * 960 / 354 })) }
  if (isInstrumentGrid(graphic)) {
    const illustrated = graphic.items.some(item => item.diagram)
    if (count === 1) return { headline, items: [{ x: 60, y: 0, width: 960, height: illustrated ? 1480 : 800 }] }
    if (count === 2) {
      const height = illustrated ? 660 : 500
      return { headline, items: graphic.items.map((_, index) => ({ x: 60, y: index * (height + 24), width: 960, height })) }
    }
    if (count === 3) {
      let column = 0
      const height = illustrated ? 600 : 470
      return { headline, items: graphic.items.map((_, index) => index === 0 ? { x: 60, y: 0, width: 960, height } : { x: 60 + column++ * 492, y: height + 24, width: 468, height: illustrated ? 660 : 550 }) }
    }
    return { headline, items: graphic.items.map((_, index) => ({ x: 60 + index % 2 * 492, y: Math.floor(index / 2) * 574, width: 468, height: 550 })) }
  }
  if (graphic.layout === 'evidence') return { headline, items: graphic.items.map(() => ({ x: 90, y: 0, width: 900, height: 430 })) }
  if (graphic.layout === 'sequence') {
    let contextIndex = 0, stepIndex = 0
    const steps = Math.max(1, graphic.items.length - context)
    const pitch = Math.min(200, (context ? 620 : 940) / steps), height = Math.min(180, pitch - 20)
    return { headline, items: graphic.items.map(item => item.role === 'context'
      ? { x: 90 + contextIndex++ * 460, y: 0, width: context === 1 ? 840 : 420, height: 420 }
      : { x: 90, y: (context ? 484 : 0) + stepIndex++ * pitch, width: 900, height }) }
  }
  if (graphic.layout === 'statement') return { headline, items: [] }
  const instrument = instrumentBounds[graphic.layout]
  if (instrument) return { headline, items: graphic.items.map(() => ({ x: 120, y: 0, width: instrument.width, height: instrument.height })) }
  return { headline, items: [{ x: 90, y: 0, width: 900, height: graphic.layout === 'constellation' ? 900 : graphic.layout === 'scale' ? 960 : 650 }] }
}

function lines(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const result: string[] = []
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const last = result.at(-1)
    if (!last || ctx.measureText(`${last} ${word}`).width > width) result.push(word)
    else result[result.length - 1] += ` ${word}`
  }
  return result
}

type GraphicPart = (id: string, label: string, frame: CanvasRect, draw: (ctx: CanvasRenderingContext2D) => void) => void

function graphicValue(ctx: CanvasRenderingContext2D, value: string, width: number, size: number, amount: number, color: string) {
  ctx.font = `400 ${size}px ${font}`
  while (ctx.measureText(value).width > width - 8 && size > 32) ctx.font = `400 ${--size}px ${font}`
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const digits = value.split('.')[1]?.length ?? 0
    drawRollingNumber(ctx, Number(value), digits, (width - rollingNumberWidth(ctx, value)) / 2, size * .85, size, amount)
  } else ctx.fillText(value, width / 2, 0)
}

function drawInstrument(graphic: ExplainerGraphic, item: ExplainerGraphic['items'][number], part: GraphicPart, amount: number, anatomy?: AnatomyRenderer, timeMs = 0, durationMs = 1, reduced = false, registration?: AnatomyRegistration) {
  const registered = registration?.frame
  if (!['dial', 'calendar', 'story'].includes(graphic.layout)) return false
  const palette = explainerPalette(graphic.tone)
  const label = (id: string, value: string, y: number, size = 34, color = palette.ink) => part(id, value, { x: 20, y, width: 800, height: 100 }, ctx => {
    ctx.font = `500 ${size}px ${font}`
    while (lines(ctx, value, 800).length * size * 1.25 > 100 && size > 12) ctx.font = `500 ${--size}px ${font}`
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    lines(ctx, value, 800).forEach((line, index) => ctx.fillText(line, 400, index * size * 1.25))
  })
  if (graphic.layout === 'dial') {
    const score = Math.max(0, Math.min(10, parseFloat(item.value) || 0)), start = Math.PI * .75, end = Math.PI * 2.25
    part('visual', 'Calibrated score dial', { x: 60, y: 0, width: 720, height: 750 }, ctx => {
      const wash = ctx.createRadialGradient(360, 360, 210, 360, 360, 330)
      wash.addColorStop(0, palette.paper); wash.addColorStop(.75, palette.surface); wash.addColorStop(1, palette.paper)
      ctx.fillStyle = wash; ctx.beginPath(); ctx.arc(360, 360, 330, 0, Math.PI * 2); ctx.fill()
      for (let tick = 0; tick <= 80; tick++) {
        const angle = start + (end - start) * tick / 80, active = tick / 80 <= score / 10 * amount
        ctx.strokeStyle = active ? palette.accent : palette.muted; ctx.lineWidth = tick % 5 ? 1.8 : 2.5
        const inner = tick % 5 ? 303 : 290
        ctx.beginPath(); ctx.moveTo(360 + Math.cos(angle) * inner, 360 + Math.sin(angle) * inner); ctx.lineTo(360 + Math.cos(angle) * 326, 360 + Math.sin(angle) * 326); ctx.stroke()
      }
      ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(360, 360, 265, start, end); ctx.stroke()
    })
    part('needle', 'Score needle', { x: 60, y: 0, width: 720, height: 750 }, ctx => {
      const angle = start + (end - start) * score / 10 * amount
      ctx.strokeStyle = palette.ink; ctx.fillStyle = palette.paper; ctx.lineWidth = 6; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(360, 360); ctx.lineTo(360 + Math.cos(angle) * 250, 360 + Math.sin(angle) * 250); ctx.stroke()
      ctx.beginPath(); ctx.arc(360, 360, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    })
    part('value', 'Measured value', { x: 120, y: 445, width: 600, height: 160 }, ctx => graphicValue(ctx, item.value, 600, 132, amount, palette.ink))
    label('label', item.label, 750)
    label('detail', item.detail || '/ 10', 805, 28, palette.muted)
    part('position', 'Score position strip', { x: 140, y: 920, width: 560, height: 50 }, ctx => {
      ctx.fillStyle = palette.surface; ctx.beginPath(); ctx.roundRect(0, 0, 560, 50, 25); ctx.fill()
      ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.roundRect(0, 0, Math.max(50, 560 * score / 10 * amount), 50, 25); ctx.fill()
      ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.arc(Math.max(25, 560 * score / 10 * amount - 25), 25, 14, 0, Math.PI * 2); ctx.fill()
    })
  } else if (graphic.layout === 'calendar') {
    part('surface', 'Calendar body', { x: 180, y: 70, width: 480, height: 550 }, ctx => { ctx.fillStyle = '#11151a'; ctx.beginPath(); ctx.roundRect(0, 0, 480, 550, 62); ctx.fill() })
    part('page', 'Calendar page', { x: 186, y: 170, width: 468, height: 444 }, ctx => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 444); gradient.addColorStop(0, '#e9edf3'); gradient.addColorStop(.35, '#fff'); gradient.addColorStop(1, '#fafbfc')
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(0, 0, 468, 444, 54); ctx.fill()
      ctx.strokeStyle = '#dce1e7'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 110); ctx.lineTo(468, 110); ctx.stroke()
      ctx.fillStyle = '#11151a'; ctx.font = `500 34px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Days', 234, 56)
    })
    part('binding', 'Calendar binding', { x: 350, y: 85, width: 140, height: 70 }, ctx => {
      ctx.strokeStyle = '#535a62'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(70, 60, 47, Math.PI, Math.PI * 2); ctx.stroke()
    })
    part('value', 'Routine frequency', { x: 210, y: 325, width: 420, height: 210 }, ctx => graphicValue(ctx, item.value, 420, 190, amount, '#11151a'))
    label('label', item.label, 710)
    label('detail', `${item.value} ${item.detail || 'days per week'}`, 770, 28, palette.muted)
    weekDays.forEach((day, index) => part(`day:${index}`, day, { x: 40 + index * 110, y: 860, width: 100, height: 70 }, ctx => {
      const selected = graphic.days?.includes(index)
      ctx.fillStyle = selected ? palette.ink : palette.surface; ctx.strokeStyle = palette.line; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(0, 0, 100, 70, 35); ctx.fill(); if (!selected) ctx.stroke()
      ctx.fillStyle = selected ? palette.paper : palette.muted; ctx.font = `500 25px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(day, 50, 35)
    }))
  } else {
    const frame = registered ? { x: 0, y: 0, width: registered.width, height: registered.height } : { x: 0, y: 0, width: 840, height: 933 }
    part('model', 'Generic 3D skull reference', frame, ctx => anatomy?.draw(ctx, { x: 0, y: 0, width: frame.width, height: frame.height }, timeMs, durationMs, graphic.tone === 'ink', reduced, graphic.anatomy, registration?.orientation))
  }
  return true
}

function drawFeaturePhotograph(ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, reduced: boolean, specimen?: StudyReference) {
  if (!specimen) return
  const crop = studyReferenceCrop(specimen.crop, specimen.image.width, specimen.image.height, width, height)
  ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, width, height, 24); ctx.clip()
  ctx.drawImage(specimen.image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
  ctx.scale(width / crop.width, width / crop.width); ctx.translate(-crop.x, -crop.y)
  if (specimen.overlay) drawFaceTreatment(ctx, specimen.overlay, specimen.image.width, timeMs, reduced, 1, { appearance: { ...defaultGlassOverlay, pattern: 'dashed', markers: false } })
  ctx.restore()
}

export function drawExplainer(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, reduced: boolean, paint: CanvasPainter, previous?: ExplainerGraphic, anatomy?: AnatomyRenderer, registration?: AnatomyRegistration, fixedCaptionHeight?: number, specimen?: StudyReference, instrumentTime?: { elapsed: number; duration: number }) {
  const graphic = resolveReportGraphic(scene.graphic!, scene.source?.report)
  const captionHeight = fixedCaptionHeight ?? explainerTextHeight(ctx, scene.text, graphic)
  const palette = explainerPalette(explainerTone(graphic))
  const layout = explainerLayout(graphic, captionHeight)
  const metricTiles = nativeGrid(graphic)?.tiles
  paint(ctx, { id: 'graphic/background', label: 'Explainer background', frame: { x: 0, y: 0, width: 1080, height: videoSize.height }, draw: ctx => { ctx.fillStyle = palette.paper; ctx.fillRect(0, 0, videoSize.width, videoSize.height) } })
  if (isPhotoReference(graphic) && specimen) {
    const frame = layout.items[0], image = specimen.image
    const scale = frame.width / image.width
    // Keep the source's top and full width; only surplus below the shoulders leaves the viewport.
    paint(ctx, { id: 'portrait', label: 'Reference photograph', frame, clip: true, draw: ctx => {
      paint(ctx, { id: 'subject', label: 'Source photograph', frame: { x: 0, y: 0, width: frame.width, height: image.height * scale }, size: image, draw: ctx => {
        ctx.drawImage(image, 0, 0)
        if (specimen.overlay) drawFaceTreatment(ctx, specimen.overlay, image.width, instrumentTime?.elapsed ?? localMs, reduced, 1, { appearance: { ...defaultGlassOverlay, pattern: 'dashed', markers: false } })
      } })
    } })
    return
  }
  const anatomyReveal = registration?.reveal && !reduced ? elementEntrance(localMs, 0, 720) : 1
  if (registration?.photo) {
    const photo = registration.photo
    paint(ctx, { id: 'anatomy/photo', label: 'Registered source photograph', frame: photo.frame, size: { width: photo.image.width, height: photo.image.height }, opacity: 1 - anatomyReveal * .92, draw: ctx => { if (!reduced) ctx.filter = `blur(${anatomyReveal * 2.5}px)`; ctx.drawImage(photo.image, 0, 0) } })
  }
  for (const [index, item] of graphic.items.entries()) {
    const frame = graphic.layout === 'story' && registration ? anatomyStageFrame(registration, localMs, scene.durationMs, reduced) : layout.items[index]
    if (!frame) continue
    const settled = reduced || Boolean(registration) || continuesGraphicItem(previous, graphic, item.id)
    const instrument = graphic.layout === 'story' && registration ? undefined : instrumentBounds[graphic.layout]
    const identity = `graphic/item:${item.id}`, contextItem = graphic.layout === 'sequence' && item.role === 'context', width = frame.width, height = frame.height
    const authoredEntrance = scene.tracks.some(track => track.target === 'element' && track.elementId === identity && primitiveDefinition(track.primitive).category === 'entry')
    const entrance = sampleAppearance('group-reveal', primitiveProgress(localMs, 100 + index * 80, 480), settled || authoredEntrance)
    const appearance = isInstrumentGrid(graphic) ? { ...entrance, blur: 0, scale: 1, y: entrance.y * .5 } : entrance
    paint(ctx, { id: identity, label: item.label || 'Graphic', frame: { x: frame.x + frame.width * (1 - appearance.scale) / 2, y: frame.y + frame.height * (1 - appearance.scale) / 2 + appearance.y / 100 * frame.height, width: frame.width * appearance.scale, height: frame.height * appearance.scale }, size: instrument ?? { width, height }, clip: isInstrumentGrid(graphic), opacity: appearance.opacity * (graphic.layout === 'story' ? anatomyReveal : 1), draw: ctx => {
      if (appearance.blur) ctx.filter = `${ctx.filter && ctx.filter !== 'none' ? ctx.filter : ''} blur(${appearance.blur}px)`.trim()
      const part = (id: string, label: string, rect: CanvasRect, draw: (ctx: CanvasRenderingContext2D) => void) => paint(ctx, { id: `${identity}/${id}`, label: `${item.label} · ${label}`, frame: rect, draw })
      ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = palette.ink; ctx.strokeStyle = palette.ink
      const valueProgress = settled ? 1 : elementEntrance(localMs, 100, 1000)
      if ((isInstrumentGrid(graphic) || contextItem) && !item.diagram) {
        const tile = metricTiles?.[index]
        const logicalWidth = tile?.width ?? 354, logicalHeight = height / width * logicalWidth
        ctx.save(); ctx.scale(width / logicalWidth, width / logicalWidth)
        drawFeatureCard(ctx, graphicMetricFeature(item), logicalWidth, logicalHeight, valueProgress, identity, paint, tile?.showVisual ?? true)
        ctx.restore()
        return
      }
      if (item.diagram && (isInstrumentGrid(graphic) || contextItem)) {
        part('surface', 'Photographic evidence panel', { x: 0, y: 0, width, height }, ctx => {
          ctx.fillStyle = '#fafbfc'; ctx.beginPath(); ctx.roundRect(0,0,width,height,48); ctx.fill()
        })
        part('label', 'Feature title', { x: 36, y: 32, width: width - 72, height: 70 }, ctx => {
          ctx.textAlign = 'left'; ctx.fillStyle = palette.ink; ctx.font = `400 46px ${font}`
          lines(ctx,item.label,width-72).slice(0,2).forEach((line,row) => ctx.fillText(line,0,row*50))
        })
        part('detail', 'Feature explanation', { x: 36, y: 118, width: width - 72, height: 70 }, ctx => {
          ctx.fillStyle = palette.muted; ctx.font = `400 26px ${font}`; ctx.textAlign = 'left'
          lines(ctx,item.detail,width-72).slice(0,2).forEach((line,row) => ctx.fillText(line,0,row*34))
        })
        part('visual', `Photographed ${item.diagram} feature`, { x: 0, y: 200, width, height: Math.max(80,height-200) }, ctx => drawFeaturePhotograph(ctx,width,Math.max(80,height-200),instrumentTime?.elapsed ?? localMs,reduced,specimen))
        return
      }
      if (instrument) ctx.translate(0, -instrument.top)
      if (drawInstrument(graphic, item, part, valueProgress, anatomy, localMs, scene.durationMs, reduced, registration ? { ...registration, frame } : undefined)) return
      const compact = graphic.layout === 'pillars' || contextItem
      if (graphic.layout === 'scale') {
        part('visual', ['Graduated score ruler', 'Curved dashboard ruler', 'Segmented dashboard gauge'][graphic.variant % 3], { x: 36, y: 410, width: width - 72, height: 270 }, ctx => {
          drawMetricTimeline(ctx, { width: width - 72, height: 270, position: Math.max(0, Math.min(1, Number(item.value) / 10)), progress: valueProgress, variant: graphic.timelineStyle ?? metricTimelineVariant(item.label, item.detail, graphic.variant), ...palette })
        })
        part('reference-label', 'Score reference label', { x: 32, y: 748, width: width - 64, height: 50 }, ctx => {
          ctx.font = `500 24px ${font}`; ctx.fillStyle = palette.muted; ctx.textAlign = 'left'; ctx.fillText('REPORT VALUE', 0, 0)
          ctx.textAlign = 'right'; ctx.fillStyle = palette.ink; ctx.fillText(`${item.value} ${item.detail}`, width - 64, 0)
        })
      } else if (graphic.layout === 'constellation') {
        const count = graphic.count ?? 0, columns = Math.min(8 + graphic.variant % 3, Math.max(1, Math.ceil(Math.sqrt(count))))
        part('visual', 'Feature constellation', { x: 40, y: 400, width: width - 80, height: 460 }, ctx => {
          const gap = (width - 80) / columns
          const rows = Math.ceil(count / columns), gapY = Math.min(58, 440 / Math.max(1, rows))
          const track = scene.tracks.find(track => track.primitive === 'graphic-regroup')
          const regroup = !track ? 0 : reduced ? 1 : sampleMotionPrimitive('graphic-regroup', primitiveProgress(localMs, track.startMs, track.durationMs)).reveal
          const half = Math.ceil(count / 2), groupColumns = Math.max(1, Math.ceil(Math.sqrt(half))), groupWidth = (width - 160) / 2
          const groupGap = Math.min(54, 440 / Math.max(1, Math.ceil(half / groupColumns)))
          for (let point = 0; point < count; point++) {
            const amount = settled ? 1 : elementEntrance(localMs, 500 + point * Math.min(22, 1000 / count), 500)
            const group = point >= half ? 1 : 0, groupIndex = point % half
            const initialX = point % columns * gap + gap / 2, initialY = Math.floor(point / columns) * gapY + 12
            const finalX = group * (groupWidth + 80) + (groupIndex % groupColumns + .5) * groupWidth / groupColumns, finalY = Math.floor(groupIndex / groupColumns) * groupGap + 12
            paint(ctx, { id: `${identity}/dot:${point}`, label: `Feature point ${point + 1}`, frame: { x: initialX + (finalX - initialX) * regroup - 12, y: initialY + (finalY - initialY) * regroup - 12, width: 24, height: 24 }, opacity: amount, draw: ctx => {
              ctx.fillStyle = regroup ? group ? palette.muted : palette.accent : point % 5 === graphic.variant % 5 ? palette.accent : palette.muted
              ctx.beginPath(); ctx.arc(12, 12, 8, 0, Math.PI * 2); ctx.fill()
            } })
          }
        })
      }
      const sequence = graphic.layout === 'sequence' && !contextItem, scale = graphic.layout === 'scale', constellation = graphic.layout === 'constellation'
      if (sequence) part('marker', 'Step number', { x: 0, y: 22, width: 64, height: 64 }, ctx => {
        ctx.fillStyle = palette.muted; ctx.font = `400 38px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(graphic.items.filter(item => item.role !== 'context').indexOf(item) + 1).padStart(2, '0'), 32, 32)
      })
      const valueY = scale || constellation ? 0 : compact ? 50 : graphic.layout === 'comparison' ? 40 : graphic.layout === 'evidence' ? 90 : 100
      if (item.value && !sequence) part('value', 'Value', { x: 20, y: valueY, width: width - 40, height: 260 }, ctx => {
        graphicValue(ctx, item.value, width - 40, compact ? 140 : scale || constellation || graphic.layout === 'evidence' ? 260 : 220, valueProgress, palette.ink)
      })
      const labelHeight = sequence ? height - 44 - (item.detail ? 42 : 0) : graphic.layout === 'evidence' ? 60 : 150
      part('label', 'Label', { x: sequence ? 96 : 24, y: sequence ? 24 : graphic.layout === 'evidence' ? 0 : scale || constellation ? 280 : compact ? 216 : graphic.layout === 'comparison' ? 310 : item.value ? 390 : 200, width: width - (sequence ? 120 : 48), height: labelHeight }, ctx => {
        const max = width - (sequence ? 120 : 48)
        const label = sequence && item.value ? `${item.value} · ${item.label}` : item.label
        let size = sequence ? 58 : compact ? 42 : 48
        ctx.font = `400 ${size}px ${font}`
        while ((lines(ctx, label, max).length > 3 || lines(ctx, label, max).length * size * 1.2 > labelHeight) && size > 30) ctx.font = `400 ${--size}px ${font}`
        ctx.fillStyle = palette.ink; ctx.textAlign = sequence ? 'left' : 'center'
        lines(ctx, label, max).forEach((line, lineIndex) => ctx.fillText(line, sequence ? 0 : max / 2, lineIndex * size * 1.2))
      })
      if (graphic.layout === 'comparison' && Number.isFinite(Number(item.value)) && item.value.trim()) part('position', 'Report score position', { x: 36, y: height - 180, width: width - 72, height: 14 }, ctx => {
        ctx.fillStyle = palette.line; ctx.beginPath(); ctx.roundRect(0, 0, width - 72, 14, 7); ctx.fill()
        ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.roundRect(0, 0, (width - 72) * Math.max(0, Math.min(1, Number(item.value) / 10)) * valueProgress, 14, 7); ctx.fill()
      })
      if (item.detail) part('detail', 'Supporting detail', { x: 30, y: sequence ? height - 38 : compact ? 302 : graphic.layout === 'evidence' ? 370 : scale ? 240 : height - 100, width: width - 60, height: sequence ? 34 : graphic.layout === 'evidence' ? 60 : 90 }, ctx => {
        let size = sequence ? 30 : 34
        ctx.font = `400 ${size}px ${font}`
        while (sequence && ctx.measureText(item.detail).width > width - 60 && size > 12) ctx.font = `400 ${--size}px ${font}`
        ctx.fillStyle = palette.muted; ctx.textAlign = 'center'
        lines(ctx, item.detail, width - 60).slice(0, sequence ? 1 : 2).forEach((line, index) => ctx.fillText(line, (width - 60) / 2, index * 32))
      })
    } })
  }
}
