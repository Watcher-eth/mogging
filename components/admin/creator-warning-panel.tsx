import { useState, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AdminCreator } from './creator-types'
import { apiPatch, apiPost, ApiClientError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'

const warningDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export function CreatorWarningPanel({ creator, onRefresh }: { creator: AdminCreator; onRefresh: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const warnings = creator.warnings || []
  const active = warnings.filter(warning => !warning.resolvedAt)
  const resolved = warnings.filter(warning => warning.resolvedAt)

  async function addWarning(event: FormEvent) {
    event.preventDefault()
    const body = note.trim()
    if (body.length < 3) return toast.error('Describe the internal warning')
    setSaving(true)
    try {
      await apiPost('/api/admin/creator/warnings', { creatorProfileId: creator.id, note: body })
      setNote('')
      toast.success('Internal warning added')
      await onRefresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add warning')
    } finally {
      setSaving(false)
    }
  }

  async function resolveWarning(id: string) {
    setResolvingId(id)
    try {
      await apiPatch('/api/admin/creator/warnings', { id })
      toast.success('Warning resolved')
      await onRefresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not resolve warning')
    } finally {
      setResolvingId(null)
    }
  }

  return <section aria-label="Internal creator warnings" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><AlertTriangle className="size-4" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-amber-950">Internal creator warnings</h3>{active.length ? <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{active.length} active</span> : null}</div><p className="mt-1 text-xs leading-5 text-amber-900/70">Admin only. The creator cannot see these warnings.</p></div>
    </div>
    {active.length ? <ul className="mt-4 grid gap-2">{active.map(warning => <li key={warning.id} className="rounded-xl border border-amber-200 bg-white p-3"><p className="whitespace-pre-wrap text-sm leading-5 text-zinc-800">{warning.note}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-zinc-400">Added {warningDate(warning.createdAt)} by {warning.createdByEmail}</span><button type="button" onClick={() => void resolveWarning(warning.id)} disabled={resolvingId !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-emerald-700 transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-50">{resolvingId === warning.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}Resolve</button></div></li>)}</ul> : <p className="mt-4 rounded-xl border border-amber-100 bg-white/80 px-3 py-2.5 text-xs text-zinc-500">No active warnings for this creator.</p>}
    <form className="mt-4 grid gap-2" onSubmit={addWarning}><label className="text-xs font-semibold text-amber-950" htmlFor={`creator-warning-${creator.id}`}>Add an internal warning</label><textarea id={`creator-warning-${creator.id}`} value={note} onChange={event => setNote(event.target.value.slice(0, 1000))} maxLength={1000} className="creator-field min-h-20 resize-y bg-white py-3 text-sm font-normal" placeholder="Example: Analytics evidence appears fabricated; verify future submissions carefully." /><div className="flex justify-end"><Button type="submit" variant="outline" className="rounded-full border-amber-300 bg-white text-amber-950" disabled={saving || note.trim().length < 3}>{saving ? <Loader2 className="animate-spin" /> : <AlertTriangle />}Add warning</Button></div></form>
    {resolved.length ? <details className="mt-3 border-t border-amber-200 pt-3"><summary className="cursor-pointer text-xs font-medium text-amber-900">Resolved warning history ({resolved.length})</summary><ul className="mt-2 grid gap-2">{resolved.map(warning => <li key={warning.id} className="rounded-lg bg-white/70 p-3 text-xs text-zinc-500"><p className="whitespace-pre-wrap leading-5">{warning.note}</p><p className="mt-1 text-[11px] text-zinc-400">Resolved {warning.resolvedAt ? warningDate(warning.resolvedAt) : ''}{warning.resolvedByEmail ? ` by ${warning.resolvedByEmail}` : ''}</p></li>)}</ul></details> : null}
  </section>
}
