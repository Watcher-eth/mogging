import { CREATOR_CTA_GUIDANCE, CREATOR_REREVIEW_GUIDANCE, CREATOR_SUBMIT_GUIDANCE } from '../post-guidance'
import { CREATOR_SUBMISSION_FORMATS } from '../formats'
import { SHARED_CONTENT_RESTRICTIONS } from '../content-policy'
import { CREATOR_REFERRAL_VIDEO_LIMIT } from '../creator-referral-policy'
import type { SupportDestination } from './contracts'

const sections: Array<{ topic: SupportDestination; title: string; text: string }> = [
  { topic: 'video', title: 'Creating and submitting content', text: `${CREATOR_SUBMIT_GUIDANCE} ${CREATOR_SUBMISSION_FORMATS[0].requirements.join('. ')}. ${CREATOR_SUBMISSION_FORMATS[0].elements.map(item => `${item.title}: ${item.detail}`).join('\n')}` },
  { topic: 'rules', title: 'Content rules', text: SHARED_CONTENT_RESTRICTIONS.join('\n') },
  { topic: 'submissions', title: 'Updating views and requesting rereview', text: CREATOR_REREVIEW_GUIDANCE },
  { topic: 'cta', title: 'CTAs', text: `${CREATOR_CTA_GUIDANCE} Use CTA Studio for existing templates, mock reports, and protocols. Keep claims truthful. A suggestion does not guarantee approval.` },
  { topic: 'referrals', title: 'Creator referrals versus attribution links', text: `Creator invitations and account attribution links are different. Creator referral rewards apply to the first ${CREATOR_REFERRAL_VIDEO_LIMIT} eligible videos, with the reward calculated by the existing ledger. Read the creator's own recorded rewards; never disclose an invitee's private data. Account-specific Mogging links/codes are available in Referral links & codes. Do not invent a code or link.` },
  { topic: 'conversions', title: 'Conversion analytics', text: 'Link presses, downloads, conversions, and attributed revenue are distinct metrics. Video totals can include estimates. Only direct revenue may be used for financial qualification. Revenue is not creator earnings. The conversion service applies 48-hour attribution windows; never infer causation from a trend. Charts show UTC dates. Use the analytics tool for the requested window.' },
  { topic: 'money', title: 'Money and bonuses', text: 'Use recorded payment and bonus states. Pending or processing does not mean paid. Do not promise approval, eligibility, payout amounts, or payment dates not present in tool results. Unissued bonuses require checking the applicable campaign and verified submission; absence from the ledger is not proof of ineligibility. Payout destination changes happen in the secure portal. Bundled payouts let creators choose when to request a combined transfer: in Money, enable bundled payouts if desired, then use Pay me now when available. Required payout details must be configured first. The assistant cannot click Pay me now or determine an unrecorded transfer date. Do not invent a payout cycle; ask the creator to check their wallet and payout preference.' },
  { topic: 'start', title: 'Getting started', text: 'Connect your social account, read the current campaign terms, make eligible content, and submit the public post with the required analytics. For account-specific requirements use the portal. This assistant reads information and opens flows; it does not approve posts or change payments.' },
]
export function searchSupportKnowledge(query: string) {
  const words = query.toLowerCase().split(/\W+/).filter(word => word.length > 2)
  return sections.map(section => ({ section, score: words.reduce((score, word) => score + (section.title.toLowerCase().includes(word) ? 3 : 0) + (section.text.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(({ section }) => section)
}
