import { buildMockOverallCategory } from './mock-report-data'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'

export const outputFormats = {
  vertical: { label: '9:16 · Stories', width: 1080, height: 1920 },
  portrait: { label: '2:3 · Original (default)', width: 1080, height: 1620 },
  square: { label: '1:1 · Square', width: 1080, height: 1080 },
} as const

export type OutputFormatId = keyof typeof outputFormats
export type CampaignGoal = 'conversion' | 'engagement' | 'traffic'
export type Tone = 'direct' | 'curious' | 'educational'
export type SlideTemplateId = 'editorial' | 'score-potential' | 'psl' | 'score-rows' | 'cta' | 'mock-report' | 'phone-report' | 'handheld-report' | 'paper-editorial' | 'performance' | 'precision' | 'quiet-editorial' | 'afterimage' | 'glamour-guidance'

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
  retouch?: { feature: import('./video-semantics').SemanticBeat['feature']; operation: import('./video-semantics').SemanticBeat['operation']; baselineImageId: string }
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
  potentialScale?: 8 | 10
  potentialCurrentScore?: number
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
  { id: 'score-potential', label: 'Report share · Score & potential', description: 'The app’s portrait share layout with score and potential' },
  { id: 'precision', label: 'Precision · Feature study', description: 'Monochrome editorial slices and one selected feature score' },
  { id: 'cta', label: 'Face scan · Score reveal', description: 'Animated category rings and report stats' },
  { id: 'performance', label: 'Performance · Score cover', description: 'Sculptural monochrome portrait and a commanding score' },
  { id: 'phone-report', label: 'Report · iPhone edition', description: 'The actual report inside an iPhone frame' },
  { id: 'afterimage', label: 'Afterimage · Motion edition', description: 'A sharp portrait and teal light trails, with current and potential scores' },
  { id: 'editorial', label: 'Portrait · Glow-up', description: 'A portrait with your glow-up headline' },
  { id: 'handheld-report', label: 'Report · In your hand', description: 'A photographed handheld phone with your live report' },
]

// Creator-owned branding must never become a shared default.
export const GLAMOUR_CREATOR_PROFILE_ID = '1c822ac8-ae5f-4ba4-bb7b-e504c6046ce1'

export function creatorTemplateOptions(creatorProfileId?: string | null) {
  return creatorProfileId === GLAMOUR_CREATOR_PROFILE_ID
    ? [{ id: 'glamour-guidance' as const, label: 'Glamour Guidance · Exclusive', description: 'Portrait cutout, bold headlines and current-to-potential scores' }, ...templateOptions]
    : templateOptions
}

export function generateSlides({
  tone,
  creatorProfileId,
  seed,
  selectedCategories,
  images,
  primaryCategory,
  currentScore = '',
  potentialScore = '',
  scoreValues = {},
}: {
  creatorProfileId?: string | null
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
  const hooks: Record<Tone, string[]> = { direct: ['Time to ascend.', 'Start your glow-up.', 'Unlock your potential.'], curious: ['Your glow-up starts here.', 'Ready to ascend?', 'Meet your potential.'], educational: ['Find your glow-up.', 'Build your best look.', 'Your next chapter.'] }
  const hook = hooks[tone][seed % hooks[tone].length]
  const readyImages = images.filter((image) => image.status === 'ready')
  if (!readyImages.length) return []
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
  const exclusive: ContentSlide[] = creatorProfileId === GLAMOUR_CREATOR_PROFILE_ID ? [{
    id: makeId('glamour-guidance'), templateId: 'glamour-guidance', imageId: readyImages[0].id,
    categoryId: featuredCategory, eyebrow: 'Glamour Guidance', headline: 'WHAT MAKES YOU',
    supportingCopy: 'Discover your features. Unlock your potential.', metricLabel: categoryLabel,
    metricValue, cta: 'GET YOUR FACIAL ANALYSIS', ...shared,
  }] : []
  return [
    ...exclusive,
    { id: makeId('score-potential'), templateId: 'score-potential', imageId: readyImages[0].id, categoryId: featuredCategory, eyebrow: '', headline: 'Mogging', supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: '', ...shared },
    { id: makeId('precision'), templateId: 'precision', imageId: readyImages[1 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: '', headline: 'Feature study', supportingCopy: 'Understand the details. Build your next move.', metricLabel: categoryLabel, metricValue, cta: 'Start at Mogging.com', ...shared },
    { id: makeId('cta'), templateId: 'cta', imageId: readyImages.at(-1)?.id ?? readyImages[0].id, categoryId: featuredCategory, eyebrow: 'Mogging', headline: 'Mogging', supportingCopy: '', metricLabel: categoryLabel, metricValue: '[ mapped ]', cta: '', ...shared },
    { id: makeId('performance'), templateId: 'performance', imageId: readyImages[0].id, categoryId: featuredCategory,
      eyebrow: '', headline: 'See what makes you stand out.', supportingCopy: 'A clearer picture of your potential.', metricLabel: categoryLabel, metricValue, cta: 'Start at Mogging.com', ...shared },
    { id: makeId('phone-report'), templateId: 'phone-report', imageId: readyImages[0].id, categoryId: 'overall',
      eyebrow: '', headline: 'Ascend Now', supportingCopy: 'mogging.com', metricLabel: 'Overall', metricValue: currentScore, cta: '', ...shared,
      mockReport: { category: buildMockOverallCategory(currentScore, scoreValues), scroll: 0 } },    { id: makeId('afterimage'), templateId: 'afterimage', imageId: readyImages[1 % readyImages.length].id, categoryId: featuredCategory,
      eyebrow: '', headline: 'See where you can improve.', supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: '', ...shared },
    { id: makeId('editorial'), templateId: 'editorial', imageId: readyImages[1 % readyImages.length].id, categoryId: featuredCategory, eyebrow: '', headline: hook, supportingCopy: '', metricLabel: categoryLabel, metricValue, cta: 'mogging.com', ...shared },
    { id: makeId('handheld-report'), templateId: 'handheld-report', imageId: readyImages[0].id, categoryId: 'overall',
      eyebrow: '', headline: 'Mogging: Face Scan', supportingCopy: '', metricLabel: 'Overall', metricValue: currentScore, cta: '', ...shared,
      mockReport: { category: buildMockOverallCategory(currentScore, scoreValues), scroll: 0 } },
  ]
}

export function getOverlayPreset(slide: ContentSlide) {
  const aliases: Record<string, string> = { cheekbones: 'face-shape', 'skin-quality': 'skin-age', psl: 'overall' }
  const preset = getReportOverlayPreset(aliases[slide.categoryId] ?? slide.categoryId)
  return preset
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
