// Temporarily paused while TikTok project linking is unavailable. Shared by UI and server.
export const TIKTOK_ANCHOR_REQUIREMENTS_ENABLED = false

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
  if (!TIKTOK_ANCHOR_REQUIREMENTS_ENABLED && rule === TIKTOK_ANCHOR_REQUIREMENT) return null
  if (rule === 'Tag @moggingcom in the post or caption') return 'Tag @moggingcom in the post caption'
  return rule === 'Include your Mogging referral code in your bio and caption.'
    ? 'Include your Mogging referral code in your caption.'
    : rule
}

export function creatorCampaignRules(rules: readonly string[]) {
  return rules.map(creatorCampaignRule).filter((rule): rule is string => rule !== null)
}

export function creatorCaption(code: string) {
  return `Try your own face scan with @moggingcom. Enter ${code} in Mogging’s creator field before subscribing. #mogging`
}

export function captionContainsCreatorCode(caption: string, code: string) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9._-])${escaped}($|[^a-z0-9._-])`, 'i').test(caption)
}

export function creatorCtaOverlay(code: string) {
  const safeCode = code.replace(/[^a-zA-Z0-9._-]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="240" viewBox="0 0 1080 240"><rect x="16" y="16" width="1048" height="208" rx="40" fill="#111827"/><text x="540" y="90" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" fill="white">Try Mogging · Enter this creator code</text><text x="540" y="163" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="bold" fill="#38bdf8">${safeCode}</text></svg>`
}
