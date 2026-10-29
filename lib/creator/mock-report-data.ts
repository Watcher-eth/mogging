import registry from '@/lib/analysis-v2/rubric-registry.json'
import { designValues } from '@/lib/analysis-v2/preview-fixtures'
import { formatRubricValue, overallScoreFields } from '@/lib/analysis-v2/web-report'
import { reportTriangulation } from './mobile-overlay-engine/triangulation'
import { reportCategories as legacyCategories, type ReportCategory, type ReportFeature } from './mobile-overlay-engine/report-data'

// Editable examples only. Instrument selection follows native prepareExpandedCategories;
// the values are design fixtures, never observations of a customer's photo.
const examples = new Map(Object.entries(designValues).map(([id, value], index) => [id, { value, grade: 6.8 + index % 7 * .2 }]))
export const reportCategories: ReportCategory[] = registry.categories.map(category => {
  const id = category.id === 'face' ? 'face-shape' : category.id
  const previous = legacyCategories.find(item => item.id === id)
  const features: ReportFeature[] = category.rubrics.filter(rubric => rubric.output !== 'D').map(rubric => {
    const entry = examples.get(rubric.id), value = entry?.value ?? 'Balanced'
    const difference = rubric.output === 'B' && rubric.visual === 'Text' && typeof value === 'number' ? value : null
    const maximum = Math.max(5, Math.ceil((difference ?? 0) / 5) * 5)
    const numeric = Array.isArray(value) ? value : typeof value === 'number' ? [value] : []
    const positions = numeric.length ? numeric.map(number => Math.max(0, Math.min(1, rubric.output === 'A' ? .5 + number / 180 : number / Math.max(1.4, number * 1.4)))) : [.62]
    const visual = difference !== null ? 'Rail' : ['Capsule', 'Orbit', 'Rail'].includes(rubric.visual) ? rubric.visual : 'Text'
    return { id: rubric.id, label: rubric.name, value: formatRubricValue(rubric.id, rubric.output, value), visual,
      positions: difference !== null ? [difference / maximum] : positions,
      grade: visual === 'Rail' && difference === null ? entry?.grade ?? 7.4 : null,
      scale: visual === 'Rail' && difference === null ? 'quality' : 'range',
      ...(difference !== null ? { axis: { maximum, unit: '%' as const } } : {}),
      triangulation: reportTriangulation(rubric.id, examples),
    }
  })
  return { id, title: id === 'face-shape' ? 'Face shape' : id[0].toUpperCase() + id.slice(1), subtitle: category.title,
    scoreLabel: category.title, score: 7.4, features, eyeColor: id === 'eyes' ? 'blue' : undefined,
    hairColor: id === 'hair' ? 'brown' : undefined,
    explanation: previous?.explanation ?? `Feature relationships within the ${category.title.toLowerCase()}.`,
    recommendation: previous?.recommendation ?? 'Keep your daily routine consistent and compare photos in similar lighting.' }
})

function overviewFeatures(score: number, scores: Record<string, string>): ReportFeature[] {
  const aliases: Record<string, string> = { cheeks: 'cheekbones', skin: 'skin-quality' }
  return overallScoreFields.map(([id, label, maximum], index) => {
    const raw = scores[id] ?? scores[aliases[id]], parsed = raw?.trim() ? Number(raw) : Number.NaN
    const value = Math.max(0, Math.min(maximum, Number.isFinite(parsed) ? parsed : score * maximum / 10))
    const instrument = id === 'eyes' || index % 4 === 0 || index % 4 === 3 || index === overallScoreFields.length - 1
    return { id: `overall.${id}`, label, value: `${value.toFixed(1)} / ${maximum}`, visual: instrument ? id === 'psl' || id === 'jaw' ? 'Orbit' : 'Rail' : 'Text',
      scale: 'quality', positions: [value / maximum], grade: null, maximum,
      ...(instrument ? { triangulation: reportTriangulation(`overall.${id}`, examples) } : {}),
    }
  })
}

const overall = legacyCategories.find(category => category.id === 'overall')!
reportCategories.push({ ...overall, scoreLabel: 'Mogging Score', features: overviewFeatures(7.2, {}),
  recommendation: 'Skin quality: Build a consistent cleansing and moisturizing routine.\nJaw & chin: Keep your posture neutral when taking progress photos.\nEye area: Use consistent lighting and a neutral expression to track your eye area.' })

export function buildMockOverallCategory(currentScore: string, scores: Record<string, string>): ReportCategory {
  const parsed = Number(currentScore)
  const score = currentScore.trim() && Number.isFinite(parsed) ? Math.max(0, Math.min(10, parsed)) : 7
  return { ...reportCategories.find(item => item.id === 'overall')!, score, features: overviewFeatures(score, scores) }
}
