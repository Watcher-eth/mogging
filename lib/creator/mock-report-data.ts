import registry from '@/lib/analysis-v2/rubric-registry.json'
import { designValues } from '@/lib/analysis-v2/preview-fixtures'
import { overallScoreFields, buildWebRubricGroups } from '@/lib/analysis-v2/web-report'
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
reportCategories.push({ ...overall, scoreLabel: 'Overall Score', features: overallScoreFields.map(([id, label, max]) => {
  const score = id === 'psl' ? 5.8 : id === 'eyes' ? 7.8 : 7.2
  return { label, value: `${score.toFixed(1)} / ${max}`, visual: 'Orbit', positions: [score / max], scale: 'quality' }
}) })

export function buildMockOverallCategory(currentScore: string, scores: Record<string, string>): ReportCategory {
  const parsed = Number(currentScore)
  const score = currentScore.trim() && Number.isFinite(parsed) ? Math.max(0, Math.min(10, parsed)) : 7
  const aliases: Record<string, string> = { cheeks: 'cheekbones', skin: 'skin-quality' }
  const category = reportCategories.find(item => item.id === 'overall')!
  return { ...category, score, features: overallScoreFields.map(([id, label, max]) => {
    const raw = scores[id] ?? scores[aliases[id]]
    const parsed = raw?.trim() ? Number(raw) : Number.NaN
    const value = Math.max(0, Math.min(max, Number.isFinite(parsed) ? parsed : score * max / 10))
    return { label, value: `${value.toFixed(1)} / ${max}`, visual: 'Orbit', scale: 'quality', positions: [value / max] }
  }) }
}
