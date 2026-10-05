import Link from 'next/link'
import { ArrowRight, Loader2, Megaphone } from 'lucide-react'
import useSWR from 'swr'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { VideoSubmissionAnimation } from '@/components/creator/video-submission-animation'
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
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet, {
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
      <section className="creator-next-step mb-7 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">
            Next Up
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">
            {hasSubmitted ? 'Submit your next video' : 'Submit your first video'}
          </h2>
          <p className="mt-0.5 text-sm leading-5 text-[#73777d]">
            Choose a campaign and share your published post with analytics
            evidence.
          </p>
          <Link
            href="/creator/submit"
            className="group mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#00A8EF]"
          >
            Continue
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="flex justify-center sm:block">
          <VideoSubmissionAnimation />
        </div>
      </section>
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
      <section aria-label="Announcements" className="mt-8">
        <h2 className="text-sm font-semibold">Announcements</h2>
        {[
          {
            id: '8592a794-9b27-455a-8121-393e39c85ba2',
            title: 'Our first campaign: Mogging Face Analysis is live',
            description: '$3,000 budget · Create original, looks-focused videos or slideshows showcasing Mogging’s face analysis. Read the brief to get started.',
          },
          {
            id: 'a9b2aed6-4d87-4b1d-989e-7d9489829f2c',
            title: 'New campaign: Before & After Transformations is live',
            description: '$2,000 budget · Before → CTA-generator mock report → After. Videos and slideshows welcome. Read the brief to get started.',
          },
        ].map((announcement) => <Link
          key={announcement.id}
          href={`/creator/sprints?id=${announcement.id}`}
          className="group mt-3 flex items-center gap-4 rounded-2xl border border-[#e8ebee] p-5 transition-colors hover:bg-[#fafbfc]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef9ff] text-[#00A8EF]">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {announcement.title}
            </span>
            <span className="mt-1 block text-sm text-[#73777d]">
              {announcement.description}
            </span>
          </span>
          <ArrowRight
            className="size-4 shrink-0 text-[#00A8EF] transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>)}
      </section>
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
