import { CREATOR_VIDEO_STUDIO_URL, IMMEDIATE_SUBMISSION_GUIDANCE, TIKTOK_ANCHOR_URL } from '@/lib/creator/facial-campaign-update'
import { CAMPAIGN_PUBLISHING_DEADLINE, campaignPublishingGraceActive } from '@/lib/creator/campaign-publishing-policy'
import Link from 'next/link'

export function CampaignAnchorLink() {
  return <aside className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6">
    <p className="font-semibold text-zinc-950">All campaigns: Mogging anchor + link in bio</p>
    <p className="mt-1 text-zinc-600">Publish with the Mogging TikTok anchor and keep your Mogging link in the bio of the account you post from. Accounts with fewer than 1,000 followers are exempt from the bio-link requirement only. The anchor is required for everyone.</p>
    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-zinc-700"><strong>{campaignPublishingGraceActive() ? 'One-week grace period' : 'Grace period ended'}</strong> · {CAMPAIGN_PUBLISHING_DEADLINE}. Videos submitted before this deadline remain eligible for normal payment even if either link is missing. No payout denial or reduction for these missing links during the grace period. All other campaign requirements still apply.</p>
    <a href={TIKTOK_ANCHOR_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-zinc-950 px-4 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open TikTok anchor link ↗</a>
    <Link href="/creator/accounts" className="ml-3 mt-3 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">Find your Mogging bio link →</Link>
  </aside>
}

export function ImmediateSubmissionNotice() {
  return <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6" role="note">
    <p className="font-semibold text-zinc-950">Detailed Facial Analysis only: submit immediately after upload</p>
    <p className="mt-1 text-zinc-700">{IMMEDIATE_SUBMISSION_GUIDANCE}</p>
    <a href={CREATOR_VIDEO_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open Creator Studio ↗</a>
  </aside>
}
