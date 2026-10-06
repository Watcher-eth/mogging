import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'

export const outputFormats = {
  vertical: { label: 'Vertical video / Stories', width: 1080, height: 1920 },
  portrait: { label: 'Portrait CTA · 2:3 (recommended)', width: 1080, height: 1620 },
  square: { label: 'Square', width: 1080, height: 1080 },
} as const

export type OutputFormatId = keyof typeof outputFormats
export type CampaignGoal = 'conversion' | 'engagement' | 'traffic'
export type Tone = 'direct' | 'curious' | 'educational'
export type SlideTemplateId = 'editorial' | 'score-potential' | 'psl' | 'score-rows' | 'cta' | 'mock-report'

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
  status: 'loading' | 'detecting' | 'ready' | 'warning' | 'no-face'
  warning?: string
}

export type ContentSlide = {
  id: string
  templateId: SlideTemplateId
  overlayStyle?: 'category' | 'face-map'
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
  mockReport?: { category: import('./mobile-overlay-engine/report-data').ReportCategory; scroll: number }
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
  { id: 'dimorphism', label: 'Dimorphism' },
  { id: 'skin-age', label: 'Skin Age' },
  { id: 'sun-damage', label: 'UV context' },
  { id: 'facial-fat', label: 'Facial definition' },
  { id: 'cheekbones', label: 'Cheekbone structure' },
  { id: 'skin-quality', label: 'Skin quality' },
  { id: 'psl', label: 'PSL score' },
  { id: 'symmetry', label: 'Symmetry analysis' },
  { id: 'face-shape', label: 'Face-shape analysis' },
  { id: 'overall', label: 'Overall report' },
] as const

export function categoryScoreMax(categoryId: string) { return categoryId === 'psl' ? 8 : 10 }

export const templateOptions: Array<{ id: SlideTemplateId; label: string; description: string }> = [
  { id: 'score-potential', label: 'Mobile report share', description: 'The mobile share layout with total score and potential' },
  { id: 'editorial', label: 'Glow-up', description: 'A short, image-first call to action' },
  { id: 'psl', label: 'PSL comparison', description: 'PSL headline with current and potential' },
  { id: 'score-rows', label: 'Category scorecard', description: 'Rows for each selected report category' },
  { id: 'cta', label: 'Mogging score reveal', description: 'Animated category score rings and report stats' },
]

const hooks: Record<Tone, string[]> = {
  direct: ['Time to ascend.', 'Start your glow-up.', 'Unlock your potential.'],
  curious: ['Your glow-up starts here.', 'Ready to ascend?', 'Meet your potential.'],
  educational: ['Find your glow-up.', 'Build your best look.', 'Your next chapter.'],
}
export function generateSlides({
  tone,
  selectedCategories,
  images,
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
  const hookSet = hooks[tone]
  const hook = hookSet[seed % hookSet.length]
  const featuredCategory = primaryCategory && selectedCategories.includes(primaryCategory) ? primaryCategory : selectedCategories[0] ?? 'overall'
  const categoryLabel = categoryOptions.find((item) => item.id === featuredCategory)?.label.replace(' analysis', '') ?? 'Overall'
  const categoryScores = selectedCategories.map((categoryId) => ({
    categoryId,
    label: categoryOptions.find((item) => item.id === categoryId)?.label.replace(' analysis', '') ?? categoryId,
    value: scoreValues[categoryId] ?? '',
  }))
  const metricScore = scoreValues[featuredCategory] || currentScore
  const metricValue = `${metricScore || '—'} / ${categoryScoreMax(featuredCategory)}`
  const shared = { currentScore, potentialScore, categoryScores }
  return [
    {
      id: makeId('score-potential'), templateId: 'score-potential', imageId: readyImages[0].id, categoryId: featuredCategory,
      eyebrow: '', headline: 'Mogging', supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('editorial'), templateId: 'editorial', imageId: readyImages[1 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: '', headline: hook, supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: 'mogging.com', ...shared,
    },
    {
      id: makeId('psl'), templateId: 'psl', imageId: readyImages[2 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: '', headline: 'PSL', supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('score-rows'), templateId: 'score-rows', imageId: readyImages[3 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: 'Mogging // scorecard', headline: 'Feature breakdown', supportingCopy: 'Selected report categories in one shareable scorecard.', metricLabel: categoryLabel, metricValue, cta: '', ...shared,
    },
    {
      id: makeId('cta'), templateId: 'cta', imageId: readyImages.at(-1)?.id ?? readyImages[0].id, categoryId: featuredCategory,
      eyebrow: 'Mogging', headline: 'Mogging', supportingCopy: 'Current and creator-entered potential scores.', metricLabel: categoryLabel, metricValue: '[ mapped ]', cta: '', ...shared,
    },
  ]
}

export function getOverlayPreset(slide: ContentSlide) {
  const aliases: Record<string, string> = { cheekbones: 'face-shape', 'skin-quality': 'skin-age', psl: 'overall' }
  return getReportOverlayPreset(aliases[slide.categoryId] ?? slide.categoryId)
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
