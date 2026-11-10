import { CREATOR_VIDEO_STUDIO_URL, IMMEDIATE_SUBMISSION_GUIDANCE, TIKTOK_ANCHOR_URL } from '@/lib/creator/facial-campaign-update'
import { Info } from '@/components/ui/mogging-glyphs'
import Link from 'next/link'

export function CampaignAnchorLink() {
  return <aside role="note" className="creator-info-bubble creator-info-bubble-compact">
    <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" fill="white" stroke="#202123" strokeWidth={1.7} />
    <div className="min-w-0 space-y-1.5">
      <p>For accounts with 1,000+ followers, keep your Mogging link in bio and use the Mogging anchor when posting on TikTok. Both are optional below 1,000 followers.</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-semibold">
        <a href={TIKTOK_ANCHOR_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">TikTok anchor ↗</a>
        <Link href="/creator/accounts" className="underline underline-offset-4">Find your bio link</Link>
      </div>
    </div>
  </aside>
}

export function ImmediateSubmissionNotice() {
  return <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6" role="note">
    <p className="font-semibold text-zinc-950">Detailed Facial Analysis only: submit immediately after upload</p>
    <p className="mt-1 text-zinc-700">{IMMEDIATE_SUBMISSION_GUIDANCE}</p>
    <a href={CREATOR_VIDEO_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open Creator Studio ↗</a>
  </aside>
}
