import * as Avatar from '@radix-ui/react-avatar'
import { creatorAccountLabel } from '@/components/creator/types'
import type { GetServerSideProps } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  Loader2,
  LogOut,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle,
  ZoomIn,
  ZoomOut,
  Video,
  Wallet,
} from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AdminPasswordGate } from '@/components/admin/admin-password-gate'
import type { CreatorCtaLibraryItem } from '@/lib/creator/cta-library'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiGet, apiPatch, apiPost, apiRequest, ApiClientError } from '@/lib/api/client'
import { getAuthSession } from '@/lib/auth/session'
import { isCreatorAdminEmail } from '@/lib/admin/creator-auth'
import { cn } from '@/lib/utils'
import { CreatorEconomicsDashboard } from '@/components/admin/creator-economics-dashboard'
import { CreatorAttributionDashboard, CreatorAttributionReport } from '@/components/admin/creator-attribution-dashboard'
import { calculateCreatorPayout, CREATOR_TIER1_AUDIENCE_TIERS, CREATOR_VIEW_THRESHOLDS } from '@/lib/creator/payouts'
import { mergeCreatorSubmissionReviewResults } from '@/lib/creator/submission-review'
import { CreatorIcon, type CreatorIconName } from '@/components/creator/creator-icon'
import { approvalKind, approvalTypes, getApprovalQueue, hasPayoutDestination, isNewInLastDay, publishedVideoEmbedUrl, walletExplorerUrl, type ApprovalKind } from '@/lib/admin/creator-overview'
import type {
  AdminAccount,
  AdminAttributionReport,
  AdminAttributionMetrics,
  AdminCreator,
  AdminDashboard,
  AdminPayment,
  AdminSubmission,
  ReviewTarget,
} from '@/components/admin/creator-types'

const tabs = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'metrics', label: 'Metrics', icon: Gauge },
  { value: 'attribution', label: 'Attribution', icon: ChartNoAxesCombined },
  { value: 'submissions', label: 'Videos', asset: 'submissions' },
  { value: 'cta-library', label: 'CTA Library', icon: BookOpen },
  { value: 'accounts', label: 'Accounts', icon: BadgeCheck },
  { value: 'payments', label: 'Payments', icon: CircleDollarSign },
  { value: 'creators', label: 'Creators', icon: UsersRound },
] as const

type Tab = (typeof tabs)[number]['value']

export default function CreatorAdminPage() {
  const { data: access, isLoading: accessLoading, mutate: mutateAccess } = useSWR<{ unlocked: boolean; email: string }>('/api/admin/creator/session', apiGet)
  const { data, isLoading, mutate } = useSWR<AdminDashboard>(access?.unlocked ? '/api/admin/creator' : null, apiGet, { refreshInterval: 30_000 })
  const dashboard = data ? normalizeAdminDashboard(data) : null
  const [tab, setTab] = useState<Tab>('overview')
  const [selected, setSelected] = useState<ReviewTarget | null>(null)

  if (accessLoading) return <CenteredLoader />
  if (!access?.unlocked) return <AdminPasswordGate onUnlocked={() => void mutateAccess()} />

  async function lockDashboard() {
    await apiRequest('/api/admin/creator/session', { method: 'DELETE' })
    await mutateAccess()
  }

  return (
    <div className="creator-enter w-full">
      <header className="mb-7 flex flex-col gap-5 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400"><ShieldCheck className="size-3.5" />Private workspace</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Creator admin</h1>
          <Link href="/admin/analytics" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">Product & revenue analytics →</Link>
          <p className="mt-3 text-sm text-zinc-500">Review registrations, social accounts, videos, and payouts from one place.</p>
        </div>
        <div className="flex items-center gap-2"><span className="hidden text-xs text-zinc-400 sm:block">{access.email}</span><Button variant="outline" className="h-10 rounded-xl" onClick={() => void lockDashboard()}><LogOut />Lock dashboard</Button></div>
      </header>

      <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
        {tabs.map((item) => {
          const Icon = 'icon' in item ? item.icon : null
          return <button key={item.value} onClick={() => setTab(item.value)} className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-100 hover:text-black active:scale-[0.98] sm:text-sm', tab === item.value && 'bg-black text-white hover:bg-black hover:text-white')}>{'asset' in item ? <CreatorIcon name={item.asset} className="size-6" /> : Icon ? <Icon className="size-4" /> : null}{item.label}</button>
        })}
      </nav>

      {isLoading || !dashboard ? <CenteredLoader /> : <DashboardView tab={tab} data={dashboard} onSelect={setSelected} onRefresh={async () => { await mutate() }} />}
      {selected ? <ReviewDialog key={`${selected.resource}-${selected.item.id}`} target={selected} payments={dashboard?.payments || []} metrics={dashboard?.attributionMetrics || []} open onOpenChange={(open) => { if (!open) setSelected(null) }} onRefresh={async () => { await mutate() }} onSaved={async () => { await mutate(); setSelected(null) }} /> : null}
    </div>
  )
}

function DashboardView({ tab, data, onSelect, onRefresh }: { tab: Tab; data: AdminDashboard; onSelect: (target: ReviewTarget) => void; onRefresh: () => Promise<void> }) {
  if (tab === 'metrics') return <CreatorEconomicsDashboard data={data} onSelectSubmission={(item) => onSelect({ resource: 'submission', item })} onRefresh={onRefresh} />
  if (tab === 'attribution') return <CreatorAttributionDashboard data={data} onSelectCreator={(item) => onSelect({ resource: 'creator', item })} onSelectAccount={(item) => onSelect({ resource: 'account', item })} />
  if (tab === 'submissions') return <ResourceSection eyebrow="Content review" title="Video submissions" description="Inspect uploaded content, published posts, and review notes."><SubmissionList items={data.submissions} payments={data.payments} onSelect={onSelect} /></ResourceSection>
  if (tab === 'cta-library') return <CtaLibraryAdminPanel />
  if (tab === 'accounts') return <ResourceSection eyebrow="Account review" title="Social accounts" description="Approve connected TikTok and Instagram identities or request missing information."><AccountList items={data.accounts} onSelect={onSelect} /></ResourceSection>
  if (tab === 'payments') return <ResourceSection eyebrow="Money movement" title="Creator payments" description="Track scheduled, processing, completed, and failed payouts."><PaymentList items={data.payments} onSelect={onSelect} /></ResourceSection>
  if (tab === 'creators') return <ResourceSection eyebrow="Creator directory" title="Creators" description="Creators are registered on their first signed-in Studio visit, even before connecting an account. Existing creator profiles are included."><div className="mb-5"><CreatorRegistrationMetrics creators={data.creators} accounts={data.accounts} /></div><CreatorList items={data.creators} onSelect={onSelect} /></ResourceSection>
  return <Overview data={data} onSelect={onSelect} />
}

function CtaLibraryAdminPanel() {
  const { data, isLoading, mutate } = useSWR<{ items: CreatorCtaLibraryItem[] }>('/api/admin/creator/cta-library', apiGet)
  if (isLoading || !data) return <CenteredLoader />
  const pending = data.items.filter((item) => item.status === 'pending')
  return <ResourceSection eyebrow="Sample moderation" title="CTA library" description="Approve creator-generated samples before they become downloadable across the creator dashboard."><div className="mb-5 flex items-center gap-2 text-xs text-zinc-500"><span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{pending.length} pending</span><span>{data.items.length} total submissions</span></div>{data.items.length ? <div className="grid gap-4 lg:grid-cols-2">{data.items.map((item) => <CtaReviewCard key={item.id} item={item} onSaved={async () => { await mutate() }} />)}</div> : <EmptyState title="No CTA samples" description="Creator submissions from the CTA generator will appear here." />}</ResourceSection>
}

function CtaReviewCard({ item, onSaved }: { item: CreatorCtaLibraryItem; onSaved: () => Promise<void> }) {
  const [reviewNote, setReviewNote] = useState(item.reviewNote || '')
  const [saving, setSaving] = useState<'approved' | 'rejected' | null>(null)
  const video = item.assetContentType === 'video/mp4'
  async function review(status: 'approved' | 'rejected') {
    setSaving(status)
    try {
      await apiPatch('/api/admin/creator/cta-library', { id: item.id, status, reviewNote: reviewNote || null })
      toast.success(status === 'approved' ? 'CTA added to the creator library' : 'CTA submission rejected')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not review CTA submission')
    } finally {
      setSaving(null)
    }
  }
  return <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="aspect-video bg-zinc-950">{video ? <video className="size-full object-contain" src={item.assetUrl} controls preload="metadata" /> : <div role="img" aria-label={item.title} className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(item.assetUrl)})` }} />}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-base font-semibold">{item.title}</h3><p className="mt-1 text-xs text-zinc-500">{item.creatorName} · {video ? 'Video (MP4)' : 'Screenshot (PNG)'} · {formatDate(String(item.createdAt))}</p></div><StatusPill status={item.status} /></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-zinc-50 p-3 text-xs"><span><span className="block text-zinc-400">Template</span><span className="mt-1 block font-medium">{item.templateId}</span></span><span><span className="block text-zinc-400">Canvas</span><span className="mt-1 block font-medium">{item.formatId}</span></span></div><label className="mt-4 grid gap-2 text-xs font-medium">Review note<textarea className="min-h-20 resize-y rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" value={reviewNote} maxLength={1000} placeholder="Optional feedback visible to the creator" onChange={(event) => setReviewNote(event.target.value)} /></label><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-xl" disabled={saving !== null} onClick={() => void review('rejected')}>{saving === 'rejected' ? <Loader2 className="animate-spin" /> : <XCircle />}Reject</Button><Button className="rounded-xl" disabled={saving !== null} onClick={() => void review('approved')}>{saving === 'approved' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Approve</Button></div></div></article>
}

function Overview({ data, onSelect }: { data: AdminDashboard; onSelect: (target: ReviewTarget) => void }) {
  const [filter, setFilter] = useState<ApprovalKind | 'all'>('all')
  const attention = useMemo(() => getApprovalQueue(data), [data])
  const filtered = attention.filter((target) => filter === 'all' || approvalKind(target) === filter)
  const counts = attention.reduce((totals, target) => { totals[approvalKind(target)]++; return totals }, { submission: 0, account: 0, payout: 0 })
  const outstandingCents = data.payments.filter((payment) => payment.status === 'pending' || payment.status === 'processing').reduce((total, payment) => total + payment.amountCents, 0)

  return (
    <>
      <div className="mb-3"><CreatorRegistrationMetrics creators={data.creators} accounts={data.accounts} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Videos" newValue={data.submissions.filter((item) => isNewInLastDay(item.createdAt)).length} value={data.submissions.length} detail={`${data.submissions.filter((item) => item.status === 'pending').length} awaiting review`} asset="submissions" />
        <Metric label="Accounts" newValue={data.accounts.filter((item) => isNewInLastDay(item.createdAt)).length} value={data.accounts.length} detail={`${data.accounts.filter((item) => item.status === 'pending' && item.analyticsVideoUrl && item.analyticsConfirmedAt).length} awaiting review`} icon={BadgeCheck} />
        <Metric label="Outstanding" newValue={formatMoney(data.payments.filter((item) => (item.status === 'pending' || item.status === 'processing') && isNewInLastDay(item.createdAt)).reduce((total, item) => total + item.amountCents, 0), 'USD')} value={formatMoney(outstandingCents, 'USD')} detail={`${data.payments.filter((item) => item.status === 'pending' || item.status === 'processing').length} payments`} icon={CircleDollarSign} />
      </div>
      <section className="mt-7">
        <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Priority queue</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Needs your attention</h2></div>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter approvals">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2', filter === 'all' ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-600')}>All approvals <span className="ml-2 tabular-nums">{attention.length}</span></button>
          {(Object.keys(approvalTypes) as ApprovalKind[]).map((kind) => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => setFilter(kind)} className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2', filter === kind ? approvalTypes[kind].color : 'border-zinc-200 bg-white text-zinc-600')}>{approvalTypes[kind].plural} <span className="ml-2 tabular-nums">{counts[kind]}</span></button>)}
        </div>
        {filtered.length ? <div className="grid gap-3">{filtered.map((target) => <QueueRow key={`${target.resource}-${target.item.id}`} target={target} onClick={() => onSelect(target)} />)}</div> : <EmptyState title={filter === 'all' ? 'You’re all caught up' : `No ${approvalTypes[filter].plural.toLowerCase()} awaiting approval`} description="New submissions ready for review will appear here." />}
      </section>
    </>
  )
}

function CreatorRegistrationMetrics({ creators, accounts }: { creators: AdminCreator[]; accounts: AdminAccount[] }) {
  const firstConnections = new Map<string, string>()
  for (const account of accounts) {
    const first = firstConnections.get(account.creatorProfileId)
    if (!first || Date.parse(account.createdAt) < Date.parse(first)) firstConnections.set(account.creatorProfileId, account.createdAt)
  }
  const connected = creators.filter((creator) => creator.accountCount > 0).length
  return <div className="grid gap-3 sm:grid-cols-3">
    <Metric label="Total creators" value={creators.length} newValue={creators.filter((creator) => isNewInLastDay(creator.createdAt)).length} detail="Unique creator registrations" icon={UsersRound} />
    <Metric label="No account connected" value={creators.length - connected} newValue={creators.filter((creator) => !creator.accountCount && isNewInLastDay(creator.createdAt)).length} detail="Registered, awaiting connection" icon={UserRound} />
    <Metric label="Account connected" value={connected} newValue={creators.filter((creator) => { const first = firstConnections.get(creator.id); return first && isNewInLastDay(first) }).length} detail="Creators with at least one account" icon={BadgeCheck} />
  </div>
}

function Metric({ label, value, newValue, detail, icon: Icon, asset }: { label: string; value: string | number; newValue?: string | number; detail: string; icon?: typeof UsersRound; asset?: CreatorIconName }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">{label}</p>{asset ? <CreatorIcon name={asset} className="size-10" /> : Icon ? <span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span> : null}</div><div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-3xl font-semibold tracking-[-0.055em]">{value}</p>{newValue !== undefined ? <span className="text-[11px] font-medium text-emerald-700">+{newValue} new</span> : null}</div><p className="mt-1 text-xs text-zinc-400">{detail}</p></div>
}

function ResourceSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section><header className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">{title}</h2><p className="mt-3 text-sm text-zinc-500">{description}</p></header>{children}</section>
}

function SubmissionList({ items, payments, onSelect }: { items: AdminSubmission[]; payments: AdminPayment[]; onSelect: (target: ReviewTarget) => void }) {
  const paymentIds = new Set(payments.map((payment) => payment.submissionId))
  if (!items.length) return <EmptyState title="No video submissions" description="Creator uploads will appear here." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} asset="submissions" title={item.title} subtitle={`${item.creatorName} · ${item.socialHandle ? `@${item.socialHandle}` : 'No connected account'} · ${formatDate(item.createdAt)}${item.socialAccountStatus !== 'approved' ? ' · Account not approved' : ''}`} status={item.status} meta={paymentIds.has(item.id) ? 'Payment created' : 'No payment'} onClick={() => onSelect({ resource: 'submission', item })} />)}</div>
}

function AccountList({ items, onSelect }: { items: AdminAccount[]; onSelect: (target: ReviewTarget) => void }) {
  const reviewable = items.filter((item) => item.analyticsVideoUrl && item.analyticsConfirmedAt)
  if (!reviewable.length) return <EmptyState title="No accounts ready for review" description="Accounts appear here only after their audience recording is submitted." />
  return <div className="grid gap-3">{reviewable.map((item) => <AccountRow key={item.id} item={item} onClick={() => onSelect({ resource: 'account', item })} />)}</div>
}

function AccountAvatar({ account }: { account: AdminAccount }) {
  return <Avatar.Root className="grid size-11 shrink-0 overflow-hidden rounded-full bg-zinc-100">
    <Avatar.Image src={account.avatarUrl || undefined} alt={`${creatorAccountLabel(account)} profile photo`} className="size-full object-cover" />
    <Avatar.Fallback className="grid size-full place-items-center text-sm font-semibold text-zinc-500">{creatorAccountLabel(account).replace(/^@/, '').charAt(0).toUpperCase()}</Avatar.Fallback>
  </Avatar.Root>
}

function accountProfileUrl(account: AdminAccount) {
  return account.profileUrl || (account.handle ? `https://www.${account.platform}.com/${account.platform === 'tiktok' ? '@' : ''}${account.handle}` : null)
}

function AccountRow({ item, onClick }: { item: AdminAccount; onClick: () => void }) {
  const profileUrl = accountProfileUrl(item)
  return <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
    <button onClick={onClick} className="flex w-full min-w-0 items-center gap-3 text-left">
      <AccountAvatar account={item} />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{creatorAccountLabel(item)}</span><span className="mt-1 block truncate text-xs text-zinc-500">{item.creatorName} · {capitalize(item.platform)} · {formatDate(item.createdAt)}</span></span>
      <StatusPill status={item.status} /><ArrowUpRight className="size-4 shrink-0 text-zinc-400" />
    </button>
    {profileUrl ? <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-medium text-blue-600 underline underline-offset-4"><span className="[overflow-wrap:anywhere]">{profileUrl}</span><ArrowUpRight className="size-4 shrink-0" /></a> : <p className="mt-3 text-sm text-amber-700">Profile URL unavailable. Request the account’s username before review.</p>}
  </article>
}

function PaymentList({ items, onSelect }: { items: AdminPayment[]; onSelect: (target: ReviewTarget) => void }) {
  if (!items.length) return <EmptyState title="No payments created" description="Create a payment while reviewing an approved video." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} icon={CircleDollarSign} title={formatMoney(item.amountCents, item.currency)} subtitle={`${item.creatorName} · ${item.submissionTitle || 'Manual payment'} · ${formatDate(item.createdAt)}`} status={item.status} meta={item.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'} onClick={() => onSelect({ resource: 'payment', item })} />)}</div>
}

function CreatorList({ items, onSelect }: { items: AdminCreator[]; onSelect: (target: ReviewTarget) => void }) {
  if (!items.length) return <EmptyState title="No creators yet" description="Creator profiles will appear here after registration." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} icon={UserRound} title={item.displayName} subtitle={`${item.email} · Joined ${formatDate(item.createdAt)}`} status={hasPayoutDestination(item) ? item.authStatus === 'verified' ? 'approved' : item.authStatus : 'registered'} meta={hasPayoutDestination(item) ? item.paymentOption === 'paypal' ? 'PayPal' : item.cryptoNetwork || 'Crypto' : 'No payment method'} onClick={() => onSelect({ resource: 'creator', item })} />)}</div>
}

function ResourceRow({ icon: Icon, asset, title, subtitle, status, meta, onClick }: { icon?: typeof UserRound; asset?: CreatorIconName; title: string; subtitle: string; status: string; meta: string; onClick: () => void }) {
  return <button onClick={onClick} className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)] active:scale-[0.995]">{asset ? <CreatorIcon name={asset} className="size-12" /> : Icon ? <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><Icon className="size-5" /></span> : null}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">{title}</span><span className="mt-1 block truncate text-xs text-zinc-500">{subtitle}</span></span><span className="hidden max-w-48 truncate text-xs text-zinc-400 md:block">{meta}</span><StatusPill status={status} /><ArrowUpRight className="size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" /></button>
}

function ApprovalBadge({ target }: { target: Exclude<ReviewTarget, { resource: 'payment' }> }) {
  const type = approvalTypes[approvalKind(target)]
  return <span className={cn('inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold', type.color)}>{type.label}</span>
}

function QueueRow({ target, onClick }: { target: Exclude<ReviewTarget, { resource: 'payment' }>; onClick: () => void }) {
  const kind = approvalKind(target)
  const title = reviewTitle(target)
  const subtitle = target.resource === 'creator' ? `${target.item.email} · ${target.item.paymentOption === 'paypal' ? 'PayPal' : target.item.cryptoNetwork}` : `${target.item.creatorName} · ${capitalize(target.item.platform)}${target.resource === 'submission' && target.item.socialAccountStatus !== 'approved' ? ' · Account not approved' : ''}`
  const Icon = kind === 'submission' ? Video : kind === 'account' ? BadgeCheck : Wallet
  return <button type="button" onClick={onClick} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
    {target.resource === 'account' ? <AccountAvatar account={target.item} /> : <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl border', approvalTypes[kind].color)}><Icon className="size-5" /></span>}
    <span className="min-w-0 flex-1"><ApprovalBadge target={target} /><span className="mt-2 block truncate text-sm font-semibold">{title}</span><span className="mt-1 block break-words text-xs text-zinc-500">{subtitle}</span><span className="mt-1 block text-xs text-zinc-400 sm:hidden">{formatDate(target.item.createdAt)}</span></span>
    <span className="hidden text-xs text-zinc-400 sm:block">{formatDate(target.item.createdAt)}</span><StatusPill status={target.resource === 'creator' ? target.item.authStatus : target.item.status} /><ArrowUpRight className="size-4 shrink-0 text-zinc-400" />
  </button>
}

function ReviewDialog({ target, payments, metrics, open, onOpenChange, onRefresh, onSaved }: { target: ReviewTarget; payments: AdminPayment[]; metrics: AdminAttributionMetrics[]; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => Promise<void>; onSaved: () => Promise<void> }) {
  const canReview = target.resource !== 'creator' || hasPayoutDestination(target.item)
  const initialStatus = target.resource === 'creator' ? target.item.authStatus : target.item.status
  const [status, setStatus] = useState(initialStatus)
  const [reviewNote, setReviewNote] = useState(target.resource === 'account' || target.resource === 'submission' ? target.item.reviewNote || '' : '')
  const [amount, setAmount] = useState(target.resource === 'payment' ? (target.item.amountCents / 100).toFixed(2) : '')
  const [providerReference, setProviderReference] = useState(target.resource === 'payment' ? target.item.providerReference || '' : '')
  const [reviewChecklist, setReviewChecklist] = useState(() => target.resource === 'submission'
    ? mergeCreatorSubmissionReviewResults(target.item.formatId, target.item.reviewChecklist)
    : [])
  const [adminViewCountThreshold, setAdminViewCountThreshold] = useState(() => target.resource === 'submission'
    ? String(target.item.adminViewCountThreshold ?? target.item.viewCountThreshold ?? '')
    : '')
  const [adminUsAudiencePercent, setAdminUsAudiencePercent] = useState(() => target.resource === 'submission'
    ? String(target.item.adminUsAudiencePercent ?? target.item.usAudiencePercent ?? 'base')
    : 'base')
  const [saving, setSaving] = useState(false)
  const existingPayment = target.resource === 'submission' ? payments.find((payment) => payment.submissionId === target.item.id) : undefined
  const adminPayoutSelection = {
    viewCountThreshold: Number(adminViewCountThreshold),
    usAudiencePercent: adminUsAudiencePercent === 'base' ? null : Number(adminUsAudiencePercent),
  }

  async function save() {
    if (target.resource === 'submission' && !adminViewCountThreshold) return toast.error('Choose the final view count')
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/review', {
        resource: target.resource,
        id: target.item.id,
        status,
        ...(target.resource === 'account' || target.resource === 'submission' ? { reviewNote: reviewNote || null } : null),
        ...(target.resource === 'submission' ? {
          reviewChecklist: reviewChecklist.map(({ id, met, note }) => ({ id, met, note: note || null })),
          adminViewCountThreshold: adminPayoutSelection.viewCountThreshold,
          adminUsAudiencePercent: adminPayoutSelection.usAudiencePercent,
        } : null),
        ...(target.resource === 'payment' ? { amountCents: Math.round(Number(amount) * 100), providerReference: providerReference || null } : null),
      })
      toast.success('Review saved')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0">
        <div className="min-w-0 p-5 sm:p-7">
          <DialogHeader className="min-w-0 pr-8 text-left">
            <div className="flex flex-wrap items-center gap-2">{target.resource !== 'payment' && canReview ? <ApprovalBadge target={target} /> : null}{canReview ? <StatusPill status={initialStatus} /> : null}<span className="text-xs text-zinc-400">{formatDate(target.item.createdAt)}</span></div>
            <div className="flex min-w-0 items-center gap-3 pt-2">{target.resource === 'account' ? <AccountAvatar account={target.item} /> : null}<DialogTitle className="min-w-0 break-words text-2xl">{reviewTitle(target)}</DialogTitle></div>
            <DialogDescription className="[overflow-wrap:anywhere]">{reviewSubtitle(target)}</DialogDescription>
          </DialogHeader>
          {target.resource === 'submission' ? <SubmissionVideo submission={target.item} /> : null}
          <ReviewDetails target={target} />
          {target.resource === 'submission' && target.item.analyticsScreenshotUrl ? <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200"><h3 className="p-4 text-sm font-semibold">Submitted analytics evidence</h3><AdminSubmissionEvidence submission={target.item} /></section> : null}
          {target.resource === 'submission' ? <AttributionEditor submission={target.item} metrics={metrics.find((item) => item.submissionId === target.item.id)} onSaved={onRefresh} /> : null}
          {target.resource === 'submission' ? <AdminPayoutDecision submission={target.item} selection={adminPayoutSelection} onViewCountChange={setAdminViewCountThreshold} onAudienceChange={setAdminUsAudiencePercent} /> : null}
          {target.resource === 'submission' ? <SubmissionRequirementsReview items={reviewChecklist} onChange={setReviewChecklist} /> : null}
          {canReview ? <div className="mt-6 grid gap-2">
            <span className="text-sm font-medium">{target.resource === 'creator' ? 'Payment method approval' : 'Review status'}</span>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions(target.resource).map((option) => <SelectItem key={option} value={option} disabled={target.resource === 'account' && option === 'approved' && (!target.item.analyticsVideoUrl || !target.item.analyticsConfirmedAt)}>{target.resource === 'creator' && option === 'verified' ? 'Approved' : statusLabel(option)}</SelectItem>)}</SelectContent></Select>
          </div> : null}
          {target.resource === 'account' || target.resource === 'submission' ? <label className="mt-5 grid gap-2 text-sm font-medium">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value.slice(0, 1000))} className="min-h-24 resize-y rounded-xl border border-zinc-200 p-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Visible to the creator" /></label> : null}
          {target.resource === 'payment' ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Amount (USD)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12 rounded-xl border border-zinc-200 px-3.5 outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></label><label className="grid gap-2 text-sm font-medium">Provider reference<input value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className="h-12 rounded-xl border border-zinc-200 px-3.5 outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Transaction ID" /></label></div> : null}
          {target.resource === 'submission' && !existingPayment ? <CreatePayment submission={target.item} selection={adminPayoutSelection} onCreated={onSaved} /> : null}
          {target.resource === 'submission' && existingPayment ? <button className="mt-5 flex w-full items-center justify-between rounded-2xl border border-zinc-200 p-4 text-left" onClick={() => onOpenChange(false)}><span><span className="block text-sm font-semibold">Payment scheduled</span><span className="mt-1 block text-xs text-zinc-500">{formatMoney(existingPayment.amountCents, existingPayment.currency)} · {statusLabel(existingPayment.status)}</span></span><CircleDollarSign className="size-5 text-zinc-400" /></button> : null}
          <div className="mt-7 flex justify-end gap-2"><Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>{canReview ? <Button className="rounded-xl" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{saving ? 'Saving…' : 'Save review'}</Button> : null}</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AdminSubmissionEvidence({ submission }: { submission: AdminSubmission }) {
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  if (submission.analyticsScreenshotUrl && submission.analyticsContentType?.startsWith('video/')) {
    return <div className="bg-zinc-950 p-4"><video src={submission.analyticsScreenshotUrl} controls playsInline preload="metadata" className="max-h-[600px] w-full" /><p className="mt-3 text-xs leading-5 text-white/70">Verify this is one continuous physical recording filmed with a second device. The screen, account username, post, views, traffic sources, and audience locations must be readable.</p></div>
  }
  if (submission.analyticsScreenshotUrl) {
    return <>
      <button type="button" className="group relative block aspect-video w-full overflow-hidden rounded-t-[27px] bg-zinc-950" onClick={() => { setZoom(1); setOpen(true) }} aria-label="Zoom analytics screenshot">
        <Image src={submission.analyticsScreenshotUrl} alt="Submitted video analytics screenshot" fill unoptimized className="object-contain" sizes="672px" />
        <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/75 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition-transform duration-150 ease-out group-active:scale-[0.97]"><ZoomIn className="size-3.5" />Zoom screenshot</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col overflow-hidden rounded-[28px] border-zinc-200 bg-zinc-950 p-0 text-white sm:max-w-[96vw]">
          <DialogHeader className="flex-row items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-left">
            <div><DialogTitle className="text-base text-white">Analytics screenshot</DialogTitle><DialogDescription className="mt-1 text-xs text-white/50">Zoom in to verify views and audience details.</DialogDescription></div>
            <div className="mr-8 flex items-center gap-1 rounded-xl bg-white/10 p-1">
              <button type="button" className="grid size-9 place-items-center rounded-lg text-white/70 transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96]" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} aria-label="Zoom out"><ZoomOut className="size-4" /></button>
              <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" className="grid size-9 place-items-center rounded-lg text-white/70 transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96]" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} aria-label="Zoom in"><ZoomIn className="size-4" /></button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <Image src={submission.analyticsScreenshotUrl} alt="Submitted video analytics screenshot enlarged" width={2000} height={2000} unoptimized className="mx-auto h-auto max-w-none rounded-xl object-contain shadow-2xl" style={{ width: `${zoom * 100}%` }} />
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-xs text-white/45"><span>Use the controls to inspect fine print.</span><a href={submission.analyticsScreenshotUrl} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/30 underline-offset-4">Open original</a></div>
        </DialogContent>
      </Dialog>
    </>
  }
  return null
}

function SubmissionRequirementsReview({
  items,
  onChange,
}: {
  items: ReturnType<typeof mergeCreatorSubmissionReviewResults>
  onChange: (items: ReturnType<typeof mergeCreatorSubmissionReviewResults>) => void
}) {
  const metCount = items.filter((item) => item.met).length
  return <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Creator-guide requirements</p><p className="mt-1 text-xs leading-5 text-zinc-500">Check every item the video satisfied. Unchecked items and explanations are returned to the creator.</p></div><span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-zinc-600">{metCount}/{items.length}</span></div>
    <Link href="/creator/guide#video-requirements" target="_blank" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-black">Open video requirements <ArrowUpRight className="size-3.5" /></Link>
    <div className="mt-4 grid gap-2">
      {items.map((item, index) => <div key={item.id} className={cn('rounded-xl border p-3 transition-[border-color,background-color] duration-150 ease-out', item.met ? 'border-emerald-200 bg-emerald-50/70' : 'border-zinc-200 bg-zinc-50')}>
        <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-emerald-600" checked={item.met} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, met: event.target.checked } : current))} /><span><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[11px] leading-5 text-zinc-500">{item.detail}</span></span></label>
        {!item.met ? <textarea value={item.note || ''} maxLength={500} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, note: event.target.value } : current))} className="mt-3 min-h-16 w-full resize-y rounded-lg border border-zinc-200 bg-white p-2.5 text-xs leading-5 outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Optional: explain why this item did not receive full marks" /> : null}
      </div>)}
    </div>
  </section>
}

function AttributionEditor({ submission, metrics, onSaved }: { submission: AdminSubmission; metrics?: AdminAttributionMetrics; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState({ qualifiedViews: metrics?.qualifiedViews || 0, linkClicks: metrics?.linkClicks || 0, installs: metrics?.installs || 0, firstTimePaidCustomers: metrics?.firstTimePaidCustomers || 0 })
  const [postedAt, setPostedAt] = useState(metrics?.postedAt?.slice(0, 10) || '')
  const [saving, setSaving] = useState(false)
  async function saveMetrics() {
    if (values.linkClicks > values.qualifiedViews) return toast.error('Link clicks cannot exceed qualified views')
    if (values.installs > values.linkClicks) return toast.error('Installs cannot exceed link clicks')
    if (values.firstTimePaidCustomers > values.installs) return toast.error('Paid customers cannot exceed installs')
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/metrics', { submissionId: submission.id, ...values, postedAt: postedAt ? new Date(`${postedAt}T00:00:00Z`).toISOString() : null })
      toast.success('Attribution metrics updated')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update attribution metrics')
    } finally {
      setSaving(false)
    }
  }
  return <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Performance & attribution</p><p className="mt-1 text-xs leading-5 text-zinc-500">Cumulative metrics for this video, entered by an admin. Use unique attributable events and first-time paying customers only.</p></div><Button variant="outline" className="h-9 rounded-xl bg-white" onClick={() => void saveMetrics()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? 'Saving…' : 'Save metrics'}</Button></div><label className="mt-4 grid gap-2 text-xs font-medium text-zinc-600">Video posted on<input type="date" value={postedAt} onChange={(event) => setPostedAt(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 sm:w-48" /></label><p className="mt-3 text-xs text-zinc-500">{postedAt ? `Cumulative attribution since ${formatDate(`${postedAt}T00:00:00Z`)}.` : 'Enter the posting date to identify the attribution period.'} Submitted {formatDate(submission.createdAt)}{metrics ? ` · Metrics updated ${formatDate(metrics.updatedAt)}` : ' · No attribution metrics recorded yet'}.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricInput label="Qualified views" value={values.qualifiedViews} onChange={(qualifiedViews) => setValues((current) => ({ ...current, qualifiedViews }))} /><MetricInput label="Link clicks" value={values.linkClicks} onChange={(linkClicks) => setValues((current) => ({ ...current, linkClicks }))} /><MetricInput label="Installs" value={values.installs} onChange={(installs) => setValues((current) => ({ ...current, installs }))} /><MetricInput label="First-time paid" value={values.firstTimePaidCustomers} onChange={(firstTimePaidCustomers) => setValues((current) => ({ ...current, firstTimePaidCustomers }))} /></div></div>
}

function MetricInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="grid gap-1.5"><span className="text-[11px] font-medium text-zinc-500">{label}</span><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))} className="h-10 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></label> }

type AdminPayoutSelection = {
  viewCountThreshold: number
  usAudiencePercent: number | null
}

function AdminPayoutDecision({
  submission,
  selection,
  onViewCountChange,
  onAudienceChange,
}: {
  submission: AdminSubmission
  selection: AdminPayoutSelection
  onViewCountChange: (value: string) => void
  onAudienceChange: (value: string) => void
}) {
  const estimate = getSubmissionPayoutEstimate(selection)
  return <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Final payout decision</p><p className="mt-1 text-xs leading-5 text-zinc-500">Verify the analytics evidence, then choose the values that determine what the creator receives.</p></div>{estimate ? <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Final payment</p><p className="mt-1 text-2xl font-semibold tracking-[-0.045em]">{formatMoney(estimate.payout * 100, 'USD')}</p></div> : null}</div>
    <div className="mt-4 rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Creator submitted</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600"><span><strong className="font-semibold text-zinc-900">{submission.viewCountThreshold ? formatViewCount(submission.viewCountThreshold) : 'Not recorded'}</strong> views</span><span><strong className="font-semibold text-zinc-900">{submission.usAudiencePercent !== null ? `${submission.usAudiencePercent}% Tier 1` : '20%+ combined Tier-1'}</strong> audience</span></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-xs font-semibold text-zinc-700">Admin-approved views<Select value={selection.viewCountThreshold ? String(selection.viewCountThreshold) : undefined} onValueChange={onViewCountChange}><SelectTrigger aria-label="Admin-approved view count"><SelectValue placeholder="Choose final views" /></SelectTrigger><SelectContent>{CREATOR_VIEW_THRESHOLDS.map((threshold) => <SelectItem key={threshold.views} value={String(threshold.views)}>{threshold.label} views</SelectItem>)}</SelectContent></Select></label>
      <label className="grid gap-2 text-xs font-semibold text-zinc-700">Admin-approved audience<Select value={selection.usAudiencePercent === null ? 'base' : String(selection.usAudiencePercent)} onValueChange={onAudienceChange}><SelectTrigger aria-label="Admin-approved audience"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">20%+ combined Tier-1 · base</SelectItem>{CREATOR_TIER1_AUDIENCE_TIERS.map((percentage) => <SelectItem key={percentage} value={String(percentage)}>{percentage === 40 ? '40%+ Tier 1' : `${percentage}% Tier 1`}</SelectItem>)}</SelectContent></Select></label>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-zinc-500">These admin-approved values override the creator’s selection for payment.{estimate?.isCapped ? ' The $325 payout cap is applied.' : ''}</p>
  </section>
}

function CreatePayment({ submission, selection, onCreated }: { submission: AdminSubmission; selection: AdminPayoutSelection; onCreated: () => Promise<void> }) {
  const estimate = getSubmissionPayoutEstimate(selection)
  const [creating, setCreating] = useState(false)
  async function create() {
    if (!estimate) return toast.error('Choose the final payout values')
    setCreating(true)
    try {
      await apiPost('/api/admin/creator/payments', {
        submissionId: submission.id,
        adminViewCountThreshold: selection.viewCountThreshold,
        adminUsAudiencePercent: selection.usAudiencePercent,
        status: 'pending',
      })
      toast.success('Payment created')
      await onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create payment')
    } finally {
      setCreating(false)
    }
  }
  return <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">Create payment</p><p className="mt-1 text-xs leading-5 text-zinc-500">The amount is locked to the admin-approved calculator result.</p></div><p className="text-2xl font-semibold tracking-[-0.045em]">{estimate ? formatMoney(estimate.payout * 100, 'USD') : '—'}</p></div>{estimate ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-zinc-500">{formatViewCount(selection.viewCountThreshold)} approved views · {selection.usAudiencePercent !== null ? `${selection.usAudiencePercent}% Tier 1 audience` : '20%+ combined Tier-1 base rate'}{estimate.isCapped ? ' · payout cap applied' : ''}</p> : <p className="mt-3 text-xs text-amber-700">Choose the final views and audience tier above before creating payment.</p>}<Button variant="outline" className="mt-4 h-10 w-full rounded-xl bg-white" onClick={() => void create()} disabled={creating || !estimate}>{creating ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}{creating ? 'Creating…' : 'Schedule calculated payment'}</Button></div>
}

function AccountAudienceEvidence({ account }: { account: AdminAccount }) {
  const [playbackFailed, setPlaybackFailed] = useState(false)
  return <section className="mt-6 min-w-0 rounded-2xl border border-zinc-200 p-4 sm:p-5" aria-label="Audience verification recording">
    <h3 className="text-base font-semibold">Audience verification recording</h3>
    <p className="mt-1 text-sm leading-6 text-zinc-500">Review the past 28 days of audience analytics and top countries before approving this account.</p>
    {account.analyticsVideoUrl ? <>
      <video key={account.analyticsVideoUrl} className="mt-4 block max-h-[55dvh] w-full min-w-0 rounded-xl bg-black object-contain" src={account.analyticsVideoUrl} controls playsInline preload="metadata" onError={() => setPlaybackFailed(true)} aria-label="Uploaded audience analytics recording" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <a href={account.analyticsVideoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-4">Open recording<ArrowUpRight className="size-4" /></a>
        {account.analyticsSizeBytes ? <span className="text-zinc-500">{formatBytes(account.analyticsSizeBytes)}</span> : null}
      </div>
      {playbackFailed ? <p role="alert" className="mt-2 text-sm text-amber-700">The recording could not play here. Open it in a new tab to view or download it. If it is unavailable, request a new upload.</p> : null}
      {!account.analyticsConfirmedAt ? <p className="mt-2 text-sm text-amber-700">The creator has not confirmed the required analytics period. Request completed verification before approval.</p> : null}
    </> : <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">No audience recording uploaded</p>
      <p className="mt-1 leading-6">Connecting a social account does not submit its audience evidence. Set the review to Missing information and ask the creator to upload their 28-day audience recording from Accounts → Verify account.</p>
    </div>}
  </section>
}

function SubmissionVideo({ submission }: { submission: AdminSubmission }) {
  const embedUrl = publishedVideoEmbedUrl(submission.postUrl)
  return <section className="mt-6 overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/40">
    <div className="p-4"><h3 className="text-base font-semibold">Published video</h3><p className="mt-1 text-xs text-zinc-500">{capitalize(submission.platform)} · Submitted {formatDate(submission.createdAt)}</p></div>
    {submission.videoUrl ? <video src={submission.videoUrl} controls playsInline preload="metadata" className="max-h-[55dvh] w-full bg-black" aria-label="Submitted video" /> : embedUrl ? <iframe src={embedUrl} title="Published submission video" className="h-[520px] max-h-[65dvh] w-full border-0 bg-white" allow="fullscreen" allowFullScreen /> : <p className="px-4 pb-3 text-sm text-zinc-500">Open the published post to watch this video.</p>}
    {submission.postUrl ? <a href={submission.postUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 p-4 text-sm font-medium text-violet-700 underline underline-offset-4"><span className="[overflow-wrap:anywhere]">{submission.postUrl}</span><ArrowUpRight className="size-4 shrink-0" /></a> : <p className="p-4 text-sm text-zinc-500">Published post URL not provided.</p>}
    {embedUrl && !submission.videoUrl ? <p className="px-4 pb-4 text-xs text-zinc-500">If the platform blocks playback, open the post above.</p> : null}
  </section>
}

function PayoutAccountDetails({ creator }: { creator: AdminCreator }) {
  const crypto = creator.paymentOption === 'crypto'
  const destination = crypto ? creator.cryptoWalletAddress : creator.paypalEmail
  const explorer = crypto ? walletExplorerUrl(creator.cryptoNetwork, creator.cryptoWalletAddress) : null
  return <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
    <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="size-6" /></span><div><h3 className="text-lg font-semibold">{crypto ? 'Crypto wallet' : 'PayPal account'}</h3><p className="mt-1 text-xs text-zinc-500">Payout destination for {creator.displayName}</p></div></div>
    <Details rows={[['Method', crypto ? 'Crypto' : 'PayPal'], ...(crypto ? [['Network', creator.cryptoNetwork || 'Not provided'] as [string, string]] : []), [crypto ? 'Wallet address' : 'PayPal email', destination || 'Not provided']]} />
    {explorer ? <a href={explorer} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 underline underline-offset-4">View wallet on {creator.cryptoNetwork}<ArrowUpRight className="size-4" /></a> : crypto ? <p className="mt-4 text-sm text-zinc-500">{creator.cryptoNetwork ? 'No supported block explorer for this network.' : 'Choose a network before reviewing this wallet.'}</p> : <div className="mt-4"><a href={creator.paypalMeUrl || 'https://www.paypal.com/myaccount/transfer/homepage'} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 underline underline-offset-4">{creator.paypalMeUrl ? 'View PayPal account' : 'Open PayPal'}<ArrowUpRight className="size-4" /></a>{!creator.paypalMeUrl ? <p className="text-xs leading-5 text-zinc-500">Use the email above to find the recipient. Ask the creator to add their PayPal.Me link for direct profile access.</p> : null}</div>}
  </section>
}

function ReviewDetails({ target }: { target: ReviewTarget }) {
  if (target.resource === 'creator') return <>{hasPayoutDestination(target.item) ? <PayoutAccountDetails creator={target.item} /> : <p className="mt-6 text-sm text-zinc-500">No payment method submitted. Creator registration does not require approval.</p>}<Details rows={[["Creator", target.item.displayName], ['Email', target.item.email], ['Primary contact', target.item.primaryContact || 'Not provided']]} /></>
  if (target.resource === 'account') return <>
    <Details rows={[
      ['Creator', target.item.creatorName],
      ['Platform', capitalize(target.item.platform)],
      ['Username', target.item.displayName || target.item.handle || 'Not provided'],
      ['Handle', target.item.handle ? `@${target.item.handle.replace(/^@/, '')}` : 'Not provided'],
      ['Connection', target.item.connectionMethod === 'oauth' ? 'OAuth connected' : 'Manual'],
      ['Analytics window', target.item.analyticsPeriodDays ? `Past ${target.item.analyticsPeriodDays} days` : 'Not provided'],
      ['Profile', accountProfileUrl(target.item) || 'Not provided'],
    ]} links={accountProfileUrl(target.item) ? { 6: accountProfileUrl(target.item)! } : undefined} />
    <h3 className="mt-6 text-base font-semibold">Account metrics</h3>
    <CreatorAttributionReport report={target.item.attribution} accountCount={1} />
    <p className="mt-2 text-xs text-zinc-500">Follower counts and platform audience metrics are available in the recording below.</p>
    <AccountAudienceEvidence account={target.item} />
  </>
  if (target.resource === 'submission') {
    return <Details rows={[
      ['Creator', target.item.creatorName],
      ['Account', target.item.socialHandle ? `@${target.item.socialHandle}` : 'Not connected'],
      ['Account eligibility', target.item.socialAccountStatus === 'approved' ? 'Approved' : 'Not connected to an approved account'],
      ['Creator-submitted views', target.item.viewCountThreshold ? `${formatViewCount(target.item.viewCountThreshold)} views` : 'Not recorded'],
      ['Creator-submitted audience', target.item.usAudiencePercent !== null ? `${target.item.usAudiencePercent}% Tier 1` : '20%+ combined Tier-1'],
      ['Requirements', target.item.requirementsConfirmedAt ? `Confirmed ${formatDate(target.item.requirementsConfirmedAt)}` : 'Not recorded'],
    ]} />
  }
  return <Details rows={[['Creator', target.item.creatorName], ['Submission', target.item.submissionTitle || 'Manual payment'], ['Method', target.item.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'], ['Reference', target.item.providerReference || 'Not provided']]} />
}

function Details({ rows, links }: { rows: Array<[string, string]>; links?: Record<number, string> }) {
  return <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm">{rows.map(([label, value], index) => <div key={label} className="flex min-w-0 items-start justify-between gap-4"><span className="shrink-0 text-zinc-500">{label}</span>{links?.[index] ? <Link className="flex min-w-0 items-center gap-1 text-right font-medium [overflow-wrap:anywhere] underline decoration-zinc-300 underline-offset-4" href={links[index]} target="_blank" rel="noopener noreferrer">{value} <ArrowUpRight className="size-3.5" /></Link> : <span className="min-w-0 max-w-[65%] text-right font-medium [overflow-wrap:anywhere]">{value}</span>}</div>)}</div>
}

function StatusPill({ status }: { status: string }) {
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', (status === 'approved' || status === 'verified' || status === 'paid') && 'bg-emerald-50 text-emerald-700', (status === 'pending' || status === 'in_review' || status === 'processing') && 'bg-amber-50 text-amber-700', (status === 'rejected' || status === 'failed' || status === 'suspended' || status === 'cancelled' || status === 'missing_information' || status === 'needs_verification') && 'bg-red-50 text-red-700')}>{statusLabel(status)}</span>
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="grid min-h-64 place-items-center rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100"><ShieldCheck className="size-5" /></span><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 text-sm text-zinc-500">{description}</p></div></div> }
function CenteredLoader() { return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> }
function reviewTitle(target: ReviewTarget) { return target.resource === 'creator' ? target.item.displayName : target.resource === 'account' ? creatorAccountLabel(target.item) : target.resource === 'submission' ? target.item.title : formatMoney(target.item.amountCents, target.item.currency) }
function reviewSubtitle(target: ReviewTarget) { return target.resource === 'creator' ? target.item.email : target.item.creatorEmail }
function statusOptions(resource: ReviewTarget['resource']) { return resource === 'creator' ? ['pending', 'verified', 'suspended'] : resource === 'account' ? ['pending', 'approved', 'missing_information'] : resource === 'submission' ? ['pending', 'in_review', 'approved', 'rejected', 'paid'] : ['pending', 'processing', 'paid', 'failed', 'cancelled'] }
function statusLabel(status: string) { return status.split('_').map(capitalize).join(' ') }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatViewCount(views: number) { return views === 1_000_000 ? '+1M' : new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(views) }
function getSubmissionPayoutEstimate(selection: AdminPayoutSelection) {
  if (!selection.viewCountThreshold || !CREATOR_VIEW_THRESHOLDS.some((item) => item.views === selection.viewCountThreshold)) return null
  return calculateCreatorPayout(selection.viewCountThreshold, true, selection.usAudiencePercent)
}

function normalizeAdminDashboard(data: AdminDashboard): AdminDashboard {
  return {
    ...data,
    creators: data.creators.map((creator) => ({ ...creator, accountCount: creator.accountCount || 0, attribution: normalizeAttributionReport(creator.attribution) })),
    accounts: data.accounts.map((account) => ({ ...account, attribution: normalizeAttributionReport(account.attribution) })),
    attributionMetrics: data.attributionMetrics || [],
    settings: data.settings || {
      id: 'default',
      monthlySubscriptionCents: 999,
      ninetyDayContributionMarginCents: 0,
      updatedAt: new Date(0).toISOString(),
    },
    rules: data.rules || {
      compensationCapRate: 0.35,
      conversionBonusCapRate: 0.25,
    },
  }
}

function normalizeAttributionReport(report?: Partial<AdminAttributionReport>): AdminAttributionReport {
  return {
    clicks: report?.clicks || 0,
    uniqueClicks: report?.uniqueClicks || 0,
    botClicks: report?.botClicks || 0,
    signups: report?.signups || 0,
    installs: report?.installs || 0,
    paywallViews: report?.paywallViews || 0,
    checkouts: report?.checkouts || 0,
    purchases: report?.purchases || 0,
    paidCustomers: report?.paidCustomers || 0,
    refunds: report?.refunds || 0,
    disputes: report?.disputes || 0,
    grossRevenueCents: report?.grossRevenueCents || 0,
    reversedRevenueCents: report?.reversedRevenueCents || 0,
    revenueCents: report?.revenueCents || 0,
    firstTouchSignups: report?.firstTouchSignups || 0,
    firstTouchPaywallViews: report?.firstTouchPaywallViews || 0,
    firstTouchPaidCustomers: report?.firstTouchPaidCustomers || 0,
    firstTouchRevenueCents: report?.firstTouchRevenueCents || 0,
    recentClicks: report?.recentClicks || 0,
    recentSignups: report?.recentSignups || 0,
    recentInstalls: report?.recentInstalls || 0,
    recentPaywallViews: report?.recentPaywallViews || 0,
    recentPaidCustomers: report?.recentPaidCustomers || 0,
    recentRevenueCents: report?.recentRevenueCents || 0,
  }
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getAuthSession(req, res)
  if (!isCreatorAdminEmail(session?.user?.email)) return { notFound: true }
  return { props: { session } }
}
