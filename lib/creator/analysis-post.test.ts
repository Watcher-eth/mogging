import { describe, expect, test } from 'bun:test'
import { analysisPostBrief, analysisPostScript, buildAnalysisPost, type AnalysisPostInput } from './analysis-post'

const input: AnalysisPostInput = {
  formatId: 'score-reveal', subject: 'Alex', hook: 'What if attractiveness could be mapped?', overallScore: '7.1', potentialScore: '8.2',
  strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2',
  recommendation: 'Prioritize posture, grooming and consistent progress photos.', productFeatures: ['46-point face scan', 'Category scores', 'Personalized protocol'], cta: 'Get your Mogging score—link in bio.',
}

describe('analysis post generator', () => {
  test('builds a complete score-reveal timeline', () => {
    const plan = buildAnalysisPost(input)
    expect(plan.duration).toBe(40)
    expect(plan.scenes[0].start).toBe(0)
    expect(plan.scenes.at(-1)?.end).toBe(40)
    expect(plan.scenes.some(scene => scene.onScreen.includes('8.1'))).toBe(true)
  })

  test('builds the longer brand explainer and export text', () => {
    const plan = buildAnalysisPost({ ...input, formatId: 'brand-explainer' })
    expect(plan.duration).toBe(70)
    expect(analysisPostScript(plan)).toContain('[0:00–0:03.5]')
    expect(analysisPostBrief(plan)).toContain('Personalized protocol')
  })
})
