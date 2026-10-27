import { expect, test } from 'bun:test'
import { createDemoDataSource } from './demo'
import { campaignContext, evidenceSummary, focusCampaignRules, overviewText, readSubmissionEvidence, registeredExamples } from './evidence'
import { nextSupportMemory } from './conversation'
const source = createDemoDataSource()

test('overview counts every status and creates three distinct paragraphs', async () => {
  const overview = await source.overview()
  expect(overview.groups.map(g => g.total)).toEqual([1, 2, 1])
  expect(overviewText(overview).split('\n\n').map(p => p.split(':')[0])).toEqual(['In review', 'Approved & paid', 'Rejected'])
})
test('approval explains the saved views and audience with the actual tier calculator', async () => {
  const detail = (await readSubmissionEvidence(source, 'sample-post-1'))!
  expect(detail.earnings).toMatchObject({ verifiedViews: 125000, verifiedAudiencePercent: 22.5, calculatedContentCents: 4550, recordedApprovedCents: 4550, reachedViews: 100000, nextViews: 300000, nextContentCents: 7800, calculationMatchesRecorded: true })
  expect(detail.earnings.ledger?.paidContentCents).toBe(0)
  expect(detail.earnings.unpaidContentCents).toBe(4550)
  expect(detail.context?.termsSource).toBe('submission snapshot')
})
test('paid content uses the full ledger aggregate, independently of displayed payment entries', async () => {
  const detail = (await readSubmissionEvidence({ ...source, payments: async id => ({ ...await source.payments(id), payments: [] }) }, 'sample-post-3'))!
  expect(detail.earnings).toMatchObject({ recordedApprovedCents: 12000, calculatedContentCents: 12000, unpaidContentCents: 0 })
  expect(detail.earnings.ledger?.paidContentCents).toBe(12000)
})
test('rejection highlights the recorded voice-over and audience failures while retaining all rules', async () => {
  const detail = (await readSubmissionEvidence(source, 'sample-post-4'))!
  expect(detail.review.hasRecordedReason).toBe(true)
  expect(detail.review.items.filter(i => !i.met).map(i => i.id)).toEqual(['element-3', 'audience-tier-d-minimum'])
  expect(detail.context?.focusRuleIds).toEqual(['launch-detailed-analysis-v1:element-3', 'audience-minimum'])
  expect(detail.context!.rules.length).toBeGreaterThan(detail.context!.focusRuleIds.length)
  expect(detail.earnings.calculatedContentCents).toBe(0)
  expect(evidenceSummary(detail).submittedAudiencePercent).toBe(18)
  expect(evidenceSummary(detail).earnings.verifiedAudiencePercent).toBe(8)
})
test('missing checklist values are unknown and do not become rejection reasons', async () => {
  const original = await source.submissions({ id: 'sample-post-4' })
  const detail = (await readSubmissionEvidence({ ...source, submissions: async () => ({ ...original, submissions: [{ ...original.submissions[0], reviewChecklist: null, reviewNote: null }] }) }, 'sample-post-4'))!
  expect(detail.review.items).toEqual([])
  expect(detail.review.hasRecordedReason).toBe(false)
  expect(detail.context!.focusRuleIds).toEqual(['audience-minimum'])
})
test('saved submission terms take priority over a changed current campaign', async () => {
  const campaigns = await source.campaigns()
  const changed = { ...campaigns[0], terms: { ...campaigns[0].terms, milestones: [{ views: 1, amountCents: 99999 }] } }
  const detail = (await readSubmissionEvidence({ ...source, campaigns: async () => [changed] }, 'sample-post-1'))!
  expect(detail.earnings.calculatedContentCents).toBe(4550)
  expect(detail.context?.campaign.terms.milestones).not.toEqual(changed.terms.milestones)
})
test('an ended or unpublished campaign does not erase the owned submission snapshot', async () => {
  const detail = (await readSubmissionEvidence({ ...source, campaigns: async () => [] }, 'sample-post-1'))!
  expect(detail.context?.termsSource).toBe('submission snapshot')
  expect(detail.earnings.calculatedContentCents).toBe(4550)
})
test('unknown submission cannot trigger campaign or payment lookups', async () => {
  let reads = 0
  const detail = await readSubmissionEvidence({ ...source, campaigns: async () => { reads++; return [] }, payments: async () => { reads++; return { payments: [], total: 0 } } }, 'another-users-id')
  expect(detail).toBeNull(); expect(reads).toBe(0)
})
test('rule focus only selects actual source rules and never drops other rules', async () => {
  const [campaign] = await source.campaigns()
  const context = campaignContext(campaign)
  const focused = focusCampaignRules(context, 'voice-over explaining features', ['invented-rule'])
  expect(focused.rules).toEqual(context.rules)
  expect(focused.focusRuleIds).toContain('launch-detailed-analysis-v1:element-3')
  expect(focused.focusRuleIds).not.toContain('invented-rule')
})
test('reference videos are registered to the exact campaign format', async () => {
  const [campaign] = await source.campaigns()
  expect(registeredExamples(campaign)?.key).toBe('detailed-analysis')
  expect(registeredExamples({ ...campaign, terms: { ...campaign.terms, formats: campaign.terms.formats.map(f => ({ ...f, id: 'unregistered-format' })) } })).toBeNull()
})
test('signed follow-up context retains only trusted campaign and submission references', async () => {
  const detail = (await readSubmissionEvidence(source, 'sample-post-4'))!
  const memory = nextSupportMemory([], 'Why was my submission rejected?', { text: 'Recorded review explained.', engine: 'glm', artifacts: [{ type: 'submission-detail', detail }] })
  expect(memory.at(-1)?.content).toContain('sample-post-4')
  expect(memory.at(-1)?.content).toContain('sample-campaign')
})

test('a rejected rereview preserves the recorded prior approval and paid credit', async () => {
  const original = await source.submissions({ id: 'sample-post-4' })
  const detail = (await readSubmissionEvidence({ ...source,
    submissions: async () => ({ ...original, submissions: [{ ...original.submissions[0], approvedAmountCents: 4550 }] }),
    history: async () => [{ id: 'prior-approval', type: 'approved', note: null, createdAt: '2026-10-20T12:00:00Z', snapshot: { submittedViews: 125000, submittedAudiencePercent: 23, verifiedViews: 125000, verifiedAudiencePercent: 22.5, approvedAmountCents: 4550, campaignId: 'sample-campaign', campaignName: 'Mogging Detailed Analysis' } }],
    payments: async () => ({ payments: [], total: 1, summary: { paidContentCents: 4550, scheduledContentCents: 0, paidBonusCents: 0, recordedBonusCents: 0, nonUsdPayments: 0 } }),
  }, 'sample-post-4'))!
  expect(detail.submission.status).toBe('rejected')
  expect(detail.earnings).toMatchObject({ recordedApprovedCents: 4550, calculatedContentCents: 0, calculationMatchesRecorded: false, unpaidContentCents: 0 })
  expect(evidenceSummary(detail).lastApprovedReview?.snapshot?.verifiedViews).toBe(125000)
})
