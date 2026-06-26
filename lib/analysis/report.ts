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

function pslToCategoryScore(score: number) {
  return clampCategoryScore((clampPslScore(score) / 8) * 10)
}

function visibleAgeSignalScore(result: AnalysisProviderResult) {
  const skin = categoryAverage(result, 'skin', result.harmonyScore)
  const presentation = categoryAverage(result, 'presentation', result.harmonyScore)
  return clampCategoryScore(skin * 0.64 + presentation * 0.36)
}

function normalizeFeatureValue(value: string) {
  return value
    .replace(/^aligned$/i, 'near level')
    .replace(/^centered$/i, 'minimal drift')
    .replace(/^balanced$/i, 'balanced range')
    .replace(/^clean$/i, 'clear contour')
    .replace(/^high$/i, 'strong signal')
    .replace(/^measured$/i, 'tracked')
    .replace(/^\[\s*measured\s*\]$/i, 'tracked')
    .replace(/^\[\s*centered\s*\]$/i, 'minimal drift')
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

function createFeature(label: string, value: string) {
  return { label, value }
}

function ensureCategoryFeatures(
  categoryId: string,
  features: Array<{ label: string; value: string }>,
  result?: AnalysisProviderResult,
) {
  const normalized = [...features]
  const labels = new Set(normalized.map((feature) => feature.label.toLowerCase()))
  const add = (label: string, value: string) => {
    if (!labels.has(label.toLowerCase())) {
      normalized.push(createFeature(label, value))
      labels.add(label.toLowerCase())
    }
  }

  if (categoryId === 'biological-age') {
    add('Skin damage', result ? (categoryAverage(result, 'skin', result.harmonyScore) >= 5 ? 'low visible signal' : 'visible tone signal') : 'tracked')
  } else if (categoryId === 'facial-fat') {
    add('Fullness cue', 'visible fullness')
  } else if (categoryId === 'sun-damage') {
    add('UV sensitivity', 'tracked context')
  } else if (categoryId === 'overall') {
    add('Potential PSL', result ? `${createPotentialRubric(result, clampPslScore(result.pslScore ?? 5)).score.toFixed(1)}/8` : 'tracked')
  }

  const fallbackFeatures: Record<string, Array<{ label: string; value: string }>> = {
    eyes: [createFeature('Eye spacing', 'tracked proportion'), createFeature('Lid support', 'tracked contour')],
    nose: [createFeature('Bridge projection', 'tracked depth'), createFeature('Midface fit', 'tracked proportion')],
    mouth: [createFeature('Lower-third fit', 'tracked proportion'), createFeature('Lip balance', 'tracked contour')],
    jaw: [createFeature('Neck transition', 'tracked contour'), createFeature('Lower third', 'tracked proportion')],
    dimorphism: [createFeature('Feature contrast', 'tracked signal'), createFeature('Maturity cue', 'tracked signal')],
    'face-shape': [createFeature('Silhouette', 'tracked outline'), createFeature('Cheekbone width', 'tracked proportion')],
    'facial-fat': [createFeature('Under-chin', 'tracked softness'), createFeature('Jaw clarity', 'tracked contour')],
    'biological-age': [createFeature('Presentation', 'tracked clarity'), createFeature('Under-eye cue', 'tracked shadowing')],
    symmetry: [createFeature('Chin axis', 'tracked midline'), createFeature('Paired points', 'tracked drift')],
    'sun-damage': [createFeature('Tone evenness', 'tracked tone'), createFeature('Texture signal', 'tracked texture')],
    overall: [createFeature('Percentile', `${result?.percentile ?? 50}%`), createFeature('Consistency', 'tracked baseline')],
  }

  for (const feature of fallbackFeatures[categoryId] ?? fallbackFeatures.overall) {
    if (normalized.length >= 4) break
    add(feature.label, feature.value)
  }

  return normalized.slice(0, 6).map((feature) => ({
    ...feature,
    label: normalizeFeatureLabel(categoryId, feature.label),
    value: normalizeFeatureValue(feature.value),
  }))
}

function normalizeFeatureLabel(categoryId: string, label: string) {
  if (categoryId === 'eyes' && /eye line|eye level/i.test(label)) return 'Eye line tilt'
  if (categoryId === 'nose' && /axis|tip position/i.test(label)) return 'Midline drift'
  if (categoryId === 'mouth' && /resting line|mouth axis/i.test(label)) return 'Mouth line tilt'
  if (categoryId === 'symmetry' && /eye level|eye line/i.test(label)) return 'Eye line tilt'
  if (categoryId === 'symmetry' && /nose axis/i.test(label)) return 'Nose midline'
  if (categoryId === 'symmetry' && /mouth axis/i.test(label)) return 'Mouth line tilt'
  if (categoryId === 'biological-age' && /human age|skin age/i.test(label)) return 'Apparent age'
  return label
}

function readApparentAge(features: Array<{ label: string; value: string }>, fallback: number) {
  const ageFeature = features.find((feature) => /apparent age|human age|skin age/i.test(feature.label) && /\d/.test(feature.value))
  const match = ageFeature?.value.match(/\d{2}/)
  return match ? Math.max(18, Math.min(80, Number(match[0]))) : fallback
}

function createPotentialRubric(result: AnalysisProviderResult, pslScore: number) {
  const signals = [
    { label: 'symmetry', score: result.symmetryScore ?? categoryAverage(result, 'symmetry', result.harmonyScore), area: 'symmetry' },
    { label: 'proportion', score: result.proportionalityScore ?? categoryAverage(result, 'proportionality', result.harmonyScore), area: 'proportions' },
    { label: 'skin', score: categoryAverage(result, 'skin', result.harmonyScore), area: 'skin texture' },
    { label: 'presentation', score: categoryAverage(result, 'presentation', result.harmonyScore), area: 'presentation' },
    { label: 'jaw', score: result.angularityScore, area: 'lower-third definition' },
  ].sort((a, b) => a.score - b.score)
  const focusAreas = signals.slice(0, 3).map((signal) => signal.area)
  const lift = Math.max(0.3, Math.min(1.2, signals.slice(0, 3).reduce((sum, signal) => sum + Math.max(0, 6.7 - signal.score), 0) / 7))
  const score = clampPslScore(pslScore + lift)

  return {
    score,
    label: score >= 7 ? 'High ceiling' : score >= 6 ? 'Strong upside' : 'Clear upside',
    summary: `Most upside comes from ${focusAreas.join(', ')}. Improve those signals first before chasing smaller details.`,
    focusAreas,
  }
}

export function normalizeAnalysisReport(
  report: AnalysisReport | null | undefined,
  pslScore: number,
  result?: AnalysisProviderResult,
): AnalysisReport | null {
  if (!report) return null

  const categories = reportCategoryIds.map((id) => report.categories.find((category) => category.id === id))
  if (categories.some((category) => !category)) return null

  return {
    summary: report.summary,
    potential: report.potential ?? (result ? createPotentialRubric(result, clampPslScore(pslScore)) : undefined),
    categories: categories.map((category) => {
      if (category!.id === 'overall') {
        return {
          ...category!,
          score: pslToCategoryScore(pslScore),
          title: 'Overall',
          scoreLabel: 'Overall score',
          features: ensureCategoryFeatures(category!.id, [
            { label: 'PSL calibration', value: `${clampPslScore(pslScore).toFixed(1)}/8` },
            ...category!.features,
          ], result),
        }
      }
      if (category!.id === 'biological-age') {
        const apparentAge = readApparentAge(category!.features, category!.score > 10 ? category!.score : 24)
        return {
          ...category!,
          title: 'Human age',
          subtitle: 'Visible age cues',
          scoreLabel: 'Age signal',
          score: category!.score > 10 ? (result ? visibleAgeSignalScore(result) : clampCategoryScore(8.8 - Math.abs(apparentAge - 24) * 0.16)) : clampCategoryScore(category!.score),
          features: ensureCategoryFeatures(category!.id, [
            { label: 'Apparent age', value: `${Math.round(apparentAge)} years` },
            ...category!.features.map((feature) => ({
              ...feature,
              label: /skin age/i.test(feature.label) ? 'Texture age cue' : feature.label,
            })),
          ], result),
        }
      }
      if (category!.id === 'facial-fat') {
        return {
          ...category!,
          title: 'Soft tissue',
          subtitle: 'Visible facial fullness',
          scoreLabel: 'Soft tissue',
          features: ensureCategoryFeatures(category!.id, category!.features.map((feature) => ({
            ...feature,
            label: /facial fat|body fat|estimate/i.test(feature.label) ? 'Fullness cue' : feature.label,
            value: /%/.test(feature.value) ? 'Visible' : feature.value,
          })), result),
        }
      }
      return { ...category!, score: clampCategoryScore(category!.score), features: ensureCategoryFeatures(category!.id, category!.features, result) }
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
    potential: createPotentialRubric(result, pslScore),
    categories: [
      {
        id: 'eyes',
        title: 'Eyes',
        subtitle: 'Periocular balance and eye-line structure',
        scoreLabel: 'Eye area',
        score: clampCategoryScore((harmony + symmetry + proportionality) / 3),
        features: [
          { label: 'Eye line tilt', value: symmetry >= 7 ? 'near level' : symmetry >= 5 ? 'mild tilt' : 'visible tilt' },
          { label: 'Eye spacing', value: proportionality >= 7 ? 'balanced width' : proportionality >= 5 ? 'slightly wide/narrow' : 'noticeably uneven' },
          { label: 'Lid support', value: harmony >= 7 ? 'strong contour' : harmony >= 5 ? 'moderate support' : 'soft support' },
          { label: 'Periocular match', value: `${clampCategoryScore(symmetry).toFixed(1)}/10` },
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
          { label: 'Midline drift', value: symmetry >= 7 ? 'minimal drift' : symmetry >= 5 ? 'mild drift' : 'visible drift' },
          { label: 'Nose width', value: proportionality >= 7 ? 'balanced to midface' : proportionality >= 5 ? 'slightly prominent' : 'dominant width' },
          { label: 'Bridge line', value: harmony >= 7 ? 'straight contour' : harmony >= 5 ? 'minor unevenness' : 'visible unevenness' },
          { label: 'Midface fit', value: `${clampCategoryScore(proportionality).toFixed(1)}/10` },
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
          { label: 'Mouth width', value: proportionality >= 7 ? 'balanced to jaw' : proportionality >= 5 ? 'slightly narrow/wide' : 'out of proportion' },
          { label: 'Mouth line tilt', value: symmetry >= 7 ? 'near level' : symmetry >= 5 ? 'mild tilt' : 'visible tilt' },
          { label: 'Lip volume', value: averageness >= 7 ? 'balanced fullness' : averageness >= 5 ? 'moderate fullness' : 'low fullness' },
          { label: 'Lower-third fit', value: `${clampCategoryScore(harmony).toFixed(1)}/10` },
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
          { label: 'Mandible', value: result.angularityScore >= 5 ? 'clear edge definition' : 'soft edge definition' },
          { label: 'Chin support', value: proportionality >= 5 ? 'balanced projection' : 'limited projection' },
          { label: 'Jaw angle', value: result.angularityScore >= 5.5 ? 'crisp angle' : 'moderate angle' },
          { label: 'Neck transition', value: result.angularityScore >= 6 ? 'clear contour' : 'soft contour' },
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
          { label: 'Brow frame', value: result.dimorphismScore >= 5 ? 'visible structure' : 'subtle structure' },
          { label: 'Lower third', value: result.angularityScore >= 5 ? 'structured contour' : 'soft contour' },
          { label: 'Cue strength', value: result.dimorphismScore >= 6 ? 'strong signal' : 'moderate signal' },
          { label: 'Feature contrast', value: harmony >= 6 ? 'balanced contrast' : 'variable contrast' },
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
          { label: 'Outline', value: harmony >= 5 ? 'continuous outline' : 'uneven outline' },
          { label: 'Thirds', value: proportionality >= 5 ? 'balanced thirds' : 'uneven thirds' },
          { label: 'Frame', value: result.angularityScore >= 5 ? 'defined frame' : 'soft frame' },
          { label: 'Cheekbone width', value: proportionality >= 6 ? 'strong width' : 'tracked width' },
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
          { label: 'Cheeks', value: averageness >= 5 ? 'balanced fullness' : 'visible fullness' },
          { label: 'Jaw blur', value: result.angularityScore >= 5 ? 'low blur' : 'moderate blur' },
          { label: 'Under-chin', value: result.angularityScore >= 5.5 ? 'lean contour' : 'soft contour' },
          { label: 'Fullness cue', value: skin >= 5 ? 'low visible fullness' : 'visible fullness' },
        ],
        explanation: 'Soft-tissue signal is an apparent visual estimate based on cheek fullness, jawline clarity, under-chin softness, and visible distribution.',
        recommendation: 'Retake future scans with the same lighting, posture, and camera distance before judging soft-tissue fullness.',
      },
      {
        id: 'biological-age',
        title: 'Human age',
        subtitle: 'Visible age cues',
        scoreLabel: 'Age signal',
        score: visibleAgeSignalScore(result),
        features: [
          { label: 'Apparent age', value: `${estimatedAge} years` },
          { label: 'Texture age cue', value: skin >= 6 ? 'Younger' : skin >= 5 ? 'On pace' : 'Elevated' },
          { label: 'Under-eye cue', value: presentation >= 6 ? 'low shadowing' : presentation >= 5 ? 'moderate shadowing' : 'visible shadowing' },
          { label: 'Skin damage', value: skin >= 6 ? 'low visible signal' : skin >= 5 ? 'moderate signal' : 'visible tone signal' },
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
          { label: 'Eye line tilt', value: symmetry >= 7 ? 'near level' : symmetry >= 5 ? 'mild tilt' : 'visible tilt' },
          { label: 'Nose midline', value: symmetry >= 7 ? 'minimal drift' : symmetry >= 5 ? 'mild drift' : 'visible offset' },
          { label: 'Mouth line tilt', value: symmetry >= 7 ? 'near level' : symmetry >= 5 ? 'mild tilt' : 'visible tilt' },
          { label: 'Chin axis', value: symmetry >= 6 ? 'minor drift' : 'tracked drift' },
        ],
        explanation: 'Symmetry is assessed from visible left-right alignment of the eye line, nose midline, mouth line, and chin position.',
        recommendation: 'Retake future scans straight-on before judging whether the asymmetry is persistent.',
      },
      {
        id: 'sun-damage',
        title: 'UV context',
        subtitle: 'UV context and visible tone',
        scoreLabel: 'UV context',
        score: clampCategoryScore((skin + presentation) / 2),
        features: [
          { label: 'Pigmentation', value: skin >= 5 ? 'low visible pigment' : 'visible pigment' },
          { label: 'Redness', value: presentation >= 5 ? 'mild redness' : 'uneven redness' },
          { label: 'Texture', value: skin >= 5 ? 'stable texture' : 'variable texture' },
          { label: 'UV sensitivity', value: 'tracked context' },
        ],
        explanation: 'UV-context signal is a cosmetic visual estimate from visible uneven tone, pigmentation, redness, and texture cues.',
        recommendation: 'Use consistent outdoor context and neutral lighting so future scans compare visible tone and texture fairly.',
      },
      {
        id: 'overall',
        title: 'Overall',
        subtitle: 'Final calibrated assessment',
        scoreLabel: 'Overall score',
        score: pslToCategoryScore(pslScore),
        features: [
          { label: 'PSL calibration', value: `${clampPslScore(pslScore).toFixed(1)}/8` },
          { label: 'Harmony', value: harmony.toFixed(1) },
          { label: 'Dimorphism', value: result.dimorphismScore.toFixed(1) },
          { label: 'Angularity', value: result.angularityScore.toFixed(1) },
          { label: 'Potential PSL', value: `${createPotentialRubric(result, pslScore).score.toFixed(1)}/8` },
        ],
        explanation: 'The overall score is the public report score on a 0 to 10 scale. PSL calibration remains a secondary rubric signal for comparison contexts.',
        recommendation: 'Improve the lowest-scoring category first; one focused change beats scattered glow-up advice.',
      },
    ],
  }
}
