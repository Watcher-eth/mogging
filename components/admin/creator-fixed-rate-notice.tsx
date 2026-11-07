import type { CreatorRetainer } from '@/lib/creator/retainer'
import { sprintMoney } from '@/lib/creator/sprints'
import type { AdminSubmission } from './creator-types'

const expiry = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })

export function CreatorFixedRateNotice({ agreement, submission }: { agreement?: CreatorRetainer | null; submission?: AdminSubmission }) {
  const saved = submission?.sprintTerms?.retainer
  const now = Date.now()
  const active = agreement && Date.parse(agreement.startsAt) <= now && Date.parse(agreement.endsAt) > now ? agreement : undefined
  const retainer = saved ?? active
  if (!retainer) return null
  const campaignRates = Boolean(submission && !saved)
  const rate = sprintMoney(retainer.amountCents)
  return <aside aria-label="Fixed-rate creator" className="mt-4 shrink-0 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
    <p className="text-sm font-semibold">{campaignRates ? 'Fixed-rate creator' : `Fixed rate · ${rate} per video`}</p>
    {campaignRates ? <>
      <p className="mt-1 text-sm font-semibold">This submission uses its saved campaign rates.</p>
      <p className="mt-1 text-xs leading-5">Current retainer: {rate} per approved video · {retainer.minimumTier1Percent}%+ Tier 1 audience.</p>
    </> : <p className="mt-1 text-xs leading-5">No minimum views · {retainer.minimumTier1Percent}%+ Tier 1 audience required · No campaign bonuses.</p>}
    <p className="mt-1 text-xs leading-5">Agreement ends {expiry.format(new Date(retainer.endsAt))} Pacific.{saved ? ' The fixed rate remains saved for this submission.' : ''}</p>
  </aside>
}
