'use client'

import { useState } from 'react'
import NumberFlow from '@number-flow/react'
import { Calculator, Check, Sparkles } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calculateCreatorPayout, CREATOR_US_AUDIENCE_TIERS, CREATOR_VIEW_THRESHOLDS } from '@/lib/creator/payouts'

const payoutRules = [
  'At least 20% combined Tier-1 audience is required for the base payout.',
  'The 20% may be any combination of the eligible Tier-1 countries.',
  'Only U.S. audience at 22.5% or higher unlocks increased U.S. CPM rates.',
  'U.S. audience is capped at 40% and earnings at $325 per video.',
  'Milestones are cumulative totals—not stacked bonuses.',
]

export function CreatorPayoutCalculator() {
  const [totalViews, setTotalViews] = useState(40_000)
  const [tier1AudienceEligible, setTier1AudienceEligible] = useState(true)
  const [usAudiencePercentage, setUsAudiencePercentage] = useState<number | null>(null)
  const estimate = calculateCreatorPayout(totalViews, tier1AudienceEligible, usAudiencePercentage)

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,1.08fr)]">
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-zinc-100"><Calculator className="size-5" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Earnings Calculator</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Estimate Your Video Payout</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Confirm Tier-1 eligibility, then add the U.S.-specific audience shown in your analytics.</p>
            </div>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="payout-view-threshold">View Count Threshold</label>
              <Select value={String(totalViews)} onValueChange={(value) => setTotalViews(Number(value))}>
                <SelectTrigger id="payout-view-threshold" className="mt-2" aria-label="View Count Threshold"><SelectValue /></SelectTrigger>
                <SelectContent>{CREATOR_VIEW_THRESHOLDS.map((threshold) => <SelectItem key={threshold.views} value={String(threshold.views)}>{threshold.label} views</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="payout-tier1-eligibility">Combined Tier-1 Audience</label>
              <Select value={tier1AudienceEligible ? 'eligible' : 'ineligible'} onValueChange={(value) => { const isEligible = value === 'eligible'; setTier1AudienceEligible(isEligible); if (!isEligible) setUsAudiencePercentage(null) }}>
                <SelectTrigger id="payout-tier1-eligibility" className="mt-2" aria-label="Combined Tier-1 Audience"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="eligible">20%+ · eligible</SelectItem><SelectItem value="ineligible">Below 20% · no payout</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-700" htmlFor="payout-us-audience">U.S.-Specific Audience</label>
              <Select disabled={!tier1AudienceEligible} value={usAudiencePercentage === null ? 'base' : String(usAudiencePercentage)} onValueChange={(value) => setUsAudiencePercentage(value === 'base' ? null : Number(value))}>
                <SelectTrigger id="payout-us-audience" className="mt-2" aria-label="U.S.-Specific Audience"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="base">Below 22.5% · base rate</SelectItem>{CREATOR_US_AUDIENCE_TIERS.map((percentage) => <SelectItem key={percentage} value={String(percentage)}>{percentage === 40 ? '40%+' : `${percentage}%`}{percentage === 22.5 ? ' · enhanced rates begin' : ''}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-2 text-[11px] leading-5 text-zinc-400">U.S. audience must independently reach 22.5% before an enhanced rate applies.</p>
            </div>
          </div>

          <div className="mt-7 border-t border-zinc-100 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">How Eligibility Works</p>
            <ul className="mt-4 space-y-3">
              {payoutRules.map((rule) => <li key={rule} className="flex items-start gap-3 text-xs leading-5 text-zinc-500"><span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-2.5" /></span>{rule}</li>)}
            </ul>
          </div>
        </div>

        <div className="flex min-h-[390px] flex-col justify-between bg-zinc-950 p-5 text-white sm:p-7" aria-live="polite">
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Potential Earnings</p>
              {!estimate.isEligible ? <span className="rounded-full bg-red-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-950">Not Eligible</span> : estimate.isCapped ? <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-950">Maximum Reached</span> : estimate.hasUsRateBoost ? <span className="rounded-full bg-emerald-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-950">U.S. Rate Boost</span> : <Sparkles className="size-4 text-white/30" />}
            </div>
            <NumberFlow
              className="mt-3 block text-5xl font-semibold tracking-[-0.07em] sm:text-6xl"
              format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
              opacityTiming={{ duration: 160, easing: 'ease-out' }}
              spinTiming={{ duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
              transformTiming={{ duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
              value={estimate.payout}
            />
            <p className="mt-3 max-w-sm text-xs leading-5 text-white/45">{estimate.isEligible ? 'Estimated payout after verification, rounded to the nearest dollar.' : 'A video must reach at least 20% combined Tier-1 audience to receive a payout.'}</p>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
              <ResultMetric label="Tier-1 Eligibility" value={estimate.isEligible ? '20%+ met' : 'Below 20%'} />
              <ResultMetric label="U.S. Audience" value={estimate.hasUsRateBoost ? `${estimate.audiencePercentage}%` : 'Base rate'} />
              <ResultMetric className="col-span-2 sm:col-span-1" label="U.S. CPM" value={estimate.usCpm === null ? 'Not applied' : `$${estimate.usCpm.toFixed(3)}`} />
            </div>
            <p className="mt-5 text-[11px] leading-5 text-white/35">{estimate.hasUsRateBoost && estimate.estimatedUsViews !== null ? `${estimate.estimatedUsViews.toLocaleString('en-US')} estimated U.S. views × U.S. CPM ÷ 1,000. U.S. audience is capped at 40%.` : 'The base ladder applies after reaching 20% combined Tier-1 audience. U.S.-specific rate increases begin at 22.5% U.S. audience.'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ResultMetric({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return <div className={`bg-zinc-950 p-4 ${className}`}><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums tracking-[-0.035em]">{value}</p></div>
}
