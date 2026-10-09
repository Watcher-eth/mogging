import registry from './rubric-registry.json'
import type { RubricEstimate } from './evaluator'

export type WebRubric = { id: string; label: string; value: string; visual: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality' }
export type WebRubricGroup = { id: string; title: string; rubrics: WebRubric[] }
const qualityDials = new Set(['proportions.angle-coordination', 'ears.protrusion'])
const domainAliases: Record<string, string> = { 'face-shape': 'face' }
const percentageShares = new Set(['proportions.upper-third', 'proportions.middle-third', 'proportions.lower-third', 'proportions.lower-partition'])

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

// Pair applicable dials together and promote odd cards to avoid empty half rows.
export function layoutWebRubrics(rubrics: WebRubric[]) {
  const full = rubrics.filter(rubric => rubric.visual === 'Capsule')
  const orbits = rubrics.filter(rubric => rubric.visual === 'Orbit')
  const remaining = rubrics.filter(rubric => !['Capsule', 'Orbit'].includes(rubric.visual))
  if (orbits.length % 2) full.push(orbits.pop()!)
  if (remaining.length % 2) {
    const index = remaining.findIndex(rubric => rubric.visual === 'Rail')
    full.push(remaining.splice(index < 0 ? remaining.length - 1 : index, 1)[0])
  }
  return [...full.filter(rubric => rubric.visual !== 'Text').map(rubric => ({ rubric, full: true })), ...[...orbits, ...remaining].map(rubric => ({ rubric, full: false })), ...full.filter(rubric => rubric.visual === 'Text').map(rubric => ({ rubric, full: true }))]
}
