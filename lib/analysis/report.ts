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
  'sun-damage',
  'overall',
] as const

function clampCategoryScore(score: number) {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}

function clampPslScore(score: number) {
  return Math.max(0, Math.min(8, Math.round(score * 10) / 10))
}

function estimateBiologicalAge(result: AnalysisProviderResult) {
  const skin = categoryAverage(result, 'skin', result.harmonyScore)
  const presentation = categoryAverage(result, 'presentation', result.harmonyScore)
  const youthSignal = (skin + presentation + result.harmonyScore) / 3
  return Math.max(18, Math.min(80, Math.round(34 - (youthSignal - 5) * 3.1)))
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
    categories: categories.map((category) => {
      if (category!.id === 'overall') {
        return { ...category!, score: clampPslScore(pslScore), title: 'PSL Score', scoreLabel: 'PSL score' }
      }
      if (category!.id === 'biological-age') {
        return {
          ...category!,
          title: 'Human age',
          subtitle: 'Visible age cues',
          scoreLabel: 'Human age',
          score: Math.max(18, Math.min(80, Math.round(category!.score))),
          features: category!.features.map((feature) => ({
            ...feature,
            label: /skin age/i.test(feature.label) ? 'Texture age cue' : feature.label,
          })),
        }
      }
      if (category!.id === 'facial-fat') {
        return {
          ...category!,
          title: 'Soft tissue',
          subtitle: 'Visible facial fullness',
          scoreLabel: 'Soft tissue',
          features: category!.features.map((feature) => ({
            ...feature,
            label: /facial fat|body fat|estimate/i.test(feature.label) ? 'Fullness cue' : feature.label,
            value: /%/.test(feature.value) ? 'Visible' : feature.value,
          })),
        }
      }
      return { ...category!, score: clampCategoryScore(category!.score) }
    }),
  }
}

export function createFallbackAnalysisReport(result: AnalysisProviderResult, pslScore: number): AnalysisReport {
  const harmony = result.harmonyScore
  const symmetry = result.symmetryScore ?? categoryAverage(result, 'symmetry', harmony)
  const proportionality = result.proportionalityScore ?? categoryAverage(result, 'proportionality', harmony)
  const averageness = result.averagenessScore ?? categoryAverage(result, 'averageness', harmony)
  const skin = categoryAverage(result, 'skin', harmony)
  const presentation = categoryAverage(result, 'presentation', harmony)
  const estimatedAge = estimateBiologicalAge(result)

  return {
    summary: 'Calibrated PSL report generated from facial proportion, symmetry, averageness, dimorphism, angularity, texture, and presentation signals.',
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
        ],
        explanation: 'The eye area is estimated from local symmetry, spacing, lid support, and how well the periocular region fits the full facial frame.',
        recommendation: symmetry >= 6 ? 'Retake under consistent lighting and a neutral expression before judging the eye area across reports.' : 'Start with camera-neutral posture before judging whether the eye-area signal repeats.',
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
        ],
        explanation: 'Nasal balance is scored by central alignment, width relative to the midface, and how much the nose supports overall facial harmony.',
        recommendation: 'Compare several neutral front images before deciding whether nose balance is the main limiter.',
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
        ],
        explanation: 'The mouth score reflects lip width, resting symmetry, fullness, and how the feature sits within the lower third.',
        recommendation: 'Use neutral expression consistency and simple grooming before judging mouth balance.',
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
        ],
        explanation: 'Jaw scoring weighs mandibular definition, chin support, angularity, and whether the lower-third frame strengthens the face.',
        recommendation: result.angularityScore >= 6 ? 'Keep neck posture consistent; the jaw already has enough visible structure.' : 'Track straight-on posture and repeat scans before judging lower-third structure.',
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
        ],
        explanation: 'Dimorphism is scored from sex-typical facial cues while penalizing traits that overpower harmony or proportional balance.',
        recommendation: 'Use grooming and styling first; align brows, hair, and lower-third presentation before judging contrast.',
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
        ],
        explanation: 'Face-shape scoring combines facial thirds, visible silhouette continuity, and how the frame supports the central features.',
        recommendation: 'Improve haircut, framing, and camera posture first because those change the visible outline fastest.',
      },
      {
        id: 'facial-fat',
        title: 'Soft tissue',
        subtitle: 'Visible facial fullness',
        scoreLabel: 'Soft tissue',
        score: clampCategoryScore((skin + presentation + averageness) / 3),
        features: [
          { label: 'Cheeks', value: averageness >= 5 ? 'Balanced' : 'Full' },
          { label: 'Jaw blur', value: result.angularityScore >= 5 ? 'Low' : 'Moderate' },
          { label: 'Under-chin', value: result.angularityScore >= 5.5 ? 'Lean' : 'Soft' },
        ],
        explanation: 'Soft-tissue signal is an apparent visual estimate based on cheek fullness, jawline clarity, under-chin softness, and visible distribution.',
        recommendation: 'Retake future scans with the same lighting, posture, and camera distance before judging soft-tissue fullness.',
      },
      {
        id: 'biological-age',
        title: 'Human age',
        subtitle: 'Visible age cues',
        scoreLabel: 'Human age',
        score: estimatedAge,
        features: [
          { label: 'Human age', value: `${estimatedAge}` },
          { label: 'Texture age cue', value: skin >= 6 ? 'Younger' : skin >= 5 ? 'On pace' : 'Elevated' },
          { label: 'Texture cue', value: skin >= 6 ? 'Low' : skin >= 5 ? 'Moderate' : 'Visible' },
        ],
        explanation: 'Human-age signal is estimated from visible skin quality, under-eye presentation, facial fullness, and image presentation quality.',
        recommendation: 'Keep capture conditions consistent so future reports compare visible age cues fairly.',
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
        ],
        explanation: 'Symmetry is assessed from visible left-right alignment of the eye line, nose axis, mouth line, and chin position.',
        recommendation: 'Retake future scans straight-on before judging whether the asymmetry is persistent.',
      },
      {
        id: 'sun-damage',
        title: 'UV context',
        subtitle: 'UV context and visible tone',
        scoreLabel: 'UV context',
        score: clampCategoryScore((skin + presentation) / 2),
        features: [
          { label: 'Pigmentation', value: skin >= 5 ? 'Low' : 'Visible' },
          { label: 'Redness', value: presentation >= 5 ? 'Mild' : 'Uneven' },
          { label: 'Texture', value: skin >= 5 ? 'Stable' : 'Variable' },
        ],
        explanation: 'UV-context signal is a cosmetic visual estimate from visible uneven tone, pigmentation, redness, and texture cues.',
        recommendation: 'Use consistent outdoor context and neutral lighting so future scans compare visible tone and texture fairly.',
      },
      {
        id: 'overall',
        title: 'PSL Score',
        subtitle: 'Final calibrated PSL assessment',
        scoreLabel: 'PSL score',
        score: clampPslScore(pslScore),
        features: [
          { label: 'Harmony', value: harmony.toFixed(1) },
          { label: 'Dimorphism', value: result.dimorphismScore.toFixed(1) },
          { label: 'Angularity', value: result.angularityScore.toFixed(1) },
        ],
        explanation: 'The overall PSL is the app-wide score used across the report, leaderboard, and battle context. It is calibrated on the 0 to 8 PSL scale.',
        recommendation: 'Improve the lowest-scoring category first; one focused change beats scattered glow-up advice.',
      },
    ],
  }
}
