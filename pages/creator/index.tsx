import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  CircleCheck,
  CircleDollarSign,
  Clapperboard,
  Eye,
  FileCheck2,
  Loader2,
  TrendingUp,
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

  if (isLoading) return <div className="grid min-h-[45vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
  if (!data) return <div className="grid min-h-[45vh] place-items-center text-sm text-zinc-500">Could not load your creator overview.</div>

  const payoutReady = Boolean(data.profile && (data.profile.paymentOption === 'paypal' ? data.profile.paypalEmail : data.profile.cryptoNetwork && data.profile.cryptoWalletAddress))
  const hasAccount = data.socialAccounts.length > 0
  const hasSubmission = data.submissions.length > 0
  const hasApproval = data.submissions.some((submission) => submission.status === 'approved' || submission.status === 'paid')
  const tasks = [
    { title: 'Connect a Social Account', description: 'Add the TikTok or Instagram account you use for creator posts.', href: '/creator/accounts', complete: hasAccount, icon: BadgeCheck },
    { title: 'Set Up Payout Information', description: 'Choose PayPal or crypto so approved earnings have a destination.', href: '/creator/payout-information', complete: payoutReady, icon: WalletCards },
    { title: 'Submit Your First Video', description: 'Choose a format, share the published link, and provide analytics evidence.', href: '/creator/submit', complete: hasSubmission, icon: Clapperboard },
    { title: 'Get Your First Video Approved', description: 'Follow the review status and respond if the team needs more information.', href: '/creator/submissions', complete: hasApproval, icon: FileCheck2 },
  ]
  const completedTasks = tasks.filter((task) => task.complete).length
  const paidEarningsCents = data.payments.filter((payment) => payment.status === 'paid').reduce((total, payment) => total + payment.amountCents, 0)
  const activeSubmissions = data.submissions.filter((submission) => submission.status === 'pending' || submission.status === 'in_review').length
  const approvedSubmissions = data.submissions.filter((submission) => submission.status === 'approved' || submission.status === 'paid').length
  const firstName = data.profile?.displayName.trim().split(/\s+/)[0]
  const community = data.communityMetrics || { totalQualifiedViews: 0, totalFirstTimePaidCustomers: 0, totalPaidCents: 0, paidCreators: 0, approvedSubmissions: 0 }
  const latestSubmission = data.submissions[0]

  return (
    <>
      <CreatorHeader
        eyebrow="Creator Overview"
        title={firstName ? `Welcome Back, ${firstName}` : 'Welcome to Mogging Creators'}
        description="Complete your setup, submit content, and follow the program’s progress from one clear workspace."
        action={<Button asChild className="h-10 rounded-xl"><Link href="/creator/submit"><Clapperboard />Submit a Video</Link></Button>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Getting Started</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Your Creator Checklist</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Follow these steps in order to become ready for review and payouts.</p></div>
            <div className="shrink-0 text-left sm:text-right"><p className="text-2xl font-semibold tracking-[-0.04em]">{completedTasks}/{tasks.length}</p><p className="text-xs text-zinc-400">Tasks Complete</p></div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full origin-left rounded-full bg-black" style={{ transform: `scaleX(${completedTasks / tasks.length})` }} /></div>
          <Link href="/creator/guide" className="group mt-6 flex items-center gap-4 rounded-2xl bg-zinc-950 p-3.5 text-white transition-transform duration-150 ease-out active:scale-[0.995]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10"><BookOpenText className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Review the Creator Program Guide</span><span className="mt-1 block text-xs leading-5 text-white/50">Check format, analytics, and audience requirements before you post.</span></span>
            <span className="hidden shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70 sm:block">Read Guide</span>
            <ArrowRight className="size-4 shrink-0 text-white/40 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
          <div className="mt-6 grid gap-2">
            {tasks.map((task, index) => <SetupTask key={task.title} task={task} index={index} />)}
          </div>
        </section>

        <section className="rounded-[28px] border border-zinc-200 bg-zinc-950 p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Your Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Personal Snapshot</h2>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10">
            <PersonalMetric label="Paid Earnings" value={formatMoney(paidEarningsCents)} />
            <PersonalMetric label="Active Reviews" value={formatNumber(activeSubmissions)} />
            <PersonalMetric label="Approved Videos" value={formatNumber(approvedSubmissions)} />
            <PersonalMetric label="Connected Accounts" value={formatNumber(data.socialAccounts.length)} />
          </div>
          <p className="mt-5 text-xs leading-5 text-white/50">Completed payouts and reviewed submissions update here automatically.</p>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Program Momentum</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">What Creators Are Building</h2><p className="mt-2 text-sm text-zinc-500">Verified performance across the Mogging creator program.</p></div><TrendingUp className="hidden size-5 text-zinc-300 sm:block" /></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CommunityMetric label="Total Creator Views" value={formatNumber(community.totalQualifiedViews)} detail="Qualified views reviewed" icon={Eye} />
          <CommunityMetric label="Paid to Creators" value={formatMoney(community.totalPaidCents)} detail={`${formatNumber(community.paidCreators)} creators paid`} icon={CircleDollarSign} />
          <CommunityMetric label="Approved Videos" value={formatNumber(community.approvedSubmissions)} detail="Across all creator accounts" icon={FileCheck2} />
          <CommunityMetric label="Paying Customers Driven" value={formatNumber(community.totalFirstTimePaidCustomers)} detail="First-time paid customers" icon={UsersRound} />
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-zinc-200 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Latest Activity</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Your Most Recent Submission</h2></div>{latestSubmission ? <Button asChild variant="outline" className="h-10 rounded-xl"><Link href="/creator/submissions">View All</Link></Button> : null}</div>
        {latestSubmission ? <LatestSubmission submission={latestSubmission} /> : <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">No Submissions Yet</p><p className="mt-1 text-sm text-zinc-500">Your first submission will appear here with its review and payout status.</p></div><Button asChild className="h-10 shrink-0 rounded-xl"><Link href="/creator/submit">Submit Your First Video</Link></Button></div>}
      </section>
    </>
  )
}

type SetupTaskItem = {
  title: string
  description: string
  href: string
  complete: boolean
  icon: typeof BadgeCheck
}

function SetupTask({ task, index }: { task: SetupTaskItem; index: number }) {
  const Icon = task.icon
  return (
    <Link href={task.href} className="group flex items-center gap-4 rounded-2xl border border-zinc-200 p-3.5 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.995]">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', task.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600')}>{task.complete ? <CircleCheck className="size-5" /> : <Icon className="size-5" />}</span>
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold"><span className="text-xs tabular-nums text-zinc-300">{String(index + 1).padStart(2, '0')}</span>{task.title}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{task.description}</span></span>
      <span className={cn('hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:block', task.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>{task.complete ? 'Complete' : 'Next Step'}</span>
      <ArrowRight className="size-4 shrink-0 text-zinc-300 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-black" />
    </Link>
  )
}

function PersonalMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-zinc-950 p-4"><p className="text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{value}</p><p className="mt-1.5 text-[11px] leading-4 text-white/45">{label}</p></div>
}

function CommunityMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Eye }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="flex items-start justify-between gap-4"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">Live</span></div><p className="mt-5 text-2xl font-semibold tracking-[-0.045em]">{value}</p><p className="mt-1 text-sm font-medium">{label}</p><p className="mt-2 text-xs text-zinc-400">{detail}</p></div>
}

function LatestSubmission({ submission }: { submission: CreatorSubmission }) {
  return <Link href="/creator/submissions" className="group mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.995] sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><Clapperboard className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{submission.title}</span><span className="mt-1 block text-xs text-zinc-500">{submission.platform} · Submitted {formatDate(submission.createdAt)}</span></span><span className={cn('w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold', submission.status === 'paid' || submission.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : submission.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>{formatStatus(submission.status)}</span><ArrowRight className="size-4 shrink-0 text-zinc-300 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-black" /></Link>
}

function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatStatus(status: CreatorSubmission['status']) { return status.split('_').map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(' ') }
