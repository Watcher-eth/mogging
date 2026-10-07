import { defaultCreatorSprintTerms } from './sprint-defaults'
import { expect, test } from 'bun:test'
import {
  sprintTermsSchema,
  creatorCampaignFormats,
  type CreatorSprint,
  sprintInputSchema,
  sprintPayoutCents,
  sprintPhase,
  referralCode,
  sprintReviewItems,
  type SprintTerms,
} from './sprints'
import { creatorConnectAccountSchema } from './account-identity'
import { creatorMoneySummary } from './money'
const terms: SprintTerms = {
  milestones: [
    { views: 5000, amountCents: 1000 },
    { views: 50000, amountCents: 3500 },
  ],
  minimumTier1Percent: 20,
  maximumTier1Percent: 40,
  platforms: ['tiktok'],
  rules: ['Keep post public'],
  formats: [
    {
      id: 'f',
      name: 'Face analysis',
      shortDescription: 'Show Mogging',
      active: true,
      elements: [{ title: 'Hook', detail: 'Start strong' }],
      requirements: ['Show product'],
      notAllowed: ['Fake views'],
    },
  ],
}
test('milestones are total payouts; audience eligibility and caps are campaign-specific', () => {
  expect(sprintPayoutCents(terms, 4999, 40)).toBe(0)
  expect(sprintPayoutCents(terms, 5000, 19.9)).toBe(0)
  expect(sprintPayoutCents(terms, 5000, null)).toBe(0)
  expect(sprintPayoutCents(terms, 50000, 40)).toBe(3500)
  expect(sprintPayoutCents(terms, 100000, 80)).toBe(3500)
  expect(sprintPayoutCents(terms, 50000, 20)).toBe(1750)
  expect(sprintPayoutCents(terms, 50000, 101)).toBe(0)
})
test('invalid or ambiguous campaign terms are rejected', () => {
  expect(sprintTermsSchema.safeParse(terms).success).toBe(true)
  for (const patch of [
    { milestones: [...terms.milestones].reverse() },
    { milestones: [{ views: 5000, amountCents: -1 }] },
    { minimumTier1Percent: 50 },
    { platforms: ['tiktok', 'tiktok'] },
    { formats: [...terms.formats, ...terms.formats] },
  ])
    expect(sprintTermsSchema.safeParse({ ...terms, ...patch }).success).toBe(
      false,
    )
  expect(
    sprintInputSchema.safeParse({
      name: 'Sprint',
      description: 'Campaign',
      status: 'published',
      budgetCents: 10000,
      startsAt: '2026-10-03T00:00:00Z',
      endsAt: '2026-10-02T00:00:00Z',
      terms,
    }).success,
  ).toBe(false)
})
test('phases obey schedule and explicit end', () => {
  const sprint = {
    status: 'published' as const,
    startsAt: '2026-10-01T00:00:00Z',
    endsAt: '2026-10-03T00:00:00Z',
  }
  expect(sprintPhase(sprint, Date.parse('2026-09-30'))).toBe('scheduled')
  expect(sprintPhase(sprint, Date.parse('2026-10-02'))).toBe('active')
  expect(sprintPhase(sprint, Date.parse(sprint.endsAt))).toBe('past')
  expect(sprintPhase({ ...sprint, status: 'draft' })).toBe('draft')
  expect(sprintPhase({ ...sprint, status: 'ended' })).toBe('past')
})
test('one account field accepts handles or platform profile URLs, rejects spoofed and post URLs', () => {
  for (const identity of [
    ' @Nate ',
    'https://www.tiktok.com/@nate/',
    'tiktok.com/@nate',
  ])
    expect(
      creatorConnectAccountSchema.parse({ platform: 'tiktok', identity })
        .handle,
    ).toBe('nate')
  expect(
    creatorConnectAccountSchema.parse({
      platform: 'instagram',
      identity: 'instagram.com/nate',
    }).handle,
  ).toBe('nate')
  for (const identity of [
    '.',
    '..',
    '___',
    'https://example.com/@nate',
    'https://www.tiktok.com/@nate/video/123',
    'http://tiktok.com/@nate',
    'https://instagram.com/nate',
    'https://tiktok.com.evil.com/@nate',
    'https://evil@tiktok.com/@nate',
  ])
    expect(
      creatorConnectAccountSchema.safeParse({ platform: 'tiktok', identity })
        .success,
    ).toBe(false)
})
test('permanent codes retain the existing attribution identity and reviews use saved requirements', () => {
  expect(
    referralCode({
      slug: 'stable-code',
      publicUrl: 'https://www.mogging.com/r/new-handle',
    }),
  ).toBe('mogging-new-handle')
  expect(
    referralCode({
      slug: 'tiktok-sam-old',
      publicUrl: 'https://www.mogging.com/r/sam',
    }),
  ).toBe('mogging-sam')
  expect(referralCode({ slug: 'legacy', publicUrl: 'invalid' })).toBe('legacy')
  expect(sprintReviewItems(terms, 'f').map((item) => item.id)).toEqual([
    'element-1',
    'requirement-1',
    'restriction-1',
    'sprint-rule-1',
  ])
})
test('Money retains prior approved earnings through rejected rereviews and deducts paid cashouts', () => {
  const submissions: any[] = [
    { id: 'a', sprintId: 's', status: 'approved', approvedAmountCents: 1000 },
    { id: 'b', sprintId: 's', status: 'approved', approvedAmountCents: 3500 },
    { id: 'c', sprintId: 's', status: 'pending', approvedAmountCents: null },
    { id: 'd', sprintId: 's', status: 'rejected', approvedAmountCents: 500 },
  ]
  const summary = creatorMoneySummary(submissions, [
    { submissionId: 'b', status: 'paid', amountCents: 3500 },
    { submissionId: 'a', status: 'processing', amountCents: 1000 },
  ] as any)
  expect(summary.balanceCents).toBe(1500)
  expect(summary.totalPaidCents).toBe(3500)
  expect(summary.earnings.map((item) => item.id)).toEqual(['a', 'd'])
  expect(summary.pendingReview).toBe(1)
})

test('grouped campaign rates preserve maximum milestones and enforce each audience boundary', async () => {
  const { defaultCreatorSprintTerms, campaignRegionRates } =
    await import('./sprint-defaults')
  const campaign = sprintTermsSchema.parse(defaultCreatorSprintTerms())
  expect(campaign.milestones.map((rate) => rate.amountCents)).toEqual([
    1500, 4500, 6500, 9600, 18300, 25900, 32500,
  ])
  for (const milestone of campaign.milestones) {
    for (const [audience, percent] of [
      [0, 0],
      [9.99, 0],
      [10, 20],
      [14.99, 20],
      [15, 40],
      [22.49, 40],
      [22.5, 65],
      [29.99, 65],
      [30, 100],
      [40, 100],
      [100, 100],
    ]) {
      expect(sprintPayoutCents(campaign, milestone.views, audience)).toBe(
        Math.round((milestone.amountCents * percent) / 100),
      )
    }
  }
  expect(sprintPayoutCents(campaign, 19999, 30)).toBe(0)
  expect(sprintPayoutCents(campaign, 100000, null)).toBe(0)
  expect(sprintPayoutCents(campaign, 100000, 15)).toBe(2600)
  expect(sprintPayoutCents(campaign, 100000, 22.5)).toBe(4225)
  expect(sprintPayoutCents(campaign, 100000, 0)).toBe(0)
  expect(campaignRegionRates(campaign)).toContain('Tier D 20%')
  expect(
    campaign.formats[0].requirements.some((rule) =>
      rule.includes('second device'),
    ),
  ).toBe(true)
  expect(campaign.rules.some((rule) => rule.includes('pinned'))).toBe(false)
  const invalid = structuredClone(campaign)
  invalid.milestones[0].audienceRates!.reverse()
  expect(sprintTermsSchema.safeParse(invalid).success).toBe(false)
})

test('obsolete deadlines are excluded from historical reviews without renumbering decisions', () => {
  const historical = structuredClone(terms)
  historical.formats[0].requirements = ['Submit within 3 days of publishing', 'Show product']
  historical.rules = ['Submit within 72 hours of publishing', 'Keep post public']
  const items = sprintReviewItems(historical, 'f')
  expect(items.find(item => item.label === 'Show product')?.id).toBe('requirement-2')
  expect(items.find(item => item.label === 'Keep post public')?.id).toBe('sprint-rule-2')
  expect(items.some(item => item.label.startsWith('Submit within'))).toBe(false)
})


test('saved bio rules become caption-only without changing review IDs or saved terms', () => {
  const saved = { ...terms, rules: ['Include your Mogging referral code in your bio and caption.', 'Keep the post public'] }
  const before = structuredClone(saved)
  const items = sprintReviewItems(saved, 'f')
  expect(items.find(item => item.id === 'sprint-rule-1')?.label).toBe('Include your Mogging referral code in your caption.')
  expect(items.find(item => item.id === 'sprint-rule-2')?.label).toBe('Keep the post public')
  expect(saved).toEqual(before)
})


test('the format guide follows live campaign briefs and keeps reused format IDs distinct', () => {
  const now = Date.parse('2026-10-04T12:00:00Z')
  const campaign: CreatorSprint = {
    id: 'first', name: 'First campaign', description: 'Brief', status: 'published',
    budgetCents: 10000, usedCents: 0,
    startsAt: new Date(now - 86400000).toISOString(), endsAt: new Date(now + 86400000).toISOString(),
    terms, counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
  }
  const second = { ...campaign, id: 'second', name: 'Second campaign', terms: { ...terms, formats: [
    { ...terms.formats[0], name: 'Different brief with same format ID' },
    { ...terms.formats[0], id: 'slideshow', name: 'Slideshow' },
    { ...terms.formats[0], id: 'disabled', active: false },
  ] } }
  const available = creatorCampaignFormats([
    campaign, second,
    { ...campaign, id: 'draft', status: 'draft' },
    { ...campaign, id: 'ended', status: 'ended' },
    { ...campaign, id: 'expired', endsAt: new Date(now).toISOString() },
    { ...campaign, id: 'scheduled', startsAt: new Date(now + 1000).toISOString() },
    { ...campaign, id: 'spent', usedCents: 10000 },
  ], now)
  expect(available.map(item => item.key)).toEqual(['first:f', 'second:f', 'second:slideshow'])
  expect(available[1].format.name).toBe('Different brief with same format ID')
  expect(creatorCampaignFormats([], now)).toEqual([])
})

test('the guide leads with the face scan and custom formats before transformation briefs', () => {
  const now = Date.now()
  const campaign: CreatorSprint = {
    id: 'live', name: 'Live', description: 'Brief', status: 'published', budgetCents: 10000, usedCents: 0,
    startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 86400000).toISOString(),
    counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
    terms: { ...terms, formats: [
      { ...terms.formats[0], id: 'before-after-transformation-v1', name: 'Before → Mock Report → After' },
      ...defaultCreatorSprintTerms().formats,
    ] },
  }
  expect(creatorCampaignFormats([campaign], now).map(item => item.format.name)).toEqual([
    'General Mogging Face Scan', 'Custom format', 'Before → Mock Report → After',
  ])
})
