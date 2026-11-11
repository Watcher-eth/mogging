import { useState, type FormEvent } from 'react'
import { useSWRConfig } from 'swr'
import { AlertTriangle, CheckCircle2, Loader2 } from '@/components/ui/mogging-glyphs'
import { toast } from 'sonner'
import type { AdminCreator } from './creator-types'
import { apiPatch, apiRequest, ApiClientError } from '@/lib/api/client'
import { CREATOR_WARNING_OPTIONS, creatorWarningOption, type CreatorWarningCategory } from '@/lib/admin/creator-score-policy'
import { CREATOR_SCORES_KEY } from './creator-score-detail'
import { Button } from '@/components/ui/button'

const warningDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export function CreatorWarningPanel({ creator, submissionId, onRefresh }: { creator: AdminCreator; submissionId?: string; onRefresh: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<CreatorWarningCategory[]>([])
  const { mutate } = useSWRConfig()
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const warnings = creator.warnings || []
  const active = warnings.filter(warning => !warning.resolvedAt)
  const resolved = warnings.filter(warning => warning.resolvedAt)
  const canSave = categories.length > 0 && (!categories.includes('other') || note.trim().length >= 3)
  async function refresh() {
    await Promise.all([onRefresh(), mutate(key => typeof key === 'string' && key.startsWith(CREATOR_SCORES_KEY))])
  }

  async function addWarning(event: FormEvent) {
    event.preventDefault()
    const body = note.trim()
    if (!canSave) return toast.error('Select a warning; describe any other concern')
    setSaving(true)
    try {
      await apiRequest('/api/admin/creator/warnings', { method: 'PUT', body: JSON.stringify({ creatorProfileId: creator.id, submissionId, categories, note: body }) })
      setNote('')
      setCategories([])
      toast.success('Warnings saved and score updated')
      await refresh()
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
      await refresh()
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
    {active.length ? <ul className="mt-4 grid gap-2">{active.map(warning => <li key={warning.id} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-amber-950">{creatorWarningOption(warning.category || 'other')?.label || 'Internal note'}</p><span className="shrink-0 text-xs font-semibold text-amber-900">{warning.penaltyPoints ? `−${warning.penaltyPoints} points` : 'Unscored note'}</span></div><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-zinc-800">{warning.note}</p><p className="mt-1 text-[11px] text-zinc-400">{warning.submissionId ? warning.submissionId === submissionId ? 'This submission' : 'Another submission' : 'Creator-wide'}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-zinc-400">Added {warningDate(warning.createdAt)} by {warning.createdByEmail}</span><button type="button" onClick={() => void resolveWarning(warning.id)} disabled={resolvingId !== null || saving} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-emerald-700 transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-50">{resolvingId === warning.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}Resolve</button></div></li>)}</ul> : <p className="mt-4 rounded-xl border border-amber-100 bg-white/80 px-3 py-2.5 text-xs text-zinc-500">No active warnings for this creator.</p>}
    <form className="mt-4 grid gap-3" onSubmit={addWarning}>
      <fieldset disabled={saving}><legend className="text-xs font-semibold text-amber-950">Check confirmed issues{ submissionId ? ' for this submission' : ' for this creator'}</legend><p className="mt-1 text-xs leading-5 text-amber-900/70">Selections are saved together. Only record verified findings; suspected fraud can be an unscored internal note.</p><div className="mt-3 grid gap-2">{CREATOR_WARNING_OPTIONS.map(option => {
        const exists = option.id !== 'other' && active.some(warning => warning.category === option.id && (warning.submissionId || null) === (submissionId || null))
        return <label key={option.id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 text-xs ${exists ? 'opacity-50' : ''}`}><input type="checkbox" checked={exists || categories.includes(option.id)} disabled={exists} onChange={event => setCategories(values => event.target.checked ? [...values, option.id] : values.filter(value => value !== option.id))} className="mt-0.5 size-4 shrink-0 accent-amber-700" /><span className="flex-1 leading-5">{option.label}{exists ? ' · Already active' : ''}</span><span className="shrink-0 leading-5 text-amber-900">{option.points ? `−${option.points}` : 'Note'}</span></label>
      })}</div></fieldset>
      <label className="text-xs font-semibold text-amber-950" htmlFor={`creator-warning-${creator.id}`}>Evidence or internal note {categories.includes('other') ? '(required)' : '(optional)'}</label><textarea id={`creator-warning-${creator.id}`} value={note} onChange={event => setNote(event.target.value.slice(0, 1000))} maxLength={1000} disabled={saving} className="creator-field min-h-20 resize-y bg-white py-3 text-sm font-normal" placeholder="Describe the evidence or add context for future reviews." />
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-amber-900">Selected deductions: −{categories.reduce((sum, category) => sum + (creatorWarningOption(category)?.points || 0), 0)} points</span><Button type="submit" variant="outline" className="rounded-full border-amber-300 bg-white text-amber-950" disabled={saving || !canSave}>{saving ? <Loader2 className="animate-spin" /> : <AlertTriangle />}Add warning{categories.length > 1 ? 's' : ''}</Button></div>
    </form>
    {resolved.length ? <details className="mt-3 border-t border-amber-200 pt-3"><summary className="cursor-pointer text-xs font-medium text-amber-900">Resolved warning history ({resolved.length})</summary><ul className="mt-2 grid gap-2">{resolved.map(warning => <li key={warning.id} className="rounded-lg bg-white/70 p-3 text-xs text-zinc-500"><p className="whitespace-pre-wrap leading-5">{warning.note}</p><p className="mt-1 text-[11px] text-zinc-400">Resolved {warning.resolvedAt ? warningDate(warning.resolvedAt) : ''}{warning.resolvedByEmail ? ` by ${warning.resolvedByEmail}` : ''}</p></li>)}</ul></details> : null}
  </section>
}
