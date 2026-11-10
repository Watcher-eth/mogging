import { BadgeCheck, TriangleAlert, Loader2 } from 'lucide-react'
import { CREATOR_TIER_ONE_COUNTRIES } from '@/lib/creator/audience'
import type { AudienceCheck } from '@/lib/creator/audience-check'

export function SubmissionAudienceCheck({ check, manual, confirmed, onManualChange, onConfirmedChange }: {
  check: AudienceCheck | null | undefined
  manual: boolean
  confirmed: boolean
  onManualChange: (manual: boolean) => void
  onConfirmedChange: (confirmed: boolean) => void
}) {
  const verified = check?.status === 'verified'
  const pending = !check || ['queued', 'processing'].includes(check.status)
  const Icon = verified ? BadgeCheck : pending ? Loader2 : TriangleAlert
  return <section aria-label="Audience check" className="mt-5 self-start rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${verified ? 'text-emerald-600' : pending ? 'text-zinc-400 motion-safe:animate-spin' : 'text-amber-600'}`} />
      <div><h3 className="text-sm font-semibold">{manual && confirmed ? 'Audience checked manually' : verified ? 'Audience checked automatically' : pending ? 'Checking audience…' : 'Audience needs manual review'}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{verified ? 'The readable country data establishes the payout tier. You can override it below.' : pending ? 'The recording is queued for an automatic check. You can review it manually now.' : check?.reason || 'The audience could not be read. Check the recording before approving.'}</p>
      </div>
    </div>
    {check?.percent !== undefined ? <div className="mt-4 rounded-xl bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">Visible Tier 1 audience</p><p className="mt-1 text-xl font-semibold tabular-nums">{check.percent}%</p>
      <p className="mt-1 text-[11px] leading-5 text-zinc-500">Unshown countries and rounded values allow {check.minimumPercent}–{check.maximumPercent}%.{verified ? ' The payout tier is the same across this range.' : ''}</p>
    </div> : null}
    {check?.countries?.length ? <details className="mt-3"><summary className="min-h-9 cursor-pointer text-xs font-semibold text-zinc-600">Country breakdown</summary>
      <dl className="mt-2 grid gap-2 text-xs">{check.countries.map(country => <div key={country.code} className="flex justify-between gap-3"><dt className={CREATOR_TIER_ONE_COUNTRIES.some(name => name === country.name) ? 'font-medium text-emerald-800' : 'text-zinc-500'}>{country.name}</dt><dd className="tabular-nums">{country.percent}%</dd></div>)}{check.otherPercent != null ? <div className="flex justify-between gap-3 text-zinc-500"><dt>Other · unallocated</dt><dd>{check.otherPercent}%</dd></div> : null}</dl>
      {check.evidenceSeconds?.length ? <p className="mt-3 text-[11px] text-zinc-400">Recording evidence: {check.evidenceSeconds.map(seconds => `${seconds.toFixed(1)}s`).join(' · ')}</p> : null}
    </details> : null}
    <label className="mt-4 flex min-h-10 cursor-pointer items-start gap-2.5 text-xs font-medium leading-5"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-zinc-900" checked={manual} onChange={event => onManualChange(event.target.checked)} />{verified ? 'Override audience manually' : 'Review audience manually'}</label>
    {manual ? <div className="mt-2 rounded-xl bg-amber-50 p-3"><p className="text-xs leading-5 text-amber-900">Check the country percentages in the recording and enter the combined Tier 1 audience in Earnings.</p><label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-amber-950"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-amber-700" checked={confirmed} onChange={event => onConfirmedChange(event.target.checked)} />I checked the recording and confirmed the audience percentage.</label></div> : null}
  </section>
}
