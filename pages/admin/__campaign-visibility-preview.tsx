import { useEffect, useState } from 'react'
import { SWRConfig } from 'swr'
import { CreatorSprintsPanel } from '@/components/admin/creator-sprints-panel'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { detailedAnalysisVariantTerms } from '@/lib/creator/detailed-analysis-variant'
import type { CreatorSprint } from '@/lib/creator/sprints'
import { sprintInputSchema } from '@/lib/creator/sprints'
import { isLocalAnalyticsPreview } from '@/lib/admin/local-analytics-preview'
import type { GetServerSideProps } from 'next'

const creators = [
  { id: 'a4ebf114-15a8-42b2-ac61-134690ef1db0', displayName: 'Jannis Müpller', socialHandle: null },
  { id: 'e4806c64-ff43-4641-857e-fead8462fc7e', displayName: 'zukai method', socialHandle: null },
  { id: '9b24ff22-f3f9-42a1-a273-6e0fab0403b9', displayName: 'ascendic international', socialHandle: null },
  { id: '00000000-0000-4000-8000-000000000001', displayName: 'Another creator · sample', socialHandle: '@sample' },
]
const source = LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!
const terms = launchCampaignTerms(source)
const base: CreatorSprint = {
  id: 'bd0d7a74-3c39-44dd-98ec-21bf6667a714', name: source.name, description: source.description,
  status: 'published', budgetCents: 250000, startsAt: '2026-10-24T01:52:12.189Z', endsAt: '2026-11-23T02:52:12.189Z',
  terms, usedCents: 200000, pendingCents: 45000, sharedBudget: true, budgetPoolId: 'bd0d7a74-3c39-44dd-98ec-21bf6667a714', budgetPoolName: 'Mogging Detailed Analysis', counts: { pending: 0, in_review: 0, approved: 0, rejected: 0, paid: 0 },
  audience: { mode: 'all', creatorIds: [] },
}

export default function CampaignVisibilityPreview() {
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('Changes in this preview stay in this browser session.')
  useEffect(() => {
    let sprints = [base, { ...base, id: 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11', name: 'Mogging Detailed Analysis MGC', terms: detailedAnalysisVariantTerms(terms, base.id), audience: { mode: 'selected' as const, creatorIds: creators.slice(0, 3).map(creator => creator.id) } }]
    const original = window.fetch
    window.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname
      if (path !== '/api/admin/creator/sprints') return original(input, init)
      if ((init?.method || 'GET') === 'GET') return Response.json({ data: { sprints, creators } })
      const parsed = sprintInputSchema.safeParse(JSON.parse(String(init?.body || '{}')))
      if (!parsed.success) return Response.json({ error: { message: 'Check campaign fields' } }, { status: 400 })
      const saved = { ...base, ...parsed.data, id: parsed.data.id || crypto.randomUUID() }
      sprints = [...sprints.filter(sprint => sprint.id !== saved.id), saved]
      setMessage('Saved in the local preview only. Live campaigns are unchanged.')
      return Response.json({ data: { sprint: saved } })
    }, original)
    setReady(true)
    return () => { window.fetch = original }
  }, [])
  return <main className="p-5 sm:p-8">
    <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
    <p className="mb-6 mt-2 text-sm text-zinc-500" role="status">Local preview · sample data. {message}</p>
    {ready ? <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false }}>
      <CreatorSprintsPanel submissions={[]} payments={[]} onSelectSubmission={() => {}} />
    </SWRConfig> : null}
  </main>
}
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  return isLocalAnalyticsPreview(process.env.NODE_ENV, req.headers, req.socket.remoteAddress) ? { props: {} } : { notFound: true }
}
