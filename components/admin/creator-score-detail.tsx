import { useState } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CreatorScore, CreatorScoreRanking, CreatorScoreReport, ScoreHistoryEntry } from '@/lib/admin/creator-score-policy'

export const CREATOR_SCORES_KEY = '/api/admin/creator/scores'
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' PT'
const deltaLabel = (value: number) => `${value > 0 ? '+' : ''}${value}`

export function ScoreComponents({ score }: { score: CreatorScore }) {
  return <div className="grid gap-3">{score.components.map(component => <div key={component.id} className="rounded-xl border border-zinc-200 p-4">
    <div className="flex items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-zinc-900">{component.label}</span>{component.status !== 'measured' ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">{component.status === 'provisional' ? 'Placeholder' : 'No evidence'}</span> : null}</div><span className="shrink-0 text-sm font-semibold tabular-nums">{component.points}<span className="font-normal text-zinc-400"> / {component.maximum}</span></span></div>
    <div role="meter" aria-label={component.label} aria-valuenow={component.points} aria-valuemin={0} aria-valuemax={component.maximum} className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${component.status === 'measured' ? 'bg-sky-500' : 'bg-amber-300'}`} style={{ width: `${100 * component.points / component.maximum}%` }} /></div>
    <p className="mt-2 text-xs leading-5 text-zinc-500">{component.detail}</p>
  </div>)}
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><div className="flex justify-between text-sm font-semibold"><span>Active warning deductions</span><span>−{score.deductions}</span></div>{score.penalties.length ? <ul className="mt-2 grid gap-2">{score.penalties.map(penalty => <li key={penalty.id} className="flex justify-between gap-3 text-xs leading-5 text-amber-950"><span>{penalty.label}<span className="block text-amber-900/60">{penalty.submissionId ? 'Submission warning' : 'Creator warning'}</span></span><span className="shrink-0 tabular-nums">−{penalty.points}</span></li>)}</ul> : <p className="mt-2 text-xs text-zinc-500">No active warnings.</p>}<p className="mt-3 text-xs leading-5 text-zinc-500">Resolving a warning restores its points. Confirmed fraud also caps the total at 399. Scores cannot fall below zero.</p></div>
    <p className="text-xs text-zinc-500">{score.gross} component points − {score.deductions} warning points{score.penalties.some(p => p.category === 'confirmed_fraud') ? ', with fraud cap' : ''} = <strong className="text-zinc-800">{score.total} / 1,000</strong> · Formula v{score.version}</p>
  </div>
}

type HistoryPage = { entries: ScoreHistoryEntry[]; nextCursor: string | null }
function CreatorScoreHistory({ creatorId }: { creatorId: string }) {
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<HistoryPage>((index, previous: HistoryPage | null) => {
    if (index && !previous?.nextCursor) return null
    return `${CREATOR_SCORES_KEY}?creatorId=${encodeURIComponent(creatorId)}${index ? `&before=${encodeURIComponent(previous!.nextCursor!)}` : ''}`
  }, apiGet, { revalidateFirstPage: true, shouldRetryOnError: false })
  if (error) return <p role="alert" className="text-sm text-red-700">Could not load history. <button onClick={() => void mutate()} className="underline">Retry</button></p>
  if (!data) return <p role="status" className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" />Loading history…</p>
  const entries = data.flatMap(page => page.entries)
  return <div><p className="mb-4 text-xs leading-5 text-zinc-500">History starts when scoring is enabled. Each entry preserves the formula, component values and warnings at that time. Earlier score changes are not reconstructed.</p>{entries.length ? <ol className="grid gap-3">{entries.map(entry => <li key={entry.id} className="rounded-xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">{entry.reason}</p><p className="mt-1 text-xs text-zinc-500">{dateLabel(entry.createdAt)}{entry.actor ? ` · ${entry.actor}` : ' · Automatic'}</p></div><div className="shrink-0 text-right"><span className="text-lg font-semibold tabular-nums">{entry.score.total}</span><span className={`ml-2 text-xs font-medium ${entry.delta < 0 ? 'text-red-600' : entry.delta > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>{deltaLabel(entry.delta)}</span></div></div><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-sky-700">Point breakdown at this change</summary><div className="mt-3"><ScoreComponents score={entry.score} /></div></details></li>)}</ol> : <p className="text-sm text-zinc-500">No score snapshots yet.</p>}{data[data.length - 1]?.nextCursor ? <button type="button" disabled={isValidating} onClick={() => void setSize(size + 1)} className="mt-4 min-h-11 rounded-full border border-zinc-200 px-4 text-sm disabled:opacity-50">{isValidating ? 'Loading…' : 'Load earlier changes'}</button> : null}</div>
}

export function CreatorScoreDialog({ score, onClose }: { score: CreatorScoreRanking; onClose: () => void }) {
  const [tab, setTab] = useState<'components' | 'history'>('components')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-5 sm:p-7"><DialogHeader><DialogTitle>{score.name} · Creator Score</DialogTitle><DialogDescription>Admin only · {score.assessed ? 'Provisional estimate' : 'Unassessed baseline'} · Formula v{score.version}</DialogDescription></DialogHeader>
    <div className="mt-2 flex items-center justify-between rounded-2xl bg-sky-50 p-5"><div><p className="text-3xl font-semibold tabular-nums tracking-tight">{score.total}<span className="ml-1 text-base font-normal text-zinc-400">/ 1,000</span></p><p className="mt-1 text-xs text-zinc-500">{score.rank ? `Rank #${score.rank}` : 'Excluded from performance rankings'}</p></div><div className="text-right text-xs leading-6 text-zinc-500"><p>{score.metrics.approvedPosts} approved posts</p><p>${score.metrics.committedUsd.toFixed(2)} committed compensation</p></div></div>
    <p className="text-xs leading-5 text-amber-800">Conversion and profitability points are neutral placeholders while attribution is being set up. This score does not establish profitability.</p>
    <div role="tablist" aria-label="Creator score detail" className="flex gap-1 rounded-full bg-zinc-100 p-1">{(['components', 'history'] as const).map(value => <button type="button" key={value} role="tab" id={`score-tab-${value}`} aria-controls={`score-panel-${value}`} aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-10 flex-1 rounded-full text-sm font-medium ${tab === value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>{value === 'components' ? 'Point breakdown' : 'Score history'}</button>)}</div>
    <div role="tabpanel" id={`score-panel-${tab}`} aria-labelledby={`score-tab-${tab}`} className="mt-2">{tab === 'components' ? <ScoreComponents score={score} /> : <CreatorScoreHistory creatorId={score.creatorId} />}</div>
  </DialogContent></Dialog>
}

export function CreatorReviewScore({ creatorId }: { creatorId: string }) {
  const [open, setOpen] = useState(false)
  const { data, error, mutate } = useSWR<CreatorScoreReport>(CREATOR_SCORES_KEY, apiGet, { refreshInterval: 30_000, shouldRetryOnError: false })
  const score = data?.creators.find(creator => creator.creatorId === creatorId)
  if (error) return <button type="button" onClick={() => void mutate()} className="mt-3 text-xs text-red-700 underline">Score unavailable · retry</button>
  if (!score) return <p className="mt-3 text-xs text-zinc-400">Loading admin score…</p>
  return <><button type="button" onClick={() => setOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-left"><span className="text-xs font-medium text-sky-950">Creator Score <strong className="ml-1 tabular-nums">{score.total} / 1,000</strong><span className="ml-2 font-normal text-sky-900/60">{score.assessed ? 'Provisional' : 'Unassessed'} · Admin only</span></span><ArrowUpRight className="size-4 shrink-0 text-sky-600" /></button>{open ? <CreatorScoreDialog score={score} onClose={() => setOpen(false)} /> : null}</>
}
