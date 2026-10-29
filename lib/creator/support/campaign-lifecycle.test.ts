import { expect, test } from 'bun:test'
import { campaignPhase } from './campaign-lifecycle'
import { createDemoDataSource } from './demo'
import { runSupportAgent } from './agent'
import { readSubmissionEvidence } from './evidence'

test('new campaigns and changing live terms are read afresh while historical awards retain saved terms', async () => {
  const source = createDemoDataSource(), [original] = await source.campaigns()
  let campaigns = [original]
  const live = { ...source, campaigns: async (id?: string) => id ? campaigns.filter(c => c.id === id) : campaigns }
  const run = () => runSupportAgent({ input: { message: 'Show my campaigns' }, source: live, memory: [], sampleData: false })
  const first = await run()
  campaigns = [{ ...original, terms: { ...original.terms, milestones: [{ views: 1, amountCents: 99999 }] } }, { ...original, id: 'new-campaign', name: 'A new campaign', terms: { ...original.terms, minimumTier1Percent: 40 } }]
  const next = await run()
  const artifact = next.artifacts.find(a => a.type === 'campaigns')!
  expect(artifact.type === 'campaigns' && artifact.campaigns[0].terms.milestones[0].amountCents).toBe(99999)
  expect(artifact.type === 'campaigns' && artifact.campaigns[1].name).toBe('A new campaign')
  expect(first.artifacts).not.toEqual(next.artifacts)
  const saved = (await readSubmissionEvidence(live, 'sample-post-1'))!
  expect(saved.earnings.calculatedContentCents).toBe(4550)
  expect(saved.context?.termsSource).toBe('submission snapshot')
})
test('ended status and end dates both prevent a campaign being labeled current', async () => {
  const [c] = await createDemoDataSource().campaigns()
  const now = Date.parse('2026-10-29T12:00:00Z')
  const current = { ...c, status: 'published' as const, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }
  expect(campaignPhase(current, now)).toBe('current')
  expect(campaignPhase({ ...current, status: 'ended' }, now)).toBe('ended')
  expect(campaignPhase({ ...current, endsAt: '2026-10-29T12:00:00Z' }, now)).toBe('ended')
  expect(campaignPhase({ ...current, startsAt: '2026-10-30T00:00:00Z' }, now)).toBe('upcoming')
})
