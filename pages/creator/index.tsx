import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Check,
  CircleDollarSign,
  Clapperboard,
  Eye,
  FileCheck2,
  Loader2,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import type { CreatorDashboard, CreatorSubmission } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export default function CreatorOverviewPage() {
  return <CreatorShell><OverviewContent /></CreatorShell>
}

function OverviewContent() {
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet, { refreshInterval: 30_000 })

  if (isLoading) return <LoadingState />
  if (!data) return <div className="grid min-h-[45vh] place-items-center text-sm text-[#86868b]">Could not load your creator overview.</div>

  const payoutReady = Boolean(data.profile && (data.profile.paymentOption === 'paypal' ? data.profile.paypalEmail : data.profile.cryptoNetwork && data.profile.cryptoWalletAddress))
  const tasks = [
    { title: 'Connect a social account', description: 'Add the TikTok or Instagram account you publish from.', href: '/creator/accounts', complete: data.socialAccounts.length > 0, icon: BadgeCheck },
    { title: 'Add payout information', description: 'Choose PayPal or crypto for approved earnings.', href: '/creator/payout-information', complete: payoutReady, icon: WalletCards },
    { title: 'Submit your first video', description: 'Share a published post and its analytics evidence.', href: '/creator/submit', complete: data.submissions.length > 0, icon: Clapperboard },
    { title: 'Get your first approval', description: 'Follow review status and address any team notes.', href: '/creator/submissions', complete: data.submissions.some((submission) => submission.status === 'approved' || submission.status === 'paid'), icon: FileCheck2 },
  ]
  const completedTasks = tasks.filter((task) => task.complete).length
  const paidEarningsCents = data.payments.filter((payment) => payment.status === 'paid').reduce((total, payment) => total + payment.amountCents, 0)
  const activeSubmissions = data.submissions.filter((submission) => submission.status === 'pending' || submission.status === 'in_review').length
  const approvedSubmissions = data.submissions.filter((submission) => submission.status === 'approved' || submission.status === 'paid').length
  const firstName = data.profile?.displayName.trim().split(/\s+/)[0]
  const community = data.communityMetrics || { totalQualifiedViews: 0, totalFirstTimePaidCustomers: 0, totalPaidCents: 0, paidCreators: 0, approvedSubmissions: 0 }
  const latestSubmission = data.submissions[0]
  const nextTask = tasks.find((task) => !task.complete)

  return (
    <>
      <CreatorHeader
        eyebrow="Overview"
        title={firstName ? `Good to see you, ${firstName}` : 'Your creator workspace'}
        description="Everything important is here: what to do next, what is under review, and what you have earned."
        action={<Button asChild className="h-11 rounded-full px-5 shadow-[0_5px_16px_rgba(0,113,227,0.2)]"><Link href="/creator/submit"><Clapperboard />Submit Video</Link></Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Your creator summary">
        <MetricCard label="Paid Earnings" value={formatMoney(paidEarningsCents)} detail="Completed payouts" />
        <MetricCard label="In Review" value={formatNumber(activeSubmissions)} detail="Active submissions" />
        <MetricCard label="Approved" value={formatNumber(approvedSubmissions)} detail="Videos accepted" />
        <MetricCard label="Accounts" value={formatNumber(data.socialAccounts.length)} detail="Connected profiles" />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="creator-surface overflow-hidden">
          <div className="flex flex-col gap-5 border-b border-black/[0.055] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Getting Started</p>
              <h2 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em]">Creator setup</h2>
              <p className="mt-1.5 text-sm text-[#6e6e73]">A short path from account setup to first payout.</p>
            </div>
            <div className="min-w-36">
              <div className="flex items-center justify-between text-xs"><span className="font-medium text-[#6e6e73]">Progress</span><span className="font-semibold tabular-nums">{completedTasks} of {tasks.length}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]"><div className="h-full origin-left rounded-full bg-[#0071e3] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]" style={{ transform: `scaleX(${completedTasks / tasks.length})` }} /></div>
            </div>
          </div>
          <div className="divide-y divide-black/[0.055] px-3 sm:px-4">
            {tasks.map((task) => <SetupTask key={task.title} task={task} />)}
          </div>
        </section>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <section className="creator-surface flex min-h-52 flex-col p-5 sm:p-6">
            <span className="grid size-10 place-items-center rounded-[14px] bg-[#e8f2ff] text-[#0071e3]"><BookOpenText className="size-[18px]" /></span>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Program Guide</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Publish with confidence</h2>
            <p className="mt-2 text-sm leading-5 text-[#6e6e73]">Review formats, audience rules, and evidence requirements before posting.</p>
            <Link href="/creator/guide" className="group mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[#0071e3]">Open the guide<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
          </section>

          <section className="creator-surface p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Next Up</p>
            {nextTask ? <><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">{nextTask.title}</h2><p className="mt-2 text-sm leading-5 text-[#6e6e73]">{nextTask.description}</p><Link href={nextTask.href} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0071e3]">Continue<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" /></Link></> : <><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">You’re all set</h2><p className="mt-2 text-sm leading-5 text-[#6e6e73]">Your creator setup is complete. Keep publishing and checking reviews here.</p></>}
          </section>
        </div>
      </div>

      <section className="creator-surface mt-5 p-5 sm:p-6">
        <div className="flex items-end justify-between gap-5">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Latest Activity</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Most recent submission</h2></div>
          {latestSubmission ? <Link href="/creator/submissions" className="text-sm font-semibold text-[#0071e3]">View All</Link> : null}
        </div>
        {latestSubmission ? <LatestSubmission submission={latestSubmission} /> : <EmptySubmission />}
      </section>

      <section className="mt-9">
        <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Program Activity</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Across Mogging Creators</h2></div>
        <div className="grid overflow-hidden rounded-[22px] border border-black/[0.055] bg-white/80 sm:grid-cols-2 xl:grid-cols-4">
          <CommunityMetric label="Qualified Views" value={formatNumber(community.totalQualifiedViews)} detail="Reviewed creator views" icon={Eye} />
          <CommunityMetric label="Paid to Creators" value={formatMoney(community.totalPaidCents)} detail={`${formatNumber(community.paidCreators)} creators paid`} icon={CircleDollarSign} />
          <CommunityMetric label="Approved Videos" value={formatNumber(community.approvedSubmissions)} detail="Accepted submissions" icon={FileCheck2} />
          <CommunityMetric label="Customers Driven" value={formatNumber(community.totalFirstTimePaidCustomers)} detail="First-time paid customers" icon={UsersRound} />
        </div>
      </section>
    </>
  )
}

type SetupTaskItem = { title: string; description: string; href: string; complete: boolean; icon: typeof BadgeCheck }

function LoadingState() {
  return <div className="grid min-h-[45vh] place-items-center"><div className="flex items-center gap-2.5 text-sm font-medium text-[#86868b]"><Loader2 className="size-4 animate-spin" />Loading overview</div></div>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="creator-surface p-5"><p className="text-[13px] font-medium text-[#6e6e73]">{label}</p><p className="mt-3 text-[1.8rem] font-semibold leading-none tabular-nums tracking-[-0.05em]">{value}</p><p className="mt-2 text-[11px] text-[#86868b]">{detail}</p></article>
}

function SetupTask({ task }: { task: SetupTaskItem }) {
  const Icon = task.icon
  return (
    <Link href={task.href} className="group flex items-center gap-3.5 rounded-[16px] px-2 py-4 transition-[background-color,transform] duration-150 active:scale-[0.99] hover:bg-black/[0.025]">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', task.complete ? 'bg-[#e5f7ea] text-[#248a3d]' : 'bg-[#f0f0f2] text-[#6e6e73]')}>{task.complete ? <Check className="size-4" /> : <Icon className="size-4" />}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold tracking-[-0.01em]">{task.title}</span><span className="mt-1 block text-xs leading-5 text-[#6e6e73]">{task.description}</span></span>
      <span className={cn('hidden text-xs font-medium sm:block', task.complete ? 'text-[#248a3d]' : 'text-[#86868b]')}>{task.complete ? 'Complete' : 'Continue'}</span>
      <ArrowRight className="size-4 shrink-0 text-[#c7c7cc] transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
    </Link>
  )
}

function LatestSubmission({ submission }: { submission: CreatorSubmission }) {
  return <Link href="/creator/submissions" className="group mt-5 flex flex-col gap-3 rounded-[18px] bg-[#f5f5f7] p-4 transition-[background-color,transform] duration-150 active:scale-[0.99] hover:bg-[#eeeeF0] sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-white text-[#0071e3] shadow-sm"><Clapperboard className="size-[18px]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{submission.title}</span><span className="mt-1 block text-xs text-[#6e6e73]">{submission.platform} · Submitted {formatDate(submission.createdAt)}</span></span><StatusPill status={submission.status} /><ArrowRight className="size-4 shrink-0 text-[#c7c7cc] transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
}

function EmptySubmission() {
  return <div className="mt-5 flex flex-col gap-4 rounded-[18px] bg-[#f5f5f7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">No submissions yet</p><p className="mt-1 text-sm text-[#6e6e73]">Your first review and payout status will appear here.</p></div><Button asChild className="h-10 shrink-0 rounded-full px-4"><Link href="/creator/submit">Submit Your First Video</Link></Button></div>
}

function CommunityMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Eye }) {
  return <article className="border-black/[0.055] p-5 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 xl:[&:not(:last-child)]:border-b-0 xl:[&:not(:last-child)]:border-r"><div className="flex items-center gap-2 text-[#86868b]"><Icon className="size-3.5" /><p className="text-[11px] font-medium">{label}</p></div><p className="mt-3 text-xl font-semibold tabular-nums tracking-[-0.04em]">{value}</p><p className="mt-1.5 text-[11px] text-[#86868b]">{detail}</p></article>
}

function StatusPill({ status }: { status: CreatorSubmission['status'] }) {
  return <span className={cn('w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', status === 'paid' || status === 'approved' ? 'bg-[#e5f7ea] text-[#248a3d]' : status === 'rejected' ? 'bg-[#ffebea] text-[#d70015]' : 'bg-[#fff4ce] text-[#8a5a00]')}>{formatStatus(status)}</span>
}

function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatStatus(status: CreatorSubmission['status']) { return status.split('_').map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(' ') }
