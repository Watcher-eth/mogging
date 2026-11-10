import type { SprintTerms } from './sprints'

export const TIKTOK_CAMPAIGN_ANCHOR_URL = 'https://www.tiktok.com/t/ZS9UgQb9Cp1Eq-WbUok/#linkSource=DirectLink'
const LEGACY_ANCHOR_REQUIREMENT = 'I published this video using the Mogging TikTok anchor through the required campaign link.'
export const CAMPAIGN_LINKS_EXEMPTION = 'Posting accounts with fewer than 1,000 followers are exempt from both the TikTok anchor and bio-link requirements.'
export const CAMPAIGN_ANCHOR_GUIDANCE = 'TikTok posting accounts with 1,000 or more followers must use the Mogging TikTok anchor.'
export const CAMPAIGN_ANCHOR_REQUIREMENT = 'I used the Mogging anchor if I posted on TikTok from an account with 1,000 or more followers.'
export const CAMPAIGN_BIO_LINK_REQUIREMENT = 'My posting account has a Mogging link in its bio, or has fewer than 1,000 followers and is exempt from the bio-link requirement.'
export const CAMPAIGN_PUBLISHING_GRACE_ENDS_AT = '2026-11-17T03:00:00.000Z'
export const CAMPAIGN_PUBLISHING_DEADLINE = 'November 16, 2026 at 7:00 p.m. Pacific'
export const CAMPAIGN_PUBLISHING_GRACE_RULE = `One-week grace period: videos submitted before ${CAMPAIGN_PUBLISHING_DEADLINE} remain eligible for normal payment without the anchor or bio link. Do not deny or reduce an otherwise eligible payout for either missing link during this grace period. All other campaign requirements still apply.`
export const ANCHOR_GRACE_ACKNOWLEDGEMENT = `I understand that TikTok posting accounts with 1,000 or more followers must use the Mogging anchor by ${CAMPAIGN_PUBLISHING_DEADLINE}. Accounts below 1,000 followers are exempt. Missing it during the grace period will not affect an otherwise eligible payout.`
export const BIO_LINK_GRACE_ACKNOWLEDGEMENT = `I understand that posting accounts with 1,000 or more followers must have a Mogging link in their bio by ${CAMPAIGN_PUBLISHING_DEADLINE}. Accounts below 1,000 followers are exempt. Missing it during the grace period will not affect an otherwise eligible payout.`

export function campaignPublishingGraceActive(now: number | Date = Date.now(), endsAt = CAMPAIGN_PUBLISHING_GRACE_ENDS_AT) {
  return +now < Date.parse(endsAt)
}

// Existing briefs and submission snapshots can still contain the original wording.
export function campaignPublishingCopy(copy: string) {
  return copy
    .replace('using the required TikTok anchor', 'using the Mogging TikTok anchor if your TikTok posting account has 1,000 or more followers')
    .replace('using the required Mogging TikTok anchor link', 'using the Mogging TikTok anchor if your TikTok posting account has 1,000 or more followers')
}

export function campaignPublishingRuleLabel(rule: string) {
  return rule === LEGACY_ANCHOR_REQUIREMENT ? CAMPAIGN_ANCHOR_REQUIREMENT : rule
}

export function isCampaignPublishingRequirement(rule: string) {
  return campaignPublishingRuleLabel(rule) === CAMPAIGN_ANCHOR_REQUIREMENT || rule === CAMPAIGN_BIO_LINK_REQUIREMENT
}

export function publishingRequirementWaived(rule: string, submittedAt: Date | string | null | undefined, endsAt = CAMPAIGN_PUBLISHING_GRACE_ENDS_AT) {
  if (!submittedAt || !isCampaignPublishingRequirement(rule)) return false
  const submitted = submittedAt instanceof Date ? +submittedAt : Date.parse(submittedAt)
  return Number.isFinite(submitted) && submitted < Date.parse(endsAt)
}

export function campaignPublishingChecklistRules(rules: readonly string[], now = Date.now()) {
  return [
    ...rules.filter(rule => !isCampaignPublishingRequirement(rule) && rule !== CAMPAIGN_PUBLISHING_GRACE_RULE),
    ...(campaignPublishingGraceActive(now)
      ? [ANCHOR_GRACE_ACKNOWLEDGEMENT, BIO_LINK_GRACE_ACKNOWLEDGEMENT]
      : [CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT]),
  ]
}

export function withCampaignPublishingRules(terms: SprintTerms): SprintTerms {
  return {
    ...terms,
    publishingGraceEndsAt: CAMPAIGN_PUBLISHING_GRACE_ENDS_AT,
    rules: [
      ...terms.rules.filter(rule => !isCampaignPublishingRequirement(rule) && rule !== CAMPAIGN_PUBLISHING_GRACE_RULE),
      CAMPAIGN_ANCHOR_REQUIREMENT,
      CAMPAIGN_BIO_LINK_REQUIREMENT,
      CAMPAIGN_PUBLISHING_GRACE_RULE,
    ],
  }
}

/** Keep publishing requirements visible and recordable even when payment enforcement is waived. */
export function publishingReviewItems<T extends { id: string; label: string; detail: string }>(items: T[], submittedAt?: Date | string | null, endsAt = CAMPAIGN_PUBLISHING_GRACE_ENDS_AT) {
  const result: { id: string; label: string; detail: string; waived?: boolean }[] = items.map(item => ({ ...item, label: campaignPublishingRuleLabel(item.label) }))
  for (const [id, label] of [['publishing-anchor', CAMPAIGN_ANCHOR_REQUIREMENT], ['publishing-bio-link', CAMPAIGN_BIO_LINK_REQUIREMENT]]) {
    if (!result.some(item => item.label === label)) result.push({ id, label, detail: 'Required for all creator campaigns.' })
  }
  return result.map(item => {
    if (!isCampaignPublishingRequirement(item.label)) return item
    const waived = publishingRequirementWaived(item.label, submittedAt, endsAt)
    return { ...item, waived, detail: waived
      ? `Grace period applies. Record whether this requirement is met; a missing link cannot reduce or deny payment for this submission. Deadline: ${CAMPAIGN_PUBLISHING_DEADLINE}. ${CAMPAIGN_LINKS_EXEMPTION}`
      : `${item.detail} ${CAMPAIGN_LINKS_EXEMPTION}` }
  })
}
