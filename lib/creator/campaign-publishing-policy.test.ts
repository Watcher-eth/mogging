import { expect, test } from 'bun:test'
import { defaultCreatorSprintTerms } from './sprint-defaults'
import { sprintReviewItems, sprintTermsSchema } from './sprints'
import { ANCHOR_GRACE_ACKNOWLEDGEMENT, BIO_LINK_GRACE_ACKNOWLEDGEMENT, CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT, CAMPAIGN_PUBLISHING_GRACE_ENDS_AT, campaignPublishingChecklistRules, campaignPublishingGraceActive, publishingRequirementWaived, withCampaignPublishingRules } from './campaign-publishing-policy'

const deadline = Date.parse(CAMPAIGN_PUBLISHING_GRACE_ENDS_AT)

test('grace deadline is November 16 at 7pm Pacific, with enforcement at the exact boundary', () => {
  expect(new Date(deadline).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).toBe('11/16/2026, 7:00:00 PM')
  expect(campaignPublishingGraceActive(deadline - 1)).toBe(true)
  expect(campaignPublishingGraceActive(deadline)).toBe(false)
  expect(publishingRequirementWaived(CAMPAIGN_ANCHOR_REQUIREMENT, new Date(deadline - 1))).toBe(true)
  expect(publishingRequirementWaived(CAMPAIGN_BIO_LINK_REQUIREMENT, new Date(deadline))).toBe(false)
  expect(publishingRequirementWaived('Other content requirement', new Date(deadline - 1))).toBe(false)
})

test('grace-period checkboxes acknowledge the future rules without requiring creators to claim missing links are present', () => {
  const before = campaignPublishingChecklistRules([CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT, 'Original rule'], deadline - 1)
  expect(before).toEqual(['Original rule', ANCHOR_GRACE_ACKNOWLEDGEMENT, BIO_LINK_GRACE_ACKNOWLEDGEMENT])
  expect(before).not.toContain(CAMPAIGN_ANCHOR_REQUIREMENT)
  expect(campaignPublishingChecklistRules(before.filter(rule => rule === 'Original rule'), deadline)).toEqual(['Original rule', CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT])
  expect(CAMPAIGN_BIO_LINK_REQUIREMENT).toContain('fewer than 1,000 followers')
})

test('publishing rules are idempotent and preserve payout rates, bonuses, formats and platforms', () => {
  const original = defaultCreatorSprintTerms()
  const terms = sprintTermsSchema.parse(withCampaignPublishingRules(original))
  expect(withCampaignPublishingRules(terms)).toEqual(terms)
  expect(terms.milestones).toEqual(original.milestones)
  expect(terms.formats).toEqual(original.formats)
  expect(terms.platforms).toEqual(original.platforms)
  expect(terms.bonusBudgetCents).toEqual(original.bonusBudgetCents)
  expect(terms.rules).toContain(CAMPAIGN_ANCHOR_REQUIREMENT)
  expect(terms.rules).toContain(CAMPAIGN_BIO_LINK_REQUIREMENT)
})

test('a video submitted during grace cannot be rejected for missing either new link, even if reviewed after the deadline', () => {
  const terms = withCampaignPublishingRules(defaultCreatorSprintTerms())
  const format = terms.formats[0].id
  const before = sprintReviewItems(terms, format, false, new Date(deadline - 1))
  const after = sprintReviewItems(terms, format, false, new Date(deadline))
  expect(before.find(item => item.label === CAMPAIGN_ANCHOR_REQUIREMENT)?.waived).toBe(true)
  expect(before.find(item => item.label === CAMPAIGN_BIO_LINK_REQUIREMENT)?.waived).toBe(true)
  expect(after.some(item => item.label === CAMPAIGN_ANCHOR_REQUIREMENT)).toBe(true)
  expect(after.some(item => item.label === CAMPAIGN_BIO_LINK_REQUIREMENT)).toBe(true)
  expect(after.find(item => item.label === CAMPAIGN_BIO_LINK_REQUIREMENT)?.waived).toBe(false)
  // Retired items remain known so an already-open admin dialog can be safely normalized.
  expect(sprintReviewItems(terms, format, true, new Date(deadline - 1)).some(item => item.label === CAMPAIGN_ANCHOR_REQUIREMENT)).toBe(true)
  expect(before.filter(item => item.id.startsWith('element-'))).toEqual(after.filter(item => item.id.startsWith('element-')))
})

test('saved campaign anchor rules show the follower exemption and retain their review ID', () => {
  const legacyRule = 'I published this video using the Mogging TikTok anchor through the required campaign link.'
  const terms = withCampaignPublishingRules(defaultCreatorSprintTerms())
  const stored = { ...terms, rules: terms.rules.map(rule => rule === CAMPAIGN_ANCHOR_REQUIREMENT ? legacyRule : rule) }
  const format = terms.formats[0].id
  expect(sprintReviewItems(stored, format, false, new Date(deadline))).toEqual(sprintReviewItems(terms, format, false, new Date(deadline)))
  expect(sprintReviewItems(stored, format, false, new Date(deadline - 1))).toEqual(sprintReviewItems(terms, format, false, new Date(deadline - 1)))
  expect(CAMPAIGN_ANCHOR_REQUIREMENT).toContain('1,000 or more followers')
  expect(ANCHOR_GRACE_ACKNOWLEDGEMENT).toContain('Accounts below 1,000 followers are exempt')
})
