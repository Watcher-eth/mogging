import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from '@/components/ui/mogging-glyphs'
import { apiPatch, ApiClientError } from '@/lib/api/client'
import { isReachViewCount, reachViewCategory, reachViewPercent, type ReachViewCounts } from '@/lib/admin/reach-views'
import { cn } from '@/lib/utils'

const ranges = {
  pureReach: { label: 'Pure reach', range: '90–100%', color: 'border-sky-200 bg-sky-50 text-sky-800' },
  sweetSpot: { label: 'Conversion sweet spot', range: '65–85%', description: 'Sweet spot for conversions', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  heavyLooping: { label: 'Heavy looping', range: 'Below 50%', description: 'Heavy looping and an entertainment trap', color: 'border-amber-200 bg-amber-50 text-amber-800' },
}

const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function ReachViewGuide() {
  return <aside aria-label="Reach / views ratio guide" className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3">
    <p className="text-xs font-semibold text-zinc-900">Reach / views ratio <span className="ml-1 font-normal text-zinc-500">Unique viewers ÷ total views</span></p>
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600">
      <li><strong className="text-sky-800">{ranges.pureReach.range}</strong> Low replays, pure reach</li>
      <li><strong className="text-emerald-800">{ranges.sweetSpot.range}</strong> {ranges.sweetSpot.description}</li>
      <li><strong className="text-amber-800">{ranges.heavyLooping.range}</strong> {ranges.heavyLooping.description}</li>
    </ul>
  </aside>
}

export function ReachViewTag({ counts }: { counts?: ReachViewCounts | null }) {
  const percent = reachViewPercent(counts?.reach, counts?.views)
  const category = percent === null ? null : reachViewCategory(percent)
  return <span className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold tabular-nums',
    category ? ranges[category].color : 'border-zinc-200 bg-zinc-50 text-zinc-600')}>
    {category === 'heavyLooping' ? <AlertTriangle aria-hidden="true" className="size-3 shrink-0" /> : null}
    {percent === null ? 'Reach / views unavailable' : <>
      Reach / views {counts?.approximate || counts?.unverified ? '≈' : ''}{percentFormat.format(percent)}%
      {category ? ` · ${ranges[category].label}` : ''}
    </>}
  </span>
}

function parseCount(input: string) {
  return /^\d+$/.test(input.trim()) ? Number(input) : null
}

export function SubmissionReachViews({ id, storageKey, counts, onSaved }: {
  id: string
  storageKey: string | null
  counts?: ReachViewCounts | null
  onSaved: () => Promise<void>
}) {
  const heading = useId()
  const [draft, setDraft] = useState<{ reach: string; views: string } | null>(null)
  const [savedCounts, setSavedCounts] = useState<ReachViewCounts | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const displayedCounts = savedCounts ?? counts
  const hasRatio = reachViewPercent(displayedCounts?.reach, displayedCounts?.views) !== null
  const defaults = {
    reach: isReachViewCount(displayedCounts?.reach) ? String(displayedCounts.reach) : '',
    views: isReachViewCount(displayedCounts?.views) && !displayedCounts.approximate ? String(displayedCounts.views) : '',
  }
  const fields = draft ?? defaults
  const reach = parseCount(fields.reach)
  const views = parseCount(fields.views)
  const percent = reachViewPercent(reach, views)
  const editing = draft !== null || !hasRatio

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (percent === null || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = await apiPatch<ReachViewCounts>(`/api/admin/creator/submissions/${encodeURIComponent(id)}/reach-views`, { reach, views, storageKey })
      setSavedCounts(saved)
      setDraft(null)
      await onSaved()
      setSavedCounts(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save reach and views. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <section aria-labelledby={heading} className="my-4 rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={heading} className="text-sm font-semibold">Reach / views ratio</h3>
      {editing ? <span role="status" className="text-sm font-semibold tabular-nums text-zinc-700">{percent === null ? 'Ratio —' : `Ratio ${percentFormat.format(percent)}%`}</span> : <ReachViewTag counts={displayedCounts} />}
    </div>
    {editing ? <form onSubmit={save} className="mt-3 grid gap-3">
      <p className="text-xs text-zinc-600">Enter the counts shown for the same video and reporting period.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Reach (Total Viewers)
          <input className="creator-field tabular-nums" type="text" inputMode="numeric" value={fields.reach} placeholder="e.g. 15,000" disabled={saving}
            onChange={event => setDraft({ ...fields, reach: event.target.value.replace(/,/g, '') })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Video views
          <input className="creator-field tabular-nums" type="text" inputMode="numeric" value={fields.views} placeholder="e.g. 20,000" disabled={saving}
            onChange={event => setDraft({ ...fields, views: event.target.value.replace(/,/g, '') })} />
        </label>
      </div>
      {fields.reach && fields.views && percent === null ? <p className="text-xs text-amber-800">Use whole counts up to 2 billion. Total views must be positive and at least as high as reach.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="submit" disabled={percent === null || saving}>{saving ? 'Saving…' : 'Save reach and views'}</Button>
        {hasRatio ? <Button size="sm" type="button" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError('') }}>Cancel</Button> : null}
      </div>
    </form> : <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs tabular-nums text-zinc-600">{displayedCounts?.reach?.toLocaleString()} unique viewers · {displayedCounts?.approximate ? '≈' : ''}{displayedCounts?.views?.toLocaleString()} views · {displayedCounts?.source === 'manual' ? 'Entered by admin' : displayedCounts?.unverified ? 'Unverified OCR' : 'OCR'}</p>
      {displayedCounts?.source === 'manual' ? <Button size="sm" type="button" variant="outline" onClick={() => setDraft(defaults)}>Edit counts</Button> : null}
    </div>}
    {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
  </section>
}
