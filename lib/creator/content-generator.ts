import { reportOverlayPresets } from '../../../MoggingMobile/src/overlay-engine/report-presets'

export const outputFormats = {
  vertical: { label: 'TikTok / Reels / Stories', width: 1080, height: 1920 },
  portrait: { label: 'Instagram portrait', width: 1080, height: 1350 },
  square: { label: 'Square', width: 1080, height: 1080 },
} as const

export type OutputFormatId = keyof typeof outputFormats
export type CampaignGoal = 'conversion' | 'engagement' | 'traffic'
export type Tone = 'direct' | 'curious' | 'educational'
export type SlideTemplateId = 'editorial' | 'score-potential' | 'psl' | 'score-rows' | 'cta'

export type CategoryScore = {
  categoryId: string
  label: string
  value: string
}

export type GeneratorImage = {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
  landmarks: import('@/lib/analysis/landmarks').FaceLandmarksPayload | null
  status: 'detecting' | 'ready' | 'warning' | 'no-face'
  warning?: string
}

export type ContentSlide = {
  id: string
  templateId: SlideTemplateId
  imageId: string | null
  categoryId: string
  eyebrow: string
  headline: string
  supportingCopy: string
  metricLabel: string
  metricValue: string
  cta: string
  currentScore: string
  potentialScore: string
  categoryScores: CategoryScore[]
}

export type SavedCampaign = {
  id: string
  createdAt: string
  formatId: OutputFormatId
  name: string
  slides: ContentSlide[]
}

export const categoryOptions = [
  { id: 'eyes', label: 'Eyes analysis' },
  { id: 'nose', label: 'Nose analysis' },
  { id: 'mouth', label: 'Mouth / lip analysis' },
  { id: 'jaw', label: 'Jaw analysis' },
  { id: 'symmetry', label: 'Symmetry analysis' },
  { id: 'face-shape', label: 'Face-shape analysis' },
  { id: 'overall', label: 'Overall report' },
] as const

export const templateOptions: Array<{ id: SlideTemplateId; label: string; description: string }> = [
  { id: 'editorial', label: 'Editorial report', description: 'Current image-first Mogging layout' },
  { id: 'score-potential', label: 'Current + potential', description: 'Selected category with two score cards' },
  { id: 'psl', label: 'PSL comparison', description: 'PSL headline with current and potential' },
  { id: 'score-rows', label: 'Category scorecard', description: 'Rows for each selected report category' },
  { id: 'cta', label: 'Mogging score reveal', description: 'Circular portrait with current and potential scores' },
]

const hooks: Record<CampaignGoal, Record<Tone, string[]>> = {
  conversion: {
    direct: ['Your face map is ready.', 'See what your features reveal.', 'Turn one photo into a full breakdown.'],
    curious: ['What does your face map reveal?', 'Your strongest feature might surprise you.', 'Ever seen your features mapped like this?'],
    educational: ['A closer look at visible facial structure.', 'How Mogging maps facial landmarks.', 'A feature-by-feature facial breakdown.'],
  },
  engagement: {
    direct: ['Rate the breakdown.', 'Which feature stands out first?', 'Save this face-map format.'],
    curious: ['Which measurement would you check first?', 'Do you see the same structure?', 'What should we map next?'],
    educational: ['Compare each mapped region.', 'Follow the landmarks from eyes to jaw.', 'See how facial regions align.'],
  },
  traffic: {
    direct: ['Get your own Mogging report.', 'Run your face map in the Mogging app.', 'Your full breakdown is one tap away.'],
    curious: ['Want to see your own face map?', 'What would your report find?', 'Ready to map your strongest features?'],
    educational: ['Explore the full report in Mogging.', 'See every mapped category in the app.', 'Open the complete feature breakdown.'],
  },
}

const supportByCategory: Record<string, string> = {
  eyes: 'Mapping the eye line, spacing, and visible periocular balance.',
  nose: 'Tracing the bridge and central facial axis from real landmarks.',
  mouth: 'Following the visible lip contour and resting mouth line.',
  jaw: 'Mapping the mandible path from jaw anchors to the chin.',
  symmetry: 'Comparing visible left-right alignment across the face map.',
  'face-shape': 'Tracing the facial outline, cheekbone width, and jaw frame.',
  overall: 'Bringing every mapped region into one structured report.',
}

const categoryTitle: Record<string, string> = {
  eyes: 'The eye line sets the frame',
  nose: 'The center axis tells the story',
  mouth: 'The lip contour, mapped',
  jaw: 'Follow the jawline structure',
  symmetry: 'Alignment across the face',
  'face-shape': 'The full facial frame',
  overall: 'Your face map, assembled',
}

export function generateSlides({
  campaignGoal,
  tone,
  selectedCategories,
  images,
  offer,
  seed,
  primaryCategory,
  currentScore = '',
  potentialScore = '',
  scoreValues = {},
}: {
  campaignGoal: CampaignGoal
  tone: Tone
  selectedCategories: string[]
  images: GeneratorImage[]
  offer: string
  seed: number
  primaryCategory?: string
  currentScore?: string
  potentialScore?: string
  scoreValues?: Record<string, string>
}): ContentSlide[] {
  const readyImages = images.filter((image) => image.status === 'ready')
  if (!readyImages.length) return []
  const hookSet = hooks[campaignGoal][tone]
  const hook = hookSet[seed % hookSet.length]
  const featuredCategory = primaryCategory && selectedCategories.includes(primaryCategory) ? primaryCategory : selectedCategories[0] ?? 'overall'
  const categoryLabel = categoryOptions.find((item) => item.id === featuredCategory)?.label.replace(' analysis', '') ?? 'Overall'
  const categoryScores = selectedCategories.map((categoryId) => ({
    categoryId,
    label: categoryOptions.find((item) => item.id === categoryId)?.label.replace(' analysis', '') ?? categoryId,
    value: scoreValues[categoryId] ?? '',
  }))
  const cta = adaptCta(campaignGoal, offer)
  const metricScore = scoreValues[featuredCategory] || currentScore
  const metricValue = metricScore ? `${metricScore} / 10` : '— / 10'
  const shared = { currentScore, potentialScore, categoryScores }
  return [
    {
      id: makeId('editorial'), templateId: 'editorial', imageId: readyImages[0].id, categoryId: featuredCategory,
      eyebrow: 'Mogging // face report', headline: hook, supportingCopy: supportByCategory[featuredCategory] ?? 'Real facial landmarks. One clear visual breakdown.', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('score-potential'), templateId: 'score-potential', imageId: readyImages[1 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: `Category // ${categoryLabel}`, headline: categoryTitle[featuredCategory] ?? 'Visible structure, mapped', supportingCopy: supportByCategory[featuredCategory] ?? 'Mapped from visible facial landmarks.', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('psl'), templateId: 'psl', imageId: readyImages[2 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: 'Mogging // PSL', headline: 'PSL', supportingCopy: 'Current and creator-entered potential, shown against the mapped face.', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('score-rows'), templateId: 'score-rows', imageId: readyImages[3 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: 'Mogging // scorecard', headline: 'Feature breakdown', supportingCopy: 'Selected report categories in one shareable scorecard.', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('cta'), templateId: 'cta', imageId: readyImages.at(-1)?.id ?? readyImages[0].id, categoryId: featuredCategory,
      eyebrow: 'Mogging', headline: cta, supportingCopy: 'Current and creator-entered potential scores.', metricLabel: categoryLabel, metricValue: '[ mapped ]', cta, ...shared,
    },
  ]
}

export function getOverlayPreset(slide: ContentSlide) {
  return reportOverlayPresets[slide.categoryId] ?? reportOverlayPresets.overall
}

function adaptCta(goal: CampaignGoal, offer: string) {
  if (goal === 'engagement') return 'Which feature would you map first?'
  if (goal === 'traffic') return `See your full report with ${offer || 'Mogging'}. Link in bio.`
  return `Map your features with ${offer || 'Mogging'}.`
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
