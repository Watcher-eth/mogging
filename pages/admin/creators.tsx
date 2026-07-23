import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  FileVideo,
  Gauge,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { CreatorCtaLibraryItem } from '@/lib/creator/cta-library'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiGet, apiPatch, apiPost, apiRequest, ApiClientError } from '@/lib/api/client'
import { getAuthSession } from '@/lib/auth/session'
import { isCreatorAdminEmail } from '@/lib/admin/creator-auth'
import { cn } from '@/lib/utils'
import { CreatorEconomicsDashboard } from '@/components/admin/creator-economics-dashboard'
import { AccountAttributionReport, CreatorAttributionDashboard, CreatorAttributionReport } from '@/components/admin/creator-attribution-dashboard'
import { AccountTrackingLink } from '@/components/creator/account-tracking-link'
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
  { value: 'submissions', label: 'Videos', icon: FileVideo },
  { value: 'cta-library', label: 'CTA Library', icon: BookOpen },
  { value: 'accounts', label: 'Accounts', icon: BadgeCheck },
  { value: 'payments', label: 'Payments', icon: CircleDollarSign },
  { value: 'creators', label: 'Registrations', icon: UsersRound },
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
          <p className="mt-3 text-sm text-zinc-500">Review registrations, social accounts, videos, and payouts from one place.</p>
        </div>
        <div className="flex items-center gap-2"><span className="hidden text-xs text-zinc-400 sm:block">{access.email}</span><Button variant="outline" className="h-10 rounded-xl" onClick={() => void lockDashboard()}><LogOut />Lock dashboard</Button></div>
      </header>

      <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
        {tabs.map((item) => {
          const Icon = item.icon
          return <button key={item.value} onClick={() => setTab(item.value)} className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-100 hover:text-black active:scale-[0.98] sm:text-sm', tab === item.value && 'bg-black text-white hover:bg-black hover:text-white')}><Icon className="size-4" />{item.label}</button>
        })}
      </nav>

      {isLoading || !dashboard ? <CenteredLoader /> : <DashboardView tab={tab} data={dashboard} onSelect={setSelected} onRefresh={async () => { await mutate() }} />}
      {selected ? <ReviewDialog key={`${selected.resource}-${selected.item.id}`} target={selected} payments={dashboard?.payments || []} metrics={dashboard?.attributionMetrics || []} open onOpenChange={(open) => { if (!open) setSelected(null) }} onRefresh={async () => { await mutate() }} onSaved={async () => { await mutate(); setSelected(null) }} /> : null}
    </div>
  )
}

function AdminPasswordGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function unlock(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await apiPost('/api/admin/creator/session', { password })
      setPassword('')
      onUnlocked()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not unlock the admin dashboard')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto grid min-h-[65vh] max-w-md place-items-center">
      <form onSubmit={unlock} className="w-full rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-black text-white"><LockKeyhole className="size-5" /></span>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Admin verification</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Unlock creator admin</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">Enter the separate admin password. Access automatically locks after eight hours.</p>
        <label className="mt-7 grid gap-2 text-sm font-medium">Admin password<input autoFocus required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Enter your admin password" /></label>
        <Button className="mt-5 h-12 w-full rounded-xl" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{submitting ? 'Verifying…' : 'Unlock dashboard'}</Button>
      </form>
    </section>
  )
}

function DashboardView({ tab, data, onSelect, onRefresh }: { tab: Tab; data: AdminDashboard; onSelect: (target: ReviewTarget) => void; onRefresh: () => Promise<void> }) {
  if (tab === 'metrics') return <CreatorEconomicsDashboard data={data} onSelectSubmission={(item) => onSelect({ resource: 'submission', item })} onRefresh={onRefresh} />
  if (tab === 'attribution') return <CreatorAttributionDashboard data={data} onSelectCreator={(item) => onSelect({ resource: 'creator', item })} onSelectAccount={(item) => onSelect({ resource: 'account', item })} />
  if (tab === 'submissions') return <ResourceSection eyebrow="Content review" title="Video submissions" description="Inspect uploaded content, published posts, and review notes."><SubmissionList items={data.submissions} payments={data.payments} onSelect={onSelect} /></ResourceSection>
  if (tab === 'cta-library') return <CtaLibraryAdminPanel />
  if (tab === 'accounts') return <ResourceSection eyebrow="Account review" title="Social accounts" description="Approve connected TikTok and Instagram identities or request missing information."><AccountList items={data.accounts} onSelect={onSelect} /></ResourceSection>
  if (tab === 'payments') return <ResourceSection eyebrow="Money movement" title="Creator payments" description="Track scheduled, processing, completed, and failed payouts."><PaymentList items={data.payments} onSelect={onSelect} /></ResourceSection>
  if (tab === 'creators') return <ResourceSection eyebrow="Creator access" title="Registrations" description="Review creator identities and their selected payout destinations."><CreatorList items={data.creators} onSelect={onSelect} /></ResourceSection>
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
  const attention = useMemo(() => [
    ...data.submissions.filter((item) => item.status === 'pending').map((item) => ({ resource: 'submission' as const, item })),
    ...data.accounts.filter((item) => item.status === 'pending').map((item) => ({ resource: 'account' as const, item })),
    ...data.creators.filter((item) => item.authStatus === 'pending').map((item) => ({ resource: 'creator' as const, item })),
  ].slice(0, 8), [data])
  const outstandingCents = data.payments.filter((payment) => payment.status === 'pending' || payment.status === 'processing').reduce((total, payment) => total + payment.amountCents, 0)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Creators" value={data.creators.length} detail={`${data.creators.filter((item) => item.authStatus === 'pending').length} pending`} icon={UsersRound} />
        <Metric label="Videos" value={data.submissions.length} detail={`${data.submissions.filter((item) => item.status === 'pending').length} awaiting review`} icon={FileVideo} />
        <Metric label="Accounts" value={data.accounts.length} detail={`${data.accounts.filter((item) => item.status === 'pending').length} awaiting review`} icon={BadgeCheck} />
        <Metric label="Outstanding" value={formatMoney(outstandingCents, 'USD')} detail={`${data.payments.filter((item) => item.status === 'pending' || item.status === 'processing').length} payments`} icon={CircleDollarSign} />
      </div>
      <section className="mt-7">
        <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Priority queue</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Needs your attention</h2></div>
        {attention.length ? <div className="grid gap-3">{attention.map((target) => <QueueRow key={`${target.resource}-${target.item.id}`} target={target} onClick={() => onSelect(target)} />)}</div> : <EmptyState title="You’re all caught up" description="New registrations, accounts, and videos will appear here." />}
      </section>
    </>
  )
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof UsersRound }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">{label}</p><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span></div><p className="mt-5 text-3xl font-semibold tracking-[-0.055em]">{value}</p><p className="mt-1 text-xs text-zinc-400">{detail}</p></div>
}

function ResourceSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section><header className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">{title}</h2><p className="mt-3 text-sm text-zinc-500">{description}</p></header>{children}</section>
}

function SubmissionList({ items, payments, onSelect }: { items: AdminSubmission[]; payments: AdminPayment[]; onSelect: (target: ReviewTarget) => void }) {
  const paymentIds = new Set(payments.map((payment) => payment.submissionId))
  if (!items.length) return <EmptyState title="No video submissions" description="Creator uploads will appear here." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} icon={FileVideo} title={item.title} subtitle={`${item.creatorName} · ${item.socialHandle ? `@${item.socialHandle}` : 'No connected account'} · ${formatDate(item.createdAt)}${item.socialAccountStatus !== 'approved' ? ' · Account not approved' : ''}`} status={item.status} meta={paymentIds.has(item.id) ? 'Payment created' : 'No payment'} onClick={() => onSelect({ resource: 'submission', item })} />)}</div>
}

function AccountList({ items, onSelect }: { items: AdminAccount[]; onSelect: (target: ReviewTarget) => void }) {
  if (!items.length) return <EmptyState title="No connected accounts" description="TikTok and Instagram account requests will appear here." />
  return <div className="grid gap-3">{items.map((item) => <AccountRow key={item.id} item={item} onClick={() => onSelect({ resource: 'account', item })} />)}</div>
}

function AccountRow({ item, onClick }: { item: AdminAccount; onClick: () => void }) {
  return <article className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><button onClick={onClick} className="group flex w-full items-center gap-4 rounded-xl p-1 text-left transition-transform duration-150 ease-out active:scale-[0.995]"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><BadgeCheck className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">@{item.handle}</span><span className="mt-1 block truncate text-xs text-zinc-500">{item.creatorName} · {capitalize(item.platform)} · {formatDate(item.createdAt)}</span></span><span className="hidden max-w-48 truncate text-xs text-zinc-400 md:block">{item.creatorEmail}</span><StatusPill status={item.analyticsConfirmedAt ? item.status : 'needs_verification'} /><ArrowUpRight className="size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" /></button><AccountTrackingLink url={item.trackingLinkUrl} className="mt-3" /></article>
}

function PaymentList({ items, onSelect }: { items: AdminPayment[]; onSelect: (target: ReviewTarget) => void }) {
  if (!items.length) return <EmptyState title="No payments created" description="Create a payment while reviewing an approved video." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} icon={CircleDollarSign} title={formatMoney(item.amountCents, item.currency)} subtitle={`${item.creatorName} · ${item.submissionTitle || 'Manual payment'} · ${formatDate(item.createdAt)}`} status={item.status} meta={item.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'} onClick={() => onSelect({ resource: 'payment', item })} />)}</div>
}

function CreatorList({ items, onSelect }: { items: AdminCreator[]; onSelect: (target: ReviewTarget) => void }) {
  if (!items.length) return <EmptyState title="No creator registrations" description="Creator profiles will appear here after registration." />
  return <div className="grid gap-3">{items.map((item) => <ResourceRow key={item.id} icon={UserRound} title={item.displayName} subtitle={`${item.email} · Joined ${formatDate(item.createdAt)}`} status={item.authStatus} meta={item.paymentOption === 'paypal' ? 'PayPal' : item.cryptoNetwork || 'Crypto'} onClick={() => onSelect({ resource: 'creator', item })} />)}</div>
}

function ResourceRow({ icon: Icon, title, subtitle, status, meta, onClick }: { icon: typeof FileVideo; title: string; subtitle: string; status: string; meta: string; onClick: () => void }) {
  return <button onClick={onClick} className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)] active:scale-[0.995]"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">{title}</span><span className="mt-1 block truncate text-xs text-zinc-500">{subtitle}</span></span><span className="hidden max-w-48 truncate text-xs text-zinc-400 md:block">{meta}</span><StatusPill status={status} /><ArrowUpRight className="size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" /></button>
}

function QueueRow({ target, onClick }: { target: Exclude<ReviewTarget, { resource: 'payment' }>; onClick: () => void }) {
  const title = target.resource === 'submission' ? target.item.title : target.resource === 'account' ? `@${target.item.handle}` : target.item.displayName
  const subtitle = target.resource === 'creator' ? target.item.email : `${target.item.creatorName} · ${target.resource === 'submission' ? `Video submission${target.item.socialAccountStatus !== 'approved' ? ' · Account not approved' : ''}` : `${capitalize(target.item.platform)} account`}`
  const Icon = target.resource === 'submission' ? FileVideo : target.resource === 'account' ? BadgeCheck : UserRound
  return <ResourceRow icon={Icon} title={title} subtitle={subtitle} status="pending" meta={formatDate(target.item.createdAt)} onClick={onClick} />
}

function ReviewDialog({ target, payments, metrics, open, onOpenChange, onRefresh, onSaved }: { target: ReviewTarget; payments: AdminPayment[]; metrics: AdminAttributionMetrics[]; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => Promise<void>; onSaved: () => Promise<void> }) {
  const initialStatus = target.resource === 'creator' ? target.item.authStatus : target.item.status
  const [status, setStatus] = useState(initialStatus)
  const [reviewNote, setReviewNote] = useState(target.resource === 'account' || target.resource === 'submission' ? target.item.reviewNote || '' : '')
  const [amount, setAmount] = useState(target.resource === 'payment' ? (target.item.amountCents / 100).toFixed(2) : '')
  const [providerReference, setProviderReference] = useState(target.resource === 'payment' ? target.item.providerReference || '' : '')
  const [saving, setSaving] = useState(false)
  const existingPayment = target.resource === 'submission' ? payments.find((payment) => payment.submissionId === target.item.id) : undefined

  async function save() {
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/review', {
        resource: target.resource,
        id: target.item.id,
        status,
        ...(target.resource === 'account' || target.resource === 'submission' ? { reviewNote: reviewNote || null } : null),
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0">
        {target.resource === 'submission' ? <AdminSubmissionEvidence submission={target.item} /> : null}
        <div className="p-5 sm:p-7">
          <DialogHeader>
            <div className="flex items-center gap-2"><StatusPill status={initialStatus} /><span className="text-xs text-zinc-400">{formatDate(target.item.createdAt)}</span></div>
            <DialogTitle className="pt-2 text-2xl">{reviewTitle(target)}</DialogTitle>
            <DialogDescription>{reviewSubtitle(target)}</DialogDescription>
          </DialogHeader>
          <ReviewDetails target={target} />
          {target.resource === 'submission' ? <AttributionEditor submission={target.item} metrics={metrics.find((item) => item.submissionId === target.item.id)} onSaved={onRefresh} /> : null}
          <div className="mt-6 grid gap-2">
            <span className="text-sm font-medium">Review status</span>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions(target.resource).map((option) => <SelectItem key={option} value={option}>{statusLabel(option)}</SelectItem>)}</SelectContent></Select>
          </div>
          {target.resource === 'account' || target.resource === 'submission' ? <label className="mt-5 grid gap-2 text-sm font-medium">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value.slice(0, 1000))} className="min-h-24 resize-y rounded-xl border border-zinc-200 p-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Visible to the creator" /></label> : null}
          {target.resource === 'payment' ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Amount (USD)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12 rounded-xl border border-zinc-200 px-3.5 outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></label><label className="grid gap-2 text-sm font-medium">Provider reference<input value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className="h-12 rounded-xl border border-zinc-200 px-3.5 outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Transaction ID" /></label></div> : null}
          {target.resource === 'submission' && !existingPayment ? <CreatePayment submission={target.item} onCreated={onSaved} /> : null}
          {target.resource === 'submission' && existingPayment ? <button className="mt-5 flex w-full items-center justify-between rounded-2xl border border-zinc-200 p-4 text-left" onClick={() => onOpenChange(false)}><span><span className="block text-sm font-semibold">Payment scheduled</span><span className="mt-1 block text-xs text-zinc-500">{formatMoney(existingPayment.amountCents, existingPayment.currency)} · {statusLabel(existingPayment.status)}</span></span><CircleDollarSign className="size-5 text-zinc-400" /></button> : null}
          <div className="mt-7 flex justify-end gap-2"><Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="rounded-xl" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{saving ? 'Saving…' : 'Save review'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AdminSubmissionEvidence({ submission }: { submission: AdminSubmission }) {
  if (submission.analyticsScreenshotUrl) {
    return <div role="img" aria-label="Submitted video analytics screenshot" className="aspect-video rounded-t-[27px] bg-zinc-950 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(submission.analyticsScreenshotUrl)})` }} />
  }
  if (submission.videoUrl) return <div className="aspect-video overflow-hidden rounded-t-[27px] bg-black"><video className="size-full object-contain" src={submission.videoUrl} controls preload="metadata" /></div>
  return null
}

function AttributionEditor({ submission, metrics, onSaved }: { submission: AdminSubmission; metrics?: AdminAttributionMetrics; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState({ qualifiedViews: metrics?.qualifiedViews || 0, linkClicks: metrics?.linkClicks || 0, installs: metrics?.installs || 0, firstTimePaidCustomers: metrics?.firstTimePaidCustomers || 0 })
  const [saving, setSaving] = useState(false)
  async function saveMetrics() {
    if (values.linkClicks > values.qualifiedViews) return toast.error('Link clicks cannot exceed qualified views')
    if (values.installs > values.linkClicks) return toast.error('Installs cannot exceed link clicks')
    if (values.firstTimePaidCustomers > values.installs) return toast.error('Paid customers cannot exceed installs')
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/metrics', { submissionId: submission.id, ...values })
      toast.success('Attribution metrics updated')
      await onSaved()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update attribution metrics')
    } finally {
      setSaving(false)
    }
  }
  return <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Performance & attribution</p><p className="mt-1 text-xs leading-5 text-zinc-500">Use unique attributable events and first-time paying customers only.</p></div><Button variant="outline" className="h-9 rounded-xl bg-white" onClick={() => void saveMetrics()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? 'Saving…' : 'Save metrics'}</Button></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricInput label="Qualified views" value={values.qualifiedViews} onChange={(qualifiedViews) => setValues((current) => ({ ...current, qualifiedViews }))} /><MetricInput label="Link clicks" value={values.linkClicks} onChange={(linkClicks) => setValues((current) => ({ ...current, linkClicks }))} /><MetricInput label="Installs" value={values.installs} onChange={(installs) => setValues((current) => ({ ...current, installs }))} /><MetricInput label="First-time paid" value={values.firstTimePaidCustomers} onChange={(firstTimePaidCustomers) => setValues((current) => ({ ...current, firstTimePaidCustomers }))} /></div></div>
}

function MetricInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="grid gap-1.5"><span className="text-[11px] font-medium text-zinc-500">{label}</span><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))} className="h-10 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></label> }

function CreatePayment({ submission, onCreated }: { submission: AdminSubmission; onCreated: () => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  async function create() {
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) return toast.error('Enter a payout amount')
    setCreating(true)
    try {
      await apiPost('/api/admin/creator/payments', { submissionId: submission.id, amountCents, status: 'pending' })
      toast.success('Payment created')
      await onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create payment')
    } finally {
      setCreating(false)
    }
  }
  return <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-sm font-semibold">Create payment</p><p className="mt-1 text-xs leading-5 text-zinc-500">Schedule a payout using the creator’s saved payment method.</p><div className="mt-4 flex gap-2"><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" placeholder="Amount in USD" /><Button variant="outline" className="h-10 rounded-xl bg-white" onClick={() => void create()} disabled={creating}>{creating ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}Schedule</Button></div></div>
}

function ReviewDetails({ target }: { target: ReviewTarget }) {
  if (target.resource === 'creator') return <><CreatorAttributionReport report={target.item.attribution} accountCount={target.item.accountCount} /><Details rows={[['Primary contact', target.item.primaryContact || 'Not provided'], ['Payout method', target.item.paymentOption === 'paypal' ? 'PayPal' : target.item.cryptoNetwork || 'Crypto'], ['Payout destination', target.item.paymentOption === 'paypal' ? target.item.paypalEmail || 'Not provided' : target.item.cryptoWalletAddress || 'Not provided']]} /></>
  if (target.resource === 'account') return <>{target.item.analyticsVideoUrl ? <div className="mt-6 overflow-hidden rounded-2xl bg-black"><div className="flex items-center justify-between bg-zinc-900 px-4 py-2.5 text-xs text-white"><span className="font-medium">28-day analytics recording</span><span className="text-white/50">{target.item.analyticsSizeBytes ? formatBytes(target.item.analyticsSizeBytes) : null}</span></div><video className="aspect-video w-full object-contain" src={target.item.analyticsVideoUrl} controls preload="metadata" /></div> : null}<AccountTrackingLink url={target.item.trackingLinkUrl} className="mt-6" /><AccountAttributionReport report={target.item.attribution} /><Details rows={[['Creator', target.item.creatorName], ['Platform', capitalize(target.item.platform)], ['Handle', `@${target.item.handle}`], ['Connection', target.item.connectionMethod === 'oauth' ? 'OAuth verified' : 'Manual'], ['Analytics window', target.item.analyticsPeriodDays ? `Past ${target.item.analyticsPeriodDays} days` : 'Not provided'], ['Recording size', target.item.analyticsSizeBytes ? formatBytes(target.item.analyticsSizeBytes) : 'Not provided'], ['Profile', target.item.profileUrl || 'Not provided']]} links={target.item.profileUrl ? { 6: target.item.profileUrl } : undefined} /></>
  if (target.resource === 'submission') {
    const evidenceSize = target.item.analyticsSizeBytes || target.item.videoSizeBytes
    return <Details rows={[['Creator', target.item.creatorName], ['Format', target.item.title], ['Requirements', target.item.requirementsConfirmedAt ? `Confirmed ${formatDate(target.item.requirementsConfirmedAt)}` : 'Not recorded'], ['Account', target.item.socialHandle ? `@${target.item.socialHandle}` : 'Not connected'], ['Account Eligibility', target.item.socialAccountStatus === 'approved' ? 'Approved' : 'Not connected to an approved account'], ['Evidence', target.item.analyticsScreenshotUrl ? 'Analytics screenshot' : target.item.videoUrl ? 'Legacy video' : 'Not provided'], ['Evidence Size', evidenceSize ? formatBytes(evidenceSize) : 'Not recorded'], ['View Count Threshold', target.item.viewCountThreshold ? `${formatViewCount(target.item.viewCountThreshold)} views` : 'Not recorded'], ['U.S. Audience', target.item.usAudiencePercent !== null ? `${target.item.usAudiencePercent}%` : 'Default 20% Tier 1 Audience'], ['Published Post', target.item.postUrl || 'Not provided']]} links={target.item.postUrl ? { 9: target.item.postUrl } : undefined} />
  }
  return <Details rows={[['Creator', target.item.creatorName], ['Submission', target.item.submissionTitle || 'Manual payment'], ['Method', target.item.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'], ['Reference', target.item.providerReference || 'Not provided']]} />
}

function Details({ rows, links }: { rows: Array<[string, string]>; links?: Record<number, string> }) {
  return <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm">{rows.map(([label, value], index) => <div key={label} className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span>{links?.[index] ? <Link className="flex min-w-0 items-center gap-1 truncate font-medium underline decoration-zinc-300 underline-offset-4" href={links[index]} target="_blank">Open <ArrowUpRight className="size-3.5" /></Link> : <span className="max-w-[65%] truncate text-right font-medium">{value}</span>}</div>)}</div>
}

function StatusPill({ status }: { status: string }) {
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', (status === 'approved' || status === 'verified' || status === 'paid') && 'bg-emerald-50 text-emerald-700', (status === 'pending' || status === 'in_review' || status === 'processing') && 'bg-amber-50 text-amber-700', (status === 'rejected' || status === 'failed' || status === 'suspended' || status === 'cancelled' || status === 'missing_information' || status === 'needs_verification') && 'bg-red-50 text-red-700')}>{statusLabel(status)}</span>
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="grid min-h-64 place-items-center rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100"><ShieldCheck className="size-5" /></span><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 text-sm text-zinc-500">{description}</p></div></div> }
function CenteredLoader() { return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> }
function reviewTitle(target: ReviewTarget) { return target.resource === 'creator' ? target.item.displayName : target.resource === 'account' ? `@${target.item.handle}` : target.resource === 'submission' ? target.item.title : formatMoney(target.item.amountCents, target.item.currency) }
function reviewSubtitle(target: ReviewTarget) { return target.resource === 'creator' ? target.item.email : target.item.creatorEmail }
function statusOptions(resource: ReviewTarget['resource']) { return resource === 'creator' ? ['pending', 'verified', 'suspended'] : resource === 'account' ? ['pending', 'approved', 'missing_information'] : resource === 'submission' ? ['pending', 'in_review', 'approved', 'rejected', 'paid'] : ['pending', 'processing', 'paid', 'failed', 'cancelled'] }
function statusLabel(status: string) { return status.split('_').map(capitalize).join(' ') }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatViewCount(views: number) { return views === 1_000_000 ? '+1M' : new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(views) }

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
