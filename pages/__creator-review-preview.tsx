import { useState } from 'react'
import { SubmissionRequirementsReview } from '@/components/admin/submission-requirements-review'
import { SubmissionReviewFeedback } from '@/components/creator/submission-review-feedback'
import { getCreatorSubmissionReviewItems, resetSubmissionReview, submissionReviewError } from '@/lib/creator/submission-review'
import { Button } from '@/components/ui/button'

const requirements = getCreatorSubmissionReviewItems('custom-video-v1').map(item => ({ ...item, met: true, note: null as string | null }))
export default function CreatorReviewPreview() {
  const [status, setStatus] = useState('rejected')
  const [items, setItems] = useState(() => requirements.map((item, index) => index === 0
    ? { ...item, met: false, note: 'The Mogging CTA appears only at the end. Show the app and a clear invitation to try it within the first 2–3 seconds.' }
    : item))
  const [saved, setSaved] = useState({ items, status })
  const error = submissionReviewError(status, items)
  return <main className="min-h-screen bg-[#f5f5f7] px-4 py-8 sm:px-8">
    <div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Creator program · local preview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">A clear reason. A clear next step.</h1><p className="mt-2 text-sm text-zinc-500">Edit the admin review, then save the preview to see the creator’s feedback. No real submission is changed.</p>
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin · review</p>
          <label className="mt-5 grid gap-2 text-sm font-medium">Review status<select aria-label="Review status" value={status} onChange={event => { if ((status === 'rejected') !== (event.target.value === 'rejected')) setItems(current => resetSubmissionReview(current, event.target.value)); setStatus(event.target.value) }} className="creator-field"><option value="rejected">Rejected</option><option value="approved">Approved</option></select></label>
          <SubmissionRequirementsReview items={items} status={status} onChange={setItems} />
          <div className="sticky bottom-0 mt-5 border-t border-zinc-100 bg-white pt-4"><p role="status" className="mb-3 text-xs text-zinc-500">{error || (status === 'rejected' ? `${items.filter(item => !item.met).length} rejection reasons selected` : 'Check each requirement to approve.')}</p><Button disabled={Boolean(error) || (status === 'approved' && items.some(item => !item.met))} onClick={() => setSaved({ items, status })} className="rounded-full">Save preview</Button></div>
        </section>
        <section className="rounded-[28px] border border-zinc-200 bg-white p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Creator · submission</p><h2 className="mt-5 text-xl font-semibold tracking-tight">Your video review</h2><SubmissionReviewFeedback items={saved.items} status={saved.status} /><div className="mt-4 flex gap-1 rounded-full bg-zinc-100 p-1"><span className="flex-1 rounded-full bg-white p-2.5 text-center text-sm font-medium shadow-sm">Messages</span><span className="flex-1 p-2.5 text-center text-sm text-zinc-500">Details</span></div><p className="mt-5 text-sm text-zinc-500">Ask the team a question about your review…</p></section>
      </div>
    </div>
  </main>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} } }
