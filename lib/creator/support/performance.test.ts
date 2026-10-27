import { test, expect } from 'bun:test'
import { runSupportAgent } from './agent'
import { createDemoDataSource } from './demo'
import { asksForContentGuidance, isGeneralVideoPerformanceQuestion, recordedSubmissionViews } from './performance'
import { isConversionQuestion } from './video-analytics'

test('broad creator video performance always retrieves only a chart and current status rows', async () => {
  for (const message of ['How well did my video do this week?', 'How are my videos doing?', 'How did my videos perform this week?']) {
    expect(isGeneralVideoPerformanceQuestion(message)).toBe(true)
    expect(isConversionQuestion(message)).toBe(true)
    const result = await runSupportAgent({ input: { message }, source: createDemoDataSource(), memory: [{ role: 'user', content: 'Show content requirements' }, { role: 'assistant', content: 'Read the creator guide requirements.' }], sampleData: true })
    expect(result.artifacts.map(a => a.type)).toEqual(['video-analytics', 'submissions'])
    const status = result.artifacts.find(a => a.type === 'submissions')!
    expect(status.groups?.map(g => g.key)).toEqual(['review', 'approved-paid', 'rejected'])
    expect(status.submissions.some(s => s.status === 'paid')).toBe(true)
    expect(status.submissions.some(s => s.status === 'rejected')).toBe(true)
    expect(result.artifacts.some(a => a.type === 'action' && (a.destination === 'video' || a.destination === 'rules'))).toBe(false)
  }
})
test('named video performance and recorded views do not pull unrelated submissions', async () => {
  const source = createDemoDataSource()
  const message = 'How did my video The glow-up checklist perform this week?'
  const result = await runSupportAgent({ input: { message }, source, memory: [], sampleData: true })
  const cards = result.artifacts.find(a => a.type === 'submissions')!
  expect(cards.submissions.map(s => s.id)).toEqual(['sample-post-2'])
  const views = await runSupportAgent({ input: { message: 'Show views for my video The glow-up checklist this week' }, source, memory: [], sampleData: true })
  expect(views.artifacts.map(a => a.type)).toEqual(['submission-views'])
  expect(views.text).toContain('cumulative snapshots, not views gained this week')
})
test('views are exact snapshots and null is never fabricated as zero', async () => {
  const data = await createDemoDataSource().submissions({ id: 'sample-post-4' })
  expect(recordedSubmissionViews(data.submissions)).toMatchObject([{ views: 12000, basis: 'verified' }])
  const missing = { ...data.submissions[0], adminViewCountThreshold: null, viewCountThreshold: null }
  expect(recordedSubmissionViews([missing])[0].views).toBeNull()
})
test('conversion-only answers stay focused and guidance requires explicit intent', async () => {
  const result = await runSupportAgent({ input: { message: 'How well did my video convert this week?' }, source: createDemoDataSource(), memory: [], sampleData: true })
  expect(result.artifacts.map(a => a.type)).toEqual(['video-analytics'])
  expect(asksForContentGuidance('How well did my video do this week?')).toBe(false)
  expect(asksForContentGuidance('How can I meet the CTA requirements?')).toBe(true)
  expect(asksForContentGuidance('Explain why it was rejected')).toBe(true)
})
