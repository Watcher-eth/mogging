import registry from './rubric-registry.json'
import type { RubricEstimate } from './evaluator'
import { timelineStyle } from '../creator/mobile-report-geometry'

export type MetricAxis = { minimum: number; maximum: number; unit: string; digits: number }
export type WebRubric = { id: string; label: string; value: string; measurement?: string; visual: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality'; chartAxis?: MetricAxis; measurementPlot?: { axis: MetricAxis; positions: number[] } }
export type WebRubricGroup = { id: string; title: string; rubrics: WebRubric[] }
const qualityDials = new Set(['proportions.angle-coordination', 'ears.protrusion'])
const domainAliases: Record<string, string> = { 'face-shape': 'face' }
const percentageShares = new Set(['proportions.upper-third', 'proportions.middle-third', 'proportions.lower-third', 'proportions.lower-partition'])
const wideAngles = new Set(['brows.arch', 'jaw.angle', 'nose.alar-angle', 'proportions.convexity'])

export const overallScoreFields = [
  ['psl', 'PSL score', 8], ['eyes', 'Eye area', 10], ['jaw', 'Jaw & chin', 10],
  ['cheeks', 'Cheekbone structure', 10], ['proportions', 'Facial thirds', 10],
  ['symmetry', 'Symmetry', 10], ['skin', 'Skin quality', 10],
] as const

export function buildLegacyRubricGroups(category: { id: string; title: string; features: { label: string; value: string; measurement?: string }[] }): WebRubricGroup[] {
  return [{ id: category.id, title: category.title, rubrics: category.features.map((feature, index) => {
    const score = feature.value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(8|10)\s*$/)
    const position = score ? Number(score[1]) / Number(score[2]) : null
    const measured = position !== null && position >= 0 && position <= 1
    return { id: `${category.id}.${index}`, label: feature.label, value: feature.value, measurement: feature.measurement, visual: measured ? 'Orbit' : 'Text', positions: measured ? [position] : [], grade: null, scale: 'quality' }
  }) }]
}

export function formatRubricValue(id: string, output: string, value: RubricEstimate['value']): string {
  if (value === null) return ''
  if (typeof value === 'string') {
    const text = value.charAt(0).toUpperCase() + value.slice(1)
    return id === 'brows.density' ? `${text} Coverage` : text
  }
  const format = (number: number) => output === 'A' || id === 'brows.tail' ? `${number.toFixed(1)}°`
    : output === 'B' ? `${number.toFixed(1)}%`
    : percentageShares.has(id) ? `${(number * 100).toFixed(1)}%`
    : output === 'O' ? `${number} / 4`
    : `${number.toFixed(2)}×`
  return Array.isArray(value) ? value.map((number, index) => `${value.length === 2 ? index === 0 ? 'L ' : 'R ' : ''}${format(number)}`).join(' · ') : format(value)
}

function measurementPlot(id: string, output: string, value: RubricEstimate['value']): WebRubric['measurementPlot'] {
  const values = Array.isArray(value) ? value : typeof value === 'number' ? [value] : []
  if (!values.length || !values.every(Number.isFinite)) return
  const share = percentageShares.has(id)
  const numbers = share ? values.map(number => number * 100) : values
  const angle = output === 'A' || id === 'brows.tail'
  const largest = Math.max(...numbers.map(Math.abs))
  const maximum = angle ? wideAngles.has(id) ? 180 : ([15, 30, 45, 90, 180].find(limit => limit >= largest) ?? 180)
    : share ? 100 : output === 'B' ? ([5, 10, 25, 50, 100].find(limit => limit >= largest) ?? 100)
      : output === 'O' ? 4 : output === 'R' ? Math.max(1, Math.ceil(largest * 2) / 2) : 0
  if (!maximum || largest > maximum) return
  const minimum = (angle && !wideAngles.has(id)) || Math.min(...numbers) < 0 ? -maximum : 0
  const unit = angle ? '°' : share || output === 'B' ? '%' : output === 'R' ? '×' : ''
  return { axis: { minimum, maximum, unit, digits: output === 'R' && !share ? 1 : 0 }, positions: numbers.map(number => (number - minimum) / (maximum - minimum)) }
}

export function buildWebRubricGroups(categoryId: string, entries: (Pick<RubricEstimate, 'id' | 'value'> & Partial<Pick<RubricEstimate, 'grade' | 'positions'>>)[], illustrations: Record<string, { positions: number[]; grade?: number }> = {}): WebRubricGroup[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  return registry.categories.filter(category => category.id === (domainAliases[categoryId] ?? categoryId)).map(category => ({
    id: category.id,
    title: category.title,
    rubrics: category.rubrics.filter(rubric => byId.get(rubric.id)?.value != null && rubric.output !== 'D').map(rubric => {
      const entry = byId.get(rubric.id)
      const value = entry?.value ?? null
      const illustration = illustrations[rubric.id] ?? (entry ? { positions: entry.positions ?? [], grade: entry.grade ?? undefined } : undefined)
      const grade = illustration?.grade ?? null
      const quality = qualityDials.has(rubric.id) && grade !== null
      const positions = quality ? [grade / 10] : illustration?.positions ?? []
      return { scale: quality ? 'quality' as const : 'range' as const, id: rubric.id, label: rubric.name, value: formatRubricValue(rubric.id, rubric.output, value),
        visual: (rubric.visual === 'Rail' ? grade !== null : positions.length) ? rubric.visual : 'Text', positions, grade,
        measurementPlot: measurementPlot(rubric.id, rubric.output, value),
      }
    }),
  }))
}

export function layoutDesktopRubrics(entries: WebRubric[], summary: boolean) {
  if (summary) return entries.map((rubric, index) => {
    const chartSide = Math.floor(index / 2) % 2
    const paired = entries[index + (index % 2 === 0 ? 1 : -1)]
    const full = !paired || (rubric.visual === 'Text' && paired.visual === 'Text')
    const visual = full || index % 2 === chartSide || paired?.visual === 'Text'
      ? ['overall.jaw', 'overall.cheeks', 'overall.symmetry'].includes(rubric.id) && rubric.positions.length ? 'Dial' : rubric.visual
      : 'Text'
    return { rubric: { ...rubric, visual }, full }
  })

  const charts: WebRubric[] = []
  const notes: WebRubric[] = []
  for (const entry of entries) {
    const plot = entry.visual === 'Text' ? entry.measurementPlot : undefined
    const rubric: WebRubric = plot ? { ...entry, chartAxis: plot.axis, positions: plot.positions, visual: 'Capsule' } : entry
    if (rubric.visual === 'Text') notes.push(rubric)
    else charts.push(timelineStyle(rubric.id, rubric.label) === 'dial' && rubric.visual !== 'Rail' ? { ...rubric, visual: 'Dial' } : rubric)
  }
  const featured = charts.length >= 4 ? charts.find(rubric => rubric.visual === 'Dial' || rubric.visual === 'Rail') : undefined
  const fullWidth = (rubric: WebRubric) => rubric === featured || rubric.positions.length > 2
  const layout: Array<{ rubric: WebRubric; full: boolean }> = []
  let chart = 0, note = 0, pairedRow = 0
  while (chart < charts.length) {
    const rubric = charts[chart++]
    const other = fullWidth(rubric) ? undefined : notes[note] ?? (charts[chart] && !fullWidth(charts[chart]) ? charts[chart] : undefined)
    if (!other) {
      layout.push({ rubric, full: true })
      continue
    }
    if (other === notes[note]) note++
    else chart++
    const row = pairedRow++ % 2 === 0 ? [rubric, other] : [other, rubric]
    layout.push(...row.map(rubric => ({ rubric, full: false })))
  }
  return [...layout, ...notes.slice(note).map(rubric => ({ rubric, full: true }))]
}

export function scoreHistogram(scores: Array<number | null>) {
  const values = scores.filter((score): score is number => score !== null && Number.isFinite(score) && score >= 0 && score <= 10)
  if (values.length < 5) return null
  const bins = Array<number>(10).fill(0)
  for (const score of values) bins[Math.min(9, Math.floor(score))]++
  return { bins, count: values.length }
}

export function layoutWebRubrics(rubrics: WebRubric[], presentation: 'detail' | 'summary' = 'detail') {
  if (presentation === 'summary') return rubrics.map((rubric, index) => ({ rubric: index % 2 ? { ...rubric, visual: 'Text' } : rubric, full: rubrics.length % 2 === 1 && index === rubrics.length - 1 }))
  const rows = (items: WebRubric[]) => {
    const result: Array<Array<{ rubric: WebRubric; full: boolean }>> = []
    for (let index = 0; index < items.length; index++) {
      const rubric = items[index], next = items[index + 1]
      if (['Capsule', 'Rail'].includes(rubric.visual) || !next || ['Capsule', 'Rail'].includes(next.visual)) result.push([{ rubric, full: true }])
      else { result.push([{ rubric, full: false }, { rubric: next, full: false }]); index++ }
    }
    return result
  }
  const graphics = rows(rubrics.filter(rubric => rubric.visual !== 'Text'))
  const observations = rows(rubrics.filter(rubric => rubric.visual === 'Text'))
  const total = graphics.length + observations.length
  let graphicIndex = 0, observationIndex = 0
  return Array.from({ length: total }, (_, index) => graphicIndex < graphics.length && index === Math.floor((graphicIndex + .5) * total / graphics.length) ? graphics[graphicIndex++] : observations[observationIndex++]).flat()
}

export function buildCheekContextGroups(entries: Parameters<typeof buildWebRubricGroups>[1]): WebRubricGroup[] {
  const relationships = new Set(['jaw.width', 'face.frame', 'face.temple-width', 'face.forehead-width', 'symmetry.cheek-outline', 'proportions.width-hierarchy'])
  const rubrics = ['jaw', 'face', 'symmetry', 'proportions'].flatMap(category => buildWebRubricGroups(category, entries).flatMap(group => group.rubrics.filter(rubric => relationships.has(rubric.id)).map(rubric => ({ ...rubric, measurement: `Related measurement · ${group.title}` }))))
  return rubrics.length ? [{ id: 'cheeks-context', title: 'Cheek relationships', rubrics }] : []
}
