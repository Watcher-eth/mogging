import { useMemo, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import {
  BadgeCheck,
  CalendarClock,
  Clipboard,
  Infinity,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Ticket,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost, apiRequest, ApiClientError } from '@/lib/api/client'
import type { InviteCodeDashboardItem } from '@/lib/payments/invite-codes'
import type { InviteCodeKind } from '@/lib/db/schema'

type InviteSession = {
  configured: boolean
  unlocked: boolean
}

type InviteCodesResponse = {
  inviteCodes: InviteCodeDashboardItem[]
}

type CreatedInviteCodeResponse = {
  code: string
  inviteCode: InviteCodeDashboardItem
}

type ScopeMode = 'one' | 'credits' | 'unlimited' | 'timed'
type DurationPreset = '1' | '7' | '30' | 'custom'

export default function InviteAdminPage() {
  const { data: session, isLoading: sessionLoading, mutate: mutateSession } = useSWR<InviteSession>('/api/admin/invites/session', apiGet)
  const { data, isLoading, mutate } = useSWR<InviteCodesResponse>(session?.unlocked ? '/api/admin/invites' : null, apiGet, { refreshInterval: 20_000 })

  if (sessionLoading) return <CenteredLoader />
  if (!session?.configured) return <UnavailableState />
  if (!session.unlocked) return <InviteAdminGate onUnlocked={() => void mutateSession()} />

  async function lock() {
    await apiRequest('/api/admin/invites/session', { method: 'DELETE' })
    await mutateSession()
  }

  return (
    <main className="creator-enter mx-auto w-full max-w-6xl px-1 pb-12">
      <header className="mb-7 flex flex-col gap-5 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            <ShieldCheck className="size-3.5" />
            Private admin
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Invite codes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            Create scoped paywall unlock codes for creators, testers, referrals, and one-off grants. Codes redeem inside the mobile paywall through the existing Use Code flow.
          </p>
        </div>
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void lock()}>
          <LogOut className="size-4" />
          Lock dashboard
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
        <CreateInviteCodePanel onCreated={async () => { await mutate() }} />
        <section className="min-w-0 rounded-[28px] border border-zinc-200 bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Recent codes</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em]">Active grants</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600">{data?.inviteCodes.length ?? 0} total</span>
          </div>
          {isLoading || !data ? <CenteredLoader compact /> : <InviteCodeTable items={data.inviteCodes} />}
        </section>
      </div>
    </main>
  )
}

function InviteAdminGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function unlock(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await apiPost('/api/admin/invites/session', { code })
      setCode('')
      onUnlocked()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not unlock invite admin')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto grid min-h-[65vh] max-w-md place-items-center">
      <form onSubmit={unlock} className="w-full rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-black text-white"><LockKeyhole className="size-5" /></span>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Admin verification</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Unlock invites</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">Enter the invite admin code. Access locks automatically after eight hours.</p>
        <label className="mt-7 grid gap-2 text-sm font-medium">
          Admin code
          <input
            autoFocus
            required
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-12 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100"
            placeholder="Enter admin code"
          />
        </label>
        <Button className="mt-5 h-12 w-full rounded-xl" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck className="size-4" />}
          {submitting ? 'Verifying...' : 'Unlock dashboard'}
        </Button>
      </form>
    </section>
  )
}

function CreateInviteCodePanel({ onCreated }: { onCreated: () => Promise<void> }) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<InviteCodeKind>('invite')
  const [attribution, setAttribution] = useState('')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('one')
  const [credits, setCredits] = useState(3)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('7')
  const [customDuration, setCustomDuration] = useState(14)
  const [maxRedemptions, setMaxRedemptions] = useState(1)
  const [multiUse, setMultiUse] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)

  const scope = useMemo(() => {
    if (scopeMode === 'one') return { evaluationCredits: 1 }
    if (scopeMode === 'credits') return { evaluationCredits: credits }
    if (scopeMode === 'unlimited') return { unlimitedEvaluations: true, durationDays: null }
    return { unlimitedEvaluations: true, durationDays: durationPreset === 'custom' ? customDuration : Number(durationPreset) }
  }, [credits, customDuration, durationPreset, scopeMode])

  async function createCode(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setCreatedCode(null)
    try {
      const result = await apiPost<CreatedInviteCodeResponse>('/api/admin/invites', {
        label,
        kind,
        attribution: attribution || null,
        scope,
        maxRedemptions: multiUse ? maxRedemptions : 1,
      })
      setCreatedCode(result.code)
      setLabel('')
      toast.success('Invite code created')
      await onCreated()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create invite code')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Create code</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em]">New grant</h2>
      </div>
      <form onSubmit={createCode} className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Label
          <input required value={label} onChange={(event) => setLabel(event.target.value)} className={inputClassName} placeholder="Creator seed batch, VIP test, Alex referral" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <SegmentButton active={kind === 'invite'} icon={Ticket} label="Invite" onClick={() => setKind('invite')} />
          <SegmentButton active={kind === 'referral'} icon={UserPlus} label="Referral" onClick={() => setKind('referral')} />
        </div>

        <label className="grid gap-2 text-sm font-medium">
          Attribution
          <input value={attribution} onChange={(event) => setAttribution(event.target.value)} className={inputClassName} placeholder="@creator, campaign, friend name" />
        </label>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Scope</p>
          <div className="grid grid-cols-2 gap-2">
            <SegmentButton active={scopeMode === 'one'} icon={BadgeCheck} label="1 eval" onClick={() => setScopeMode('one')} />
            <SegmentButton active={scopeMode === 'credits'} icon={KeyRound} label="X evals" onClick={() => setScopeMode('credits')} />
            <SegmentButton active={scopeMode === 'timed'} icon={CalendarClock} label="Timed" onClick={() => setScopeMode('timed')} />
            <SegmentButton active={scopeMode === 'unlimited'} icon={Infinity} label="Unlimited" onClick={() => setScopeMode('unlimited')} />
          </div>
        </div>

        {scopeMode === 'credits' ? (
          <label className="grid gap-2 text-sm font-medium">
            Evaluation credits
            <input type="number" min={1} max={500} value={credits} onChange={(event) => setCredits(Number(event.target.value))} className={inputClassName} />
          </label>
        ) : null}

        {scopeMode === 'timed' ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Access length</p>
            <select value={durationPreset} onChange={(event) => setDurationPreset(event.target.value as DurationPreset)} className={inputClassName}>
              <option value="1">1 day</option>
              <option value="7">1 week</option>
              <option value="30">1 month</option>
              <option value="custom">Custom days</option>
            </select>
            {durationPreset === 'custom' ? <input type="number" min={1} max={3650} value={customDuration} onChange={(event) => setCustomDuration(Number(event.target.value))} className={inputClassName} /> : null}
          </div>
        ) : null}

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium">
          Multi-use code
          <input type="checkbox" checked={multiUse} onChange={(event) => setMultiUse(event.target.checked)} className="size-5 accent-black" />
        </label>

        {multiUse ? (
          <label className="grid gap-2 text-sm font-medium">
            Max redemptions
            <input type="number" min={1} max={100000} value={maxRedemptions} onChange={(event) => setMaxRedemptions(Number(event.target.value))} className={inputClassName} />
          </label>
        ) : null}

        <Button className="h-12 rounded-xl" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <KeyRound className="size-4" />}
          {submitting ? 'Creating...' : 'Create code'}
        </Button>
      </form>

      {createdCode ? <CreatedCode code={createdCode} /> : null}
    </section>
  )
}

function CreatedCode({ code }: { code: string }) {
  async function copy() {
    await navigator.clipboard.writeText(code)
    toast.success('Code copied')
  }

  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Ready to send</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <code className="font-mono text-3xl font-semibold tracking-[0.08em]">{code}</code>
        <button onClick={() => void copy()} className="grid size-10 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm transition-transform duration-150 ease-out active:scale-[0.96]">
          <Clipboard className="size-4" />
        </button>
      </div>
    </div>
  )
}

function InviteCodeTable({ items }: { items: InviteCodeDashboardItem[] }) {
  if (!items.length) return <EmptyState />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Scope</th>
            <th className="px-3 py-2">Attribution</th>
            <th className="px-3 py-2">Usage</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="rounded-2xl bg-zinc-50 text-sm">
              <td className="rounded-l-2xl px-3 py-3">
                <div className="font-semibold">{item.label}</div>
                <div className="mt-1 font-mono text-xs text-zinc-500">••{item.codeLast4} · {item.kind}</div>
              </td>
              <td className="px-3 py-3 text-zinc-700">{formatScope(item.scope)}</td>
              <td className="px-3 py-3 text-zinc-500">{item.attribution || 'None'}</td>
              <td className="px-3 py-3">
                <span className="font-semibold">{item.redemptionCount}</span>
                <span className="text-zinc-400"> / {item.maxRedemptions ?? '∞'}</span>
              </td>
              <td className="rounded-r-2xl px-3 py-3 text-zinc-500">{formatDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SegmentButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Ticket; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-[background-color,color,transform,border-color] duration-150 ease-out active:scale-[0.97] ${active ? 'border-black bg-black text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white hover:text-black'}`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function CenteredLoader({ compact = false }: { compact?: boolean }) {
  return <div className={`grid place-items-center ${compact ? 'min-h-48' : 'min-h-[65vh]'}`}><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
}

function EmptyState() {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-center">
      <div>
        <KeyRound className="mx-auto size-6 text-zinc-300" />
        <p className="mt-3 text-sm font-semibold">No invite codes yet</p>
        <p className="mt-1 text-xs text-zinc-400">Create one and it will appear here.</p>
      </div>
    </div>
  )
}

function UnavailableState() {
  return (
    <section className="mx-auto grid min-h-[65vh] max-w-md place-items-center text-center">
      <div className="rounded-[28px] border border-zinc-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <LockKeyhole className="mx-auto size-7 text-zinc-400" />
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.045em]">Invite admin is not configured</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">Set `INVITE_ADMIN_CODE` or `CREATOR_ADMIN_PASSWORD` on the server to enable this dashboard.</p>
      </div>
    </section>
  )
}

function formatScope(scope: InviteCodeDashboardItem['scope']) {
  if (scope.unlimitedEvaluations) {
    return scope.durationDays ? `Unlimited for ${scope.durationDays} ${scope.durationDays === 1 ? 'day' : 'days'}` : 'Unlimited evaluations'
  }
  return `${scope.evaluationCredits || 1} ${(scope.evaluationCredits || 1) === 1 ? 'evaluation' : 'evaluations'}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

const inputClassName = 'h-11 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100'
