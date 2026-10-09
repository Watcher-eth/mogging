import registry from '@/lib/analysis-v2/rubric-registry.json'
import { designValues } from '@/lib/analysis-v2/preview-fixtures'
import { buildWebRubricGroups } from '@/lib/analysis-v2/web-report'
import { reportCategories as legacyCategories, type ReportCategory } from './mobile-overlay-engine/report-data'

// Editable creator fixtures, never model results or saved customer reports.
export const reportCategories: ReportCategory[] = registry.categories.map(category => {
  const id = category.id === 'face' ? 'face-shape' : category.id
  const previous = legacyCategories.find(item => item.id === id)
  const entries = category.rubrics.map(rubric => ({ id: rubric.id, value: designValues[rubric.id] ?? 'Balanced' }))
  const visuals = Object.fromEntries(category.rubrics.map(rubric => [rubric.id, { positions: [.56], grade: 7.4 }]))
  const features = buildWebRubricGroups(id, entries, visuals).flatMap(group => group.rubrics)
  return { id, title: id === 'face-shape' ? 'Face Shape' : id[0].toUpperCase() + id.slice(1), subtitle: category.title,
    scoreLabel: category.title, score: 7.4, features, eyeColor: id === 'eyes' ? 'blue' : undefined,
    explanation: previous?.explanation ?? `Feature relationships within the ${category.title.toLowerCase()}.`,
    recommendation: previous?.recommendation ?? 'Keep your daily routine consistent and compare photos in similar lighting.' }
})
const overall = legacyCategories.find(category => category.id === 'overall')!
reportCategories.push({ ...overall, scoreLabel: 'Overall Score', features: overall.features.map(feature => ({ ...feature,
  visual: ['PSL score', 'Symmetry'].includes(feature.label) ? 'Orbit' : 'Text',
  positions: [Number.parseFloat(feature.value) / (feature.label.includes('PSL') ? 8 : 10)], scale: 'quality' })) })


export function buildMockOverallCategory(currentScore: string, scores: Record<string, string>): ReportCategory {
  const score = Number(currentScore) || 7
  const scoreIds: Record<string, string> = { 'PSL score': 'psl', Symmetry: 'symmetry', 'Eye area': 'eyes', 'Jaw & chin': 'jaw', 'Cheekbone structure': 'cheekbones' }
  const category = reportCategories.find(item => item.id === 'overall')!
  return { ...category, score, features: category.features.map(feature => {
    const max = feature.label === 'PSL score' ? 8 : 10
    const value = Math.min(max, Math.max(0, Number(scores[scoreIds[feature.label]]) || score * max / 10))
    return { ...feature, value: `${value.toFixed(1)} / ${max}`, positions: [value / max] }
  }) }
}
