import { CreatorUpdates } from '@/components/creator/creator-updates'
import { Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { CreatorNextStep } from '@/components/creator/creator-next-step'
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

  const paidEarningsCents = data.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((total, payment) => total + payment.amountCents, 0)
  const activeSubmissions = data.submissions.filter(
    (submission) =>
      submission.status === 'pending' || submission.status === 'in_review',
  ).length
  const approvedSubmissions = data.submissions.filter(
    (submission) =>
      submission.status === 'approved' || submission.status === 'paid',
  ).length
  const firstName = data.profile?.displayName.trim().split(/\s+/)[0]
  const hasSubmitted = data.submissions.length > 0

  return (
    <>
      <CreatorHeader
        eyebrow="Overview"
        title={
          firstName ? `Good to see you, ${firstName}` : 'Your creator workspace'
        }
        description="Your next step, reviews, and earnings."
      />
      <CreatorNextStep accounts={data.socialAccounts} hasSubmitted={hasSubmitted} onAccountSaved={mutate} />
      <section
        className="creator-metrics grid grid-cols-2 xl:grid-cols-4"
        aria-label="Your creator summary"
      >
        <MetricCard
          label="Paid Earnings"
          value={formatMoney(paidEarningsCents)}
          detail="Completed payouts"
        />
        <MetricCard
          label="In Review"
          value={formatNumber(activeSubmissions)}
          detail="Active submissions"
        />
        <MetricCard
          label="Approved"
          value={formatNumber(approvedSubmissions)}
          detail="Videos accepted"
        />
        <MetricCard
          label="Accounts"
          value={formatNumber(data.socialAccounts.length)}
          detail="Connected profiles"
        />
      </section>
      <CreatorUpdates data={data} />
    </>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="creator-metric p-4 sm:p-6">
      <p className="text-[13px] font-medium text-[#73777d]">{label}</p>
      <p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums tracking-[-0.05em]">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-[#858a91]">{detail}</p>
    </article>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}
function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100)
}
