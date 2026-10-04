import { describe, expect, test } from 'bun:test'
import { campaignTimeLabel, type CampaignPreview } from './campaign-preview'

const now = Date.parse('2026-10-03T12:00:00Z')
const campaign: CampaignPreview = {
  id: 'campaign', name: 'October campaign', description: '', budgetCents: 100_000,
  status: 'published', startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-10T12:00:00Z',
}

describe('campaign preview countdown', () => {
  test('shows remaining days, rounding a partial final day up', () => {
    expect(campaignTimeLabel(campaign, now)).toBe('7 days left')
    expect(campaignTimeLabel(campaign, Date.parse('2026-10-10T11:59:59Z'))).toBe('1 day left')
  })
  test('uses the start date for upcoming campaigns', () => {
    expect(campaignTimeLabel({ ...campaign, startsAt: '2026-10-04T12:00:00Z' }, now)).toBe('Starts in 1 day')
  })
  test('ends at the deadline or when explicitly ended', () => {
    expect(campaignTimeLabel(campaign, Date.parse(campaign.endsAt))).toBe('Ended')
    expect(campaignTimeLabel({ ...campaign, status: 'ended' }, now)).toBe('Ended')
  })
})
