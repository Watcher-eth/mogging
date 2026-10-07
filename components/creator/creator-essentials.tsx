import { CREATOR_CTA_GUIDANCE, CREATOR_SUBMIT_GUIDANCE, CREATOR_REREVIEW_GUIDANCE } from '@/lib/creator/post-guidance'

export function CreatorEssentials() {
  return (
    <section aria-label="Three things to know before you post" className="mb-7 border-y border-zinc-100 py-5">
      <h2 className="mb-4 text-sm font-semibold">Three things to know</h2>
      <div className="grid gap-5 lg:grid-cols-3 lg:gap-7">
        {[
          ['When should I submit?', CREATOR_SUBMIT_GUIDANCE],
          ['How long is the CTA, and where does it go?', CREATOR_CTA_GUIDANCE],
          ['Can the same post earn another payout?', CREATOR_REREVIEW_GUIDANCE],
        ].map(([title, answer]) => (
          <div key={title}>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{answer}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
