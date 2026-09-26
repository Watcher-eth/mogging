import { expect, test } from 'bun:test'
import { categoryOptions, categoryScoreMax, getOverlayPreset, type ContentSlide } from './content-generator'
import { drawScoreReveal, REVEAL_SETTLED_MS } from './score-reveal'

const slide: ContentSlide = {
  id: 'reveal', templateId: 'cta', imageId: null, categoryId: 'psl', eyebrow: 'Mogging',
  headline: 'Get your score on mogging.com', supportingCopy: '', metricLabel: 'PSL score', metricValue: '6.4 / 8',
  cta: '', currentScore: '8', potentialScore: '9',
  categoryScores: categoryOptions.map(category => ({ categoryId: category.id, label: category.label, value: category.id === 'psl' ? '6.4' : '8' })),
}

test('all mobile report categories and scored overall features are selectable', () => {
  const ids = new Set(categoryOptions.map(category => category.id))
  for (const id of ['eyes', 'nose', 'mouth', 'jaw', 'dimorphism', 'face-shape', 'skin-age', 'symmetry', 'sun-damage', 'facial-fat', 'overall', 'cheekbones', 'skin-quality', 'psl']) {
    expect(ids.has(id as typeof categoryOptions[number]['id'])).toBe(true)
  }
  expect(getOverlayPreset({ ...slide, categoryId: 'skin-age' })).toBe(getOverlayPreset({ ...slide, categoryId: 'biological-age' }))
  expect(categoryScoreMax('psl')).toBe(8)
})

test('settled exports include every selected stat and preserve the PSL scale', () => {
  const labels: string[] = []
  const context = new Proxy({}, { get: (_target, key) => key === 'fillText' ? (label: string) => labels.push(label) : () => {} }) as CanvasRenderingContext2D
  drawScoreReveal(context, slide, null, null, null, 1080, 1080, REVEAL_SETTLED_MS)
  for (const category of slide.categoryScores) expect(labels).toContain(category.label.toUpperCase())
  expect(labels).toContain('/ 8')
  expect(labels).toContain('6.4')
  expect(labels).toContain('7.2') // 9/10 potential becomes 7.2/8, as in the mobile report.
  expect(labels).toContain('Get your score on')
  expect(labels).toContain('mogging.com')
})
