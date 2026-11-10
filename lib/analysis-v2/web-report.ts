import registry from './rubric-registry.json'
import type { RubricEstimate } from './evaluator'

export type WebRubric = { id: string; label: string; value: string; measurement?: string; visual: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality' }
export type WebRubricGroup = { id: string; title: string; rubrics: WebRubric[] }
const qualityDials = new Set(['proportions.angle-coordination', 'ears.protrusion'])
const domainAliases: Record<string, string> = { 'face-shape': 'face' }
const percentageShares = new Set(['proportions.upper-third', 'proportions.middle-third', 'proportions.lower-third', 'proportions.lower-partition'])

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

export function buildWebRubricGroups(categoryId: string, entries: (Pick<RubricEstimate, 'id' | 'value'> & Partial<Pick<RubricEstimate, 'grade' | 'positions'>>)[], illustrations: Record<string, { positions: number[]; grade?: number }> = {}): WebRubricGroup[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  return registry.categories.filter(category => category.id === (domainAliases[categoryId] ?? categoryId)).map(category => ({
    id: category.id,
    title: category.title,
    rubrics: category.rubrics.filter(rubric => byId.get(rubric.id)?.value != null && rubric.output !== 'D').map(rubric => {
      const entry = byId.get(rubric.id)
      const value = entry?.value ?? null
      const illustration = illustrations[rubric.id] ?? (entry ? { positions: entry.positions ?? [], grade: entry.grade ?? undefined } : undefined)
      return { scale: qualityDials.has(rubric.id) ? 'quality' as const : 'range' as const, id: rubric.id, label: rubric.name, value: formatRubricValue(rubric.id, rubric.output, value),
        visual: (rubric.visual === 'Rail' ? illustration?.grade != null : illustration?.positions.length) ? rubric.visual : 'Text', positions: qualityDials.has(rubric.id) && illustration ? [(illustration.grade ?? 7.4) / 10] : illustration?.positions ?? [], grade: illustration?.grade ?? null,
      }
    }),
  }))
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
