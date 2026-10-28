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
  terms: launchCampaignTerms(campaign), usedCents: 0, counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
}
const versions = [source, { ...source, id: 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11', name: MGC_CAMPAIGN_NAME, terms: detailedAnalysisVariantTerms(source.terms, source.id) }]

export default function MgcPreview() {
  const [selectedId, setSelectedId] = useState(versions[1].id)
  const selected = versions.find(item => item.id === selectedId)!
  return <main className="creator-app creator-portal mx-auto max-w-6xl p-5 sm:p-8">
    <p className="mb-5 text-xs text-zinc-500">Local creator preview · sample data · live campaigns are unchanged</p>
    <div className="mb-6"><CampaignVersionToggle campaigns={versions} selectedId={selected.id} onChange={setSelectedId} /></div>
    <LaunchCampaignDetail key={selected.id} sprint={selected} campaign={campaign} />
  </main>
}
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  return isLocalAnalyticsPreview(process.env.NODE_ENV, req.headers, req.socket.remoteAddress) ? { props: {} } : { notFound: true }
}
