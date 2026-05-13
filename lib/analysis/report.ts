import type { AnalysisProviderResult, AnalysisReport, MetricCategory } from './schema'

const reportCategoryIds = [
  'eyes',
  'nose',
  'mouth',
  'jaw',
  'dimorphism',
  'face-shape',
  'facial-fat',
  'biological-age',
  'symmetry',
  'overall',
] as const

function clampCategoryScore(score: number) {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}

function clampPslScore(score: number) {
  return Math.max(0, Math.min(8, Math.round(score * 10) / 10))
}

function categoryAverage(result: AnalysisProviderResult, category: MetricCategory, fallback: number) {
  const scores = result.metricScores.filter((metric) => metric.category === category)
  if (scores.length === 0) return fallback

  return scores.reduce((sum, metric) => sum + metric.score, 0) / scores.length
}

export function normalizeAnalysisReport(
  report: AnalysisReport | null | undefined,
  pslScore: number,
): AnalysisReport | null {
  if (!report) return null

  const categories = reportCategoryIds.map((id) => report.categories.find((category) => category.id === id))
  if (categories.some((category) => !category)) return null

  return {
    summary: report.summary,
    categories: categories.map((category) => (
      category!.id === 'overall'
        ? { ...category!, score: clampPslScore(pslScore), title: 'Overall PSL', scoreLabel: 'PSL score' }
        : { ...category!, score: clampCategoryScore(category!.score) }
    )),
  }
}

export function createFallbackAnalysisReport(result: AnalysisProviderResult, pslScore: number): AnalysisReport {
  const harmony = result.harmonyScore
  const symmetry = result.symmetryScore ?? categoryAverage(result, 'symmetry', harmony)
  const proportionality = result.proportionalityScore ?? categoryAverage(result, 'proportionality', harmony)
  const averageness = result.averagenessScore ?? categoryAverage(result, 'averageness', harmony)
  const skin = categoryAverage(result, 'skin', harmony)
  const presentation = categoryAverage(result, 'presentation', harmony)

  return {
    summary: 'Calibrated PSL report generated from facial proportion, symmetry, averageness, dimorphism, angularity, skin, and presentation signals.',
    categories: [
      {
        id: 'eyes',
        title: 'Eyes',
        subtitle: 'Periocular balance and eye-line structure',
        scoreLabel: 'Eye area',
        score: clampCategoryScore((harmony + symmetry + proportionality) / 3),
        features: [
          { label: 'Eye line', value: symmetry >= 5 ? 'Aligned' : 'Uneven' },
          { label: 'Spacing', value: proportionality >= 5 ? 'Balanced' : 'Offset' },
          { label: 'Lid support', value: harmony >= 5 ? 'Defined' : 'Soft' },
          { label: 'Impact', value: pslScore >= 5 ? 'Positive' : 'Limited' },
        ],
        explanation: 'The eye area is estimated from local symmetry, spacing, lid support, and how well the periocular region fits the full facial frame.',
      },
      {
        id: 'nose',
        title: 'Nose',
        subtitle: 'Bridge alignment and central facial axis',
        scoreLabel: 'Nasal balance',
        score: clampCategoryScore((proportionality + symmetry + harmony) / 3),
        features: [
          { label: 'Axis', value: symmetry >= 5 ? 'Centered' : 'Slight drift' },
          { label: 'Width', value: proportionality >= 5 ? 'Proportional' : 'Prominent' },
          { label: 'Bridge', value: harmony >= 5 ? 'Clean' : 'Variable' },
          { label: 'Fit', value: averageness >= 5 ? 'Typical' : 'Distinctive' },
        ],
        explanation: 'Nasal balance is scored by central alignment, width relative to the midface, and how much the nose supports overall facial harmony.',
      },
      {
        id: 'mouth',
        title: 'Mouth',
        subtitle: 'Lip shape, width, and lower-third fit',
        scoreLabel: 'Mouth harmony',
        score: clampCategoryScore((harmony + proportionality + averageness) / 3),
        features: [
          { label: 'Width', value: proportionality >= 5 ? 'Proportional' : 'Narrow' },
          { label: 'Resting line', value: symmetry >= 5 ? 'Even' : 'Uneven' },
          { label: 'Volume', value: averageness >= 5 ? 'Balanced' : 'Distinct' },
          { label: 'Lower third', value: harmony >= 5 ? 'Supportive' : 'Weak' },
        ],
        explanation: 'The mouth score reflects lip width, resting symmetry, fullness, and how the feature sits within the lower third.',
      },
      {
        id: 'jaw',
        title: 'Jaw',
        subtitle: 'Mandible definition and chin support',
        scoreLabel: 'Jawline',
        score: clampCategoryScore((result.angularityScore + result.dimorphismScore + proportionality) / 3),
        features: [
          { label: 'Mandible', value: result.angularityScore >= 5 ? 'Defined' : 'Soft' },
          { label: 'Chin support', value: proportionality >= 5 ? 'Balanced' : 'Limited' },
          { label: 'Angle', value: result.angularityScore >= 5.5 ? 'Sharp' : 'Moderate' },
          { label: 'Frame', value: harmony >= 5 ? 'Coherent' : 'Mixed' },
        ],
        explanation: 'Jaw scoring weighs mandibular definition, chin support, angularity, and whether the lower-third frame strengthens the face.',
      },
      {
        id: 'dimorphism',
        title: 'Dimorphism',
        subtitle: 'Sex-typical cues weighted against harmony',
        scoreLabel: 'Dimorphism',
        score: clampCategoryScore(result.dimorphismScore),
        features: [
          { label: 'Brow frame', value: result.dimorphismScore >= 5 ? 'Present' : 'Subtle' },
          { label: 'Lower third', value: result.angularityScore >= 5 ? 'Structured' : 'Soft' },
          { label: 'Cue strength', value: result.dimorphismScore >= 6 ? 'Strong' : 'Moderate' },
          { label: 'Balance', value: harmony >= 5 ? 'Controlled' : 'Uneven' },
        ],
        explanation: 'Dimorphism is scored from sex-typical facial cues while penalizing traits that overpower harmony or proportional balance.',
      },
      {
        id: 'face-shape',
        title: 'Face shape',
        subtitle: 'Frame, thirds, and silhouette continuity',
        scoreLabel: 'Face shape',
        score: clampCategoryScore((harmony + proportionality + result.angularityScore) / 3),
        features: [
          { label: 'Outline', value: harmony >= 5 ? 'Coherent' : 'Irregular' },
          { label: 'Thirds', value: proportionality >= 5 ? 'Balanced' : 'Uneven' },
          { label: 'Frame', value: result.angularityScore >= 5 ? 'Defined' : 'Soft' },
          { label: 'Continuity', value: averageness >= 5 ? 'Natural' : 'Distinct' },
        ],
        explanation: 'Face-shape scoring combines facial thirds, visible silhouette continuity, and how the frame supports the central features.',
      },
      {
        id: 'facial-fat',
        title: 'Facial fat',
        subtitle: 'Visible facial leanness and soft-tissue fullness',
        scoreLabel: 'Facial fat %',
        score: clampCategoryScore((skin + presentation + averageness) / 3),
        features: [
          { label: 'Cheeks', value: averageness >= 5 ? 'Balanced' : 'Full' },
          { label: 'Jaw blur', value: result.angularityScore >= 5 ? 'Low' : 'Moderate' },
          { label: 'Under-chin', value: result.angularityScore >= 5.5 ? 'Lean' : 'Soft' },
          { label: 'Estimate', value: result.angularityScore >= 6 ? '12-16%' : '18-24%' },
        ],
        explanation: 'Facial-fat percentage is an apparent visual estimate based on cheek fullness, jawline clarity, under-chin softness, and visible soft-tissue distribution. It is not a medical body-fat measurement.',
      },
      {
        id: 'biological-age',
        title: 'Biological age',
        subtitle: 'Visible youthfulness and skin presentation cues',
        scoreLabel: 'Age signal',
        score: clampCategoryScore((skin + presentation + averageness) / 3),
        features: [
          { label: 'Texture', value: skin >= 5 ? 'Clear' : 'Variable' },
          { label: 'Under-eye', value: presentation >= 5 ? 'Fresh' : 'Tired' },
          { label: 'Fullness', value: averageness >= 5 ? 'Stable' : 'Reduced' },
          { label: 'Presentation', value: presentation >= 5 ? 'Clean' : 'Noisy' },
        ],
        explanation: 'Biological-age signal is estimated from visible skin quality, under-eye presentation, facial fullness, and image presentation quality.',
      },
      {
        id: 'symmetry',
        title: 'Symmetry',
        subtitle: 'Left-right balance across visible landmarks',
        scoreLabel: 'Symmetry',
        score: clampCategoryScore(symmetry),
        features: [
          { label: 'Eye level', value: symmetry >= 5 ? 'Aligned' : 'Uneven' },
          { label: 'Nose axis', value: symmetry >= 5 ? 'Centered' : 'Offset' },
          { label: 'Mouth axis', value: symmetry >= 5 ? 'Level' : 'Tilted' },
          { label: 'Chin point', value: symmetry >= 5 ? 'Centered' : 'Shifted' },
        ],
        explanation: 'Symmetry is assessed from visible left-right alignment of the eye line, nose axis, mouth line, and chin position.',
      },
      {
        id: 'overall',
        title: 'Overall PSL',
        subtitle: 'Final calibrated PSL assessment',
        scoreLabel: 'PSL score',
        score: clampPslScore(pslScore),
        features: [
          { label: 'Harmony', value: harmony.toFixed(1) },
          { label: 'Dimorphism', value: result.dimorphismScore.toFixed(1) },
          { label: 'Angularity', value: result.angularityScore.toFixed(1) },
          { label: 'Percentile', value: result.percentile == null ? 'Pending' : `${Math.round(result.percentile)}%` },
        ],
        explanation: 'The overall PSL is the app-wide score used across the report, leaderboard, and battle context. It is calibrated on the 0 to 8 PSL scale.',
      },
    ],
  }
}
