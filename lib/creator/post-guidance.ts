// Retained to hide mandatory-anchor wording in historical campaign snapshots.
export const TIKTOK_ANCHOR_REQUIREMENT =
  'For this TikTok account with 1,000+ followers: accept the Mogging TikTok One project before posting, then use Content disclosure → Disclose post content → Branded content → Link project to link this video to Mogging with its anchor.'
export const CREATOR_CTA_GUIDANCE = 'Use a 2–3 second CTA inviting viewers to try Mogging. Place it within the first 10 seconds of a video or the first 5 slides of a slideshow.'
export const CREATOR_SUBMIT_GUIDANCE = 'Submit as soon as your post reaches the first milestone: 20,000 views. You do not need to wait for a higher milestone.'
export const CREATOR_REREVIEW_GUIDANCE = 'Yes—you can earn more when the same post reaches another milestone. Open your submission, click Request rereview, update the views, and upload fresh analytics. After approval, we pay the new milestone total minus any amount already paid for that post, subject to campaign rules and remaining budget.'

export function creatorFormatElement(element: { title: string; detail: string }) {
  return element.title === 'Closing CTA'
    ? { title: 'Early CTA · 2–3 seconds', detail: CREATOR_CTA_GUIDANCE }
    : element
}

export function creatorCampaignRule(rule: string): string | null {
  if (rule.startsWith('Submit within')) return null
  if (rule === TIKTOK_ANCHOR_REQUIREMENT) return null
  if (rule === 'Tag @moggingcom in the post or caption') return 'Tag @moggingcom in the post caption'
  return rule === 'Include your Mogging referral code in your bio and caption.'
    ? 'Include your Mogging referral code in your caption.'
    : rule
}

export function creatorCampaignRules(rules: readonly string[]) {
  return rules.map(creatorCampaignRule).filter((rule): rule is string => rule !== null)
}

export function captionContainsCreatorCode(caption: string, code: string) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9._-])${escaped}($|[^a-z0-9._-])`, 'i').test(caption)
}
