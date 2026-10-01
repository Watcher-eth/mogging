import Link from 'next/link'
import {
  ArrowRight,
  CircleDollarSign,
  Clapperboard,
  Eye,
  FileCheck2,
  Loader2,
  UsersRound,
} from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import type { CreatorDashboard, CreatorSubmission } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { CreatorIcon, CreatorStatusIcon, type CreatorIconName } from '@/components/creator/creator-icon'
import { CreatorReferralLinks } from '@/components/creator/referral-links'

export default function CreatorOverviewPage() {
  return <CreatorShell><OverviewContent /></CreatorShell>
}

function OverviewContent() {
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet, { refreshInterval: 30_000 })

  if (isLoading) return <LoadingState />
  if (!data) return <div className="grid min-h-[45vh] place-items-center text-sm text-[#858a91]">Could not load your creator overview.</div>

  const payoutReady = Boolean(data.profile && (data.profile.paymentOption === 'paypal' ? data.profile.paypalEmail : data.profile.cryptoNetwork && data.profile.cryptoWalletAddress))
  const tasks: SetupTaskItem[] = [
    { title: 'Connect a social account', description: 'Add the TikTok or Instagram account you publish from.', href: '/creator/accounts', complete: data.socialAccounts.length > 0, icon: 'accounts' },
    { title: 'Add payout information', description: 'Choose PayPal or crypto for approved earnings.', href: '/creator/payout-information', complete: payoutReady, icon: 'payouts' },
    { title: 'Submit your first video', description: 'Share a published post and its analytics evidence.', href: '/creator/submit', complete: data.submissions.length > 0, icon: 'video-submissions' },
    { title: 'Get your first approval', description: 'Follow review status and address any team notes.', href: '/creator/submissions', complete: data.submissions.some((submission) => submission.status === 'approved' || submission.status === 'paid'), icon: 'submissions' },
  ]
  const completedTasks = tasks.filter((task) => task.complete).length
  const paidEarningsCents = data.payments.filter((payment) => payment.status === 'paid').reduce((total, payment) => total + payment.amountCents, 0)
  const activeSubmissions = data.submissions.filter((submission) => submission.status === 'pending' || submission.status === 'in_review').length
  const approvedSubmissions = data.submissions.filter((submission) => submission.status === 'approved' || submission.status === 'paid').length
  const firstName = data.profile?.displayName.trim().split(/\s+/)[0]
  const community = { totalQualifiedViews: 1_200_000, totalPaidCents: 45_000, approvedSubmissions: 6, totalDownloads: 1_674 }
  const latestSubmission = data.submissions[0]
  const nextTask = tasks.find((task) => !task.complete)

  return (
    <>
      <CreatorHeader
        eyebrow="Overview"
        title={firstName ? `Good to see you, ${firstName}` : 'Your creator workspace'}
        description="Your next step, reviews, and earnings."
      />

          <section className="creator-next-step mb-7 p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Next Up</p>
            {nextTask ? <><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">{nextTask.title}</h2><p className="mt-0.5 text-sm leading-5 text-[#73777d]">{nextTask.description}</p><Link href={nextTask.href} className="group mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#00A8EF]">Continue<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></Link></> : <><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">You’re all set</h2><p className="mt-0.5 text-sm leading-5 text-[#73777d]">Your creator setup is complete. Keep publishing and checking reviews here.</p></>}
          </section>

      <section className="creator-metrics grid grid-cols-2 xl:grid-cols-4" aria-label="Your creator summary">
        <MetricCard label="Paid Earnings" value={formatMoney(paidEarningsCents)} detail="Completed payouts" />
        <MetricCard label="In Review" value={formatNumber(activeSubmissions)} detail="Active submissions" />
        <MetricCard label="Approved" value={formatNumber(approvedSubmissions)} detail="Videos accepted" />
        <MetricCard label="Accounts" value={formatNumber(data.socialAccounts.length)} detail="Connected profiles" />
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
        <section className="creator-surface overflow-hidden">
          <div className="flex flex-col gap-5 border-b border-black/[0.055] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Getting Started</p>
              <h2 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em]">Creator setup</h2>
              <p className="mt-1.5 text-sm text-[#73777d]">A short path from account setup to first payout.</p>
            </div>
            <div className="min-w-36">
              <div className="flex items-center justify-between text-xs"><span className="font-medium text-[#73777d]">Progress</span><span className="font-semibold tabular-nums">{completedTasks} of {tasks.length}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]"><div className="h-full origin-left rounded-full creator-tone-blue transition-transform duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]" style={{ transform: `scaleX(${completedTasks / tasks.length})` }} /></div>
            </div>
          </div>
          <div className="divide-y divide-black/[0.055] px-3 sm:px-4">
            {tasks.map((task) => <SetupTask key={task.title} task={task} />)}
          </div>
        </section>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <section className="creator-surface creator-guide-card flex min-h-52 flex-col p-5 sm:p-6">
            <CreatorIcon name="guide" className="size-14" />
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.13em]">Program Guide</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Publish with confidence</h2>
            <p className="mt-0.5 text-sm leading-5">Review the looks-focused content rules, annotated examples, audience eligibility, and evidence requirements before posting.</p>
            <Link href="/creator/guide" className="group mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold">Open the guide<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
          </section>


        </div>
      </div>

      {data.socialAccounts.length > 0 ? <div className="mt-5"><CreatorReferralLinks /></div> : null}

      <section className="creator-surface mt-5 p-5 sm:p-6">
        <div className="flex items-end justify-between gap-5">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Latest Activity</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Most recent submission</h2></div>
          {latestSubmission ? <Link href="/creator/submissions" className="text-sm font-semibold text-[#00A8EF]">View All</Link> : null}
        </div>
        {latestSubmission ? <LatestSubmission submission={latestSubmission} /> : <EmptySubmission />}
      </section>

      <details className="mt-6"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Program-wide activity</summary>
        <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">Program Activity</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Across Mogging Creators</h2></div>
        <div className="grid overflow-hidden rounded-[22px] border border-black/[0.055] bg-white/80 sm:grid-cols-2 xl:grid-cols-4">
          <CommunityMetric label="Qualified Views" value={formatNumber(community.totalQualifiedViews)} detail="Reviewed creator views" icon={Eye} />
          <CommunityMetric label="Paid to Creators" value={formatMoney(community.totalPaidCents)} detail="Completed creator payouts" icon={CircleDollarSign} />
          <CommunityMetric label="Approved Videos" value={formatNumber(community.approvedSubmissions)} detail="Accepted submissions" icon={FileCheck2} />
          <CommunityMetric label="Downloads Driven" value={formatNumber(community.totalDownloads)} detail="Downloads from creator referrals" icon={UsersRound} />
        </div>
      </details>
    </>
  )
}

type SetupTaskItem = { title: string; description: string; href: string; complete: boolean; icon: CreatorIconName }

function LoadingState() {
  return <div className="grid min-h-[45vh] place-items-center"><div className="flex items-center gap-2.5 text-sm font-medium text-[#858a91]"><Loader2 className="size-4 animate-spin" />Loading overview</div></div>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="creator-metric p-4 sm:p-6"><p className="text-[13px] font-medium text-[#73777d]">{label}</p><p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums tracking-[-0.05em]">{value}</p><p className="mt-2 text-[11px] text-[#858a91]">{detail}</p></article>
}

function SetupTask({ task }: { task: SetupTaskItem }) {
  return (
    <Link href={task.href} className="group flex items-center gap-3.5 rounded-[16px] px-2 py-4 transition-transform duration-150 active:scale-[0.99]">
      <CreatorStatusIcon name={task.icon} verified={task.complete} />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold tracking-[-0.01em]">{task.title}</span><span className="mt-1 block text-xs leading-5 text-[#73777d]">{task.description}</span></span>
      <span className={cn('hidden text-xs font-medium transition-[color,transform] duration-150 sm:block', task.complete ? 'text-[#00A8EF]' : 'text-[#858a91] group-hover:translate-x-0.5 group-hover:text-[#00A8EF]')}>{task.complete ? 'Complete' : 'Continue'}</span>
      <ArrowRight className="size-4 shrink-0 text-[#c7c7cc] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#00A8EF]" />
    </Link>
  )
}

function LatestSubmission({ submission }: { submission: CreatorSubmission }) {
  return <Link href="/creator/submissions" className="group mt-5 flex flex-col gap-3 rounded-[18px] bg-[#f7f8f9] p-4 transition-[background-color,transform] duration-150 active:scale-[0.99] hover:bg-[#eef0f2] sm:flex-row sm:items-center"><CreatorIcon name="submissions" className="size-12" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{submission.title}</span><span className="mt-1 block text-xs text-[#73777d]">{submission.platform} · Submitted {formatDate(submission.createdAt)}</span></span><StatusPill status={submission.status} /><ArrowRight className="size-4 shrink-0 text-[#c7c7cc] transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
}

function EmptySubmission() {
  return <div className="mt-5 flex flex-col gap-4 rounded-[18px] bg-[#f7f8f9] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">No submissions yet</p><p className="mt-1 text-sm text-[#73777d]">Your first review and payout status will appear here.</p></div><Button asChild className="h-10 shrink-0 rounded-full px-4"><Link href="/creator/submit">Submit Your First Video</Link></Button></div>
}

function CommunityMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Eye }) {
  return <article className="border-black/[0.055] p-5 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 xl:[&:not(:last-child)]:border-b-0 xl:[&:not(:last-child)]:border-r"><div className="flex items-center gap-2 text-[#858a91]"><Icon className="size-3.5" /><p className="text-[11px] font-medium">{label}</p></div><p className="mt-3 text-xl font-semibold tabular-nums tracking-[-0.04em]">{value}</p><p className="mt-1.5 text-[11px] text-[#858a91]">{detail}</p></article>
}

function StatusPill({ status }: { status: CreatorSubmission['status'] }) {
  return <span className={cn('w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', status === 'paid' || status === 'approved' ? 'creator-tone-green text-[#29CE53]' : status === 'rejected' ? 'creator-tone-red text-[#F33232]' : 'bg-[#f5f6f7] text-[#52565c]')}>{formatStatus(status)}</span>
}

function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatStatus(status: CreatorSubmission['status']) { return status.split('_').map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(' ') }
