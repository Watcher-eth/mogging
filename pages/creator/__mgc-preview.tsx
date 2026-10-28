import { campaignBudgetState, canReserveSubmission } from '@/lib/creator/campaign-budget-state'
import { useState } from 'react'
import { CampaignVersionToggle } from '@/components/creator/campaign-version-toggle'
import { LaunchCampaignDetail } from '@/components/creator/launch-campaign-detail'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { detailedAnalysisVariantTerms, MGC_CAMPAIGN_NAME } from '@/lib/creator/detailed-analysis-variant'
import type { CreatorSprint } from '@/lib/creator/sprints'
import type { GetServerSideProps } from 'next'
import { isLocalAnalyticsPreview } from '@/lib/admin/local-analytics-preview'

const campaign = LAUNCH_CAMPAIGNS.find(item => item.key === 'detailed-analysis')!
const source: CreatorSprint = {
  id: 'bd0d7a74-3c39-44dd-98ec-21bf6667a714', name: campaign.name, description: campaign.description,
  status: 'published', budgetCents: 250000, startsAt: '2026-10-24T01:52:12.189Z', endsAt: '2026-11-23T02:52:12.189Z',
  terms: launchCampaignTerms(campaign), sharedBudget: true, budgetPoolId: 'bd0d7a74-3c39-44dd-98ec-21bf6667a714', usedCents: 200000, pendingCents: 45000, counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
}
const versions = [source, { ...source, id: 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11', name: MGC_CAMPAIGN_NAME, terms: detailedAnalysisVariantTerms(source.terms, source.id) }]

export default function MgcPreview() {
  const [selectedId, setSelectedId] = useState(versions[1].id)
  const [pendingCents, setPendingCents] = useState(45000)
  const [requestUsd, setRequestUsd] = useState('40')
  const [result, setResult] = useState('')
  const selected = { ...versions.find(item => item.id === selectedId)!, pendingCents }
  function tryRequest() {
    const cents = Math.round(Number(requestUsd) * 100)
    const available = campaignBudgetState(selected).availableCents
    if (!canReserveSubmission(available, cents)) return setResult(`Request blocked: $${(available / 100).toFixed(2)} remains. This request cannot be submitted.`)
    setPendingCents(current => current + cents)
    setResult(`Request accepted: $${(cents / 100).toFixed(2)} reserved. $${((available - cents) / 100).toFixed(2)} remains across both versions.`)
  }
  return <main className="creator-app creator-portal mx-auto max-w-6xl p-5 sm:p-8">
    <p className="mb-5 text-xs text-zinc-500">Local creator preview · sample data · live campaigns are unchanged</p>
    <section aria-label="Budget lock preview" className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-semibold">Try the submission budget lock</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[[0, '20% left'], [45000, '$50 left'], [50000, 'Fully requested']].map(([value, label]) => <button type="button" key={String(label)} onClick={() => { setPendingCents(Number(value)); setResult('') }} className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium">{label}</button>)}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-zinc-600">Expected payout (USD)<input type="number" min="0" step="1" value={requestUsd} onChange={event => setRequestUsd(event.target.value)} className="creator-field w-32" /></label>
        <button type="button" onClick={tryRequest} className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white">Try submission</button>
      </div>
      <p role="status" className="mt-3 text-sm text-zinc-600">{result || 'Sample requests only. Both campaign versions share this balance.'}</p>
    </section>
    <div className="mb-6"><CampaignVersionToggle campaigns={versions} selectedId={selected.id} onChange={setSelectedId} /></div>
    <LaunchCampaignDetail key={selected.id} sprint={selected} campaign={campaign} />
  </main>
}
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  return isLocalAnalyticsPreview(process.env.NODE_ENV, req.headers, req.socket.remoteAddress) ? { props: {} } : { notFound: true }
}
