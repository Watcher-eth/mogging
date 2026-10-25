import { CreatorUpdates } from '@/components/creator/creator-updates'
import { Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { OverviewBento } from '@/components/creator/overview-bento'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'

export default function CreatorOverviewPage() {
  return (
    <CreatorShell>
      <OverviewContent />
    </CreatorShell>
  )
}

function OverviewContent() {
  const { data, isLoading, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet, {
    refreshInterval: 30_000,
  })

  if (isLoading)
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <div className="flex items-center gap-2.5 text-sm font-medium text-[#858a91]">
          <Loader2 className="size-4 animate-spin" />
          Loading overview
        </div>
      </div>
    )
  if (!data)
    return (
      <div className="grid min-h-[45vh] place-items-center text-sm text-[#858a91]">
        Could not load your creator overview.
      </div>
    )

  const firstName = data.profile?.displayName.trim().split(/\s+/)[0]

  return (
    <>
      <CreatorHeader
        eyebrow="Overview"
        title={
          firstName ? `Good to see you, ${firstName}` : 'Your creator workspace'
        }
        description="Your reach, reviews, and rewards in one place."
        eyebrowAccessory={<span className="inline-flex items-center rounded-full bg-[#f4f6f5] px-3 py-2 text-[10px] font-normal normal-case tracking-normal text-[#6b766f]">All time</span>}
      />
      <OverviewBento data={data} onAccountSaved={mutate} />
      <CreatorUpdates data={data} />
    </>
  )
}
