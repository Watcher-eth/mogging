import { CREATOR_VIDEO_STUDIO_URL, IMMEDIATE_SUBMISSION_GUIDANCE, TIKTOK_ANCHOR_URL } from '@/lib/creator/facial-campaign-update'

export function CampaignAnchorLink() {
  return <aside className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6">
    <p className="font-semibold text-zinc-950">Publish with the Mogging TikTok anchor</p>
    <p className="mt-1 text-zinc-600">Required for every campaign. Use this link to publish your video with the anchor before submitting.</p>
    <a href={TIKTOK_ANCHOR_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-zinc-950 px-4 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open TikTok anchor link ↗</a>
  </aside>
}

export function ImmediateSubmissionNotice() {
  return <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6" role="note">
    <p className="font-semibold text-zinc-950">Detailed Facial Analysis only: submit immediately after upload</p>
    <p className="mt-1 text-zinc-700">{IMMEDIATE_SUBMISSION_GUIDANCE}</p>
    <a href={CREATOR_VIDEO_STUDIO_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open Creator Studio ↗</a>
  </aside>
}
