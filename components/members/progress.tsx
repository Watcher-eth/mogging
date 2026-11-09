import { trackWebEvent } from '@/lib/analytics/client'
import { ScoreDistribution } from '@/components/analysis/score-distribution'
import { ProgressSkinPortrait, type SkinPortrait } from '@/components/analysis/progress-skin-portrait'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import { Drawer } from 'vaul'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import type { ProgressEvaluation } from '@/lib/users/member-pages'

const areas = [
  ['overall', 'Overall', 'dial', '#ed982b'], ['symmetry', 'Symmetry', 'dial', '#8b70cb'], ['proportions', 'Proportions', 'ticks', '#32a580'],
  ['eyes', 'Eye area', 'line', '#4299bd'], ['brows', 'Brows', 'ticks', '#ed982b'], ['nose', 'Nose', 'ticks', '#83909d'],
  ['mouth', 'Lips', 'dial', '#d66c95'], ['jaw', 'Jawline', 'bars', '#32a580'], ['face', 'Face shape', 'dial', '#83909d'], ['cheeks', 'Cheeks', 'dial', '#da865f'],
  ['skin', 'Skin', 'bars', '#da865f'], ['hair', 'Hair', 'dial', '#8b70cb'], ['ears', 'Ears', 'ticks', '#32a580'],
] as const
type Point = { id: string; date: string; score: number }
type Visual = typeof areas[number][2]
const caption = 'text-sm font-medium text-zinc-500'
const ranges = [7, 30, 90, 'All'] as const
const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function ProgressPage({ evaluations, focusIds, skinPortrait, preview, gridOnly = false, mobile = false, onNewScan }: { evaluations: ProgressEvaluation[]; focusIds: string[]; skinPortrait?: SkinPortrait | null; preview?: boolean; gridOnly?: boolean; mobile?: boolean; onNewScan?: () => void }) {
  const [metric, setMetric] = useState<string | null>(null)
  const reduced = useReducedMotion()
  useEffect(() => { if (!preview) trackWebEvent('progress_viewed', { surface: 'scan_app', count: evaluations.length }) }, [preview, evaluations.length])
  const [expanded, setExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  function showMetric(id: string) { setMetric(id); setDrawerOpen(true) }
  const [range, setRange] = useState<typeof ranges[number]>('All')
  const [selected, setSelected] = useState<string>('overall')
  const detail = useRef<HTMLDivElement>(null)
  const ordered = [...evaluations].reverse()
  const latest = evaluations[0]
  const cutoff = range === 'All' ? -Infinity : Date.now() - range * 86_400_000
  const visible = ordered.filter(row => Date.parse(row.date) >= cutoff)
  const history = areas.flatMap(([id, title, visual, color]) => {
    const points = visible.flatMap(row => row.scores[id] === undefined ? [] : [{ id: row.id, date: row.date, score: row.scores[id] }])
    return points.length ? [{ id, title, visual, color, points }] : []
  })
  const active = history.find(area => area.id === selected) ?? history[0]

  if (mobile) {
    const newHref = `/analysis?start=1&from=app${preview ? '&preview=mobile&walkthrough=1' : ''}`
    const overall = evaluations.find(evaluation => evaluation.scores.overall !== undefined)
    const selectedArea = areas.find(([id]) => id === metric)
    const faceHistory = history.filter(area => area.id !== 'overall')
    return <section className="scan-progress">
      <header><h1>Progress</h1>{onNewScan ? <button type="button" onClick={onNewScan}><Plus size={18} /> New</button> : <Link href={newHref}><Plus size={18} /> New</Link>}</header>
      {latest ? <>
        {overall && <div className="scan-progress-overall">
          <div className="scan-progress-overall-heading">
            <div><h2>Overall</h2><span>Reference distribution</span></div>
            <button type="button" onClick={() => showMetric('overall')} aria-label="Overall progress"><ArrowUpRight size={19} aria-hidden="true" /></button>
          </div>
          <ScoreDistribution score={overall.scores.overall} potential={overall.potential} showSurvey />
          <div className="scan-progress-overall-values">
            <div data-reading="current"><span>Current</span><strong>{reduced ? overall.scores.overall.toFixed(1) : <TextMorph>{overall.scores.overall.toFixed(1)}</TextMorph>} <small>/ 10</small></strong></div>
            {overall.potential != null && <div data-reading="potential"><span>Potential</span><strong>{reduced ? overall.potential.toFixed(1) : <TextMorph>{overall.potential.toFixed(1)}</TextMorph>}</strong></div>}
          </div>
          <span className="scan-progress-latest">Overall reading · {dateLabel(overall.date)}</span>
        </div>}
        <h2>Your face</h2>
        <motion.div layout className="scan-progress-grid">{faceHistory.slice(0, expanded ? faceHistory.length : 6).map((area, index) =>
          <motion.button layout={!reduced} type="button" key={area.id} data-kind={['field','bars','trend','orbit','line','horizontal'][index % 6]} onClick={() => showMetric(area.id)}>
            <span>{area.title}<ArrowUpRight size={17} /></span>
            <strong>{reduced ? area.points.at(-1)!.score.toFixed(1) : <TextMorph>{area.points.at(-1)!.score.toFixed(1)}</TextMorph>} <small>/ 10</small></strong>
            {area.id === 'skin' && skinPortrait ? <ProgressSkinPortrait {...skinPortrait} /> : <ProgressCardArt position={index % 6} points={area.points} title={area.title} color={area.color} />}
            {index % 6 === 1 && <small className="scan-progress-card-foot">{area.points.length === 1 ? '1 scan · Baseline' : `${area.points.length} scans`}</small>}
          </motion.button>)}
        </motion.div>
        {faceHistory.length > 6 && <button className="scan-progress-expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show overview' : `Explore all ${faceHistory.length} areas`}</button>}
      </> : <p className="scan-progress-latest">Complete your first evaluation to establish a baseline.</p>}
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false} snapPoints={[0.56, 0.9]} fadeFromIndex={0}>
        <Drawer.Portal>
          <Drawer.Overlay className="scan-progress-backdrop" />
        {selectedArea && <MobileMetricSheet key={selectedArea[0]} area={selectedArea} points={ordered.flatMap(row => row.scores[selectedArea[0]] === undefined ? [] : [{ id: row.id, date: row.date, score: row.scores[selectedArea[0]] }])} />}
        </Drawer.Portal>
      </Drawer.Root>
    </section>
  }

  const grid = (
    <div aria-label={gridOnly ? 'Sample progress grid' : undefined} className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${gridOnly ? 'h-full auto-rows-fr' : 'mt-4'}`}>
      {(gridOnly ? history.slice(0, 7) : history).map(area => {
        const last = area.points.at(-1)!.score
        const change = area.points.length > 1 ? last - area.points[0].score : null
        const wide = ['overall', 'jaw', 'skin'].includes(area.id)
        const portrait = area.id === 'skin' ? skinPortrait : null
        const sideBySide = Boolean(portrait) || area.visual === 'dial'
        const Tile = gridOnly ? 'div' : 'button'
        return <Tile key={area.id} {...(gridOnly ? {} : { type: 'button' as const, 'aria-controls': 'progress-detail', 'aria-pressed': active?.id === area.id, onClick: () => {
          setSelected(area.id)
          if (detail.current && detail.current.getBoundingClientRect().top < 120) {
            detail.current.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
          }
        } })} className={`flex min-w-0 flex-col rounded-2xl p-3 text-left transition-colors ${gridOnly ? 'min-h-28 [&_svg]:max-h-12' : 'min-h-36 sm:p-4 hover:bg-[#eeeef1]'} ${wide ? 'col-span-2' : ''} ${active?.id === area.id ? 'bg-[#eeeef1]' : 'bg-[#f4f4f6]'}`}>
          <span className={`${caption} flex w-full items-start justify-between gap-1`}>{area.title}{!gridOnly && <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />}</span>
          <span className={`flex w-full flex-1 ${gridOnly ? 'mt-1 gap-1' : 'mt-3 gap-3'} ${sideBySide ? 'items-center justify-between' : 'flex-col justify-center'}`}>
            <span className={`font-normal tracking-[-0.05em] tabular-nums ${gridOnly ? 'text-2xl' : 'text-3xl'}`}>{last.toFixed(1)} <small className="text-[10px] tracking-normal text-zinc-500">/ 10</small></span>
            <span className={sideBySide ? 'ml-auto min-w-0 flex-1' : 'w-full'}>
              {portrait ? <ProgressSkinPortrait key={portrait.src} {...portrait} /> : <MetricVisual visual={area.visual} points={area.points} title={area.title} color={area.color} />}
            </span>
          </span>
          <span className={`text-[10px] text-zinc-500 ${gridOnly ? 'mt-1' : 'mt-3'}`}>{change === null ? 'First reading' : `${change > 0 ? '+' : ''}${change.toFixed(1)} pts`}{focusIds.includes(area.id === 'face' ? 'face-shape' : area.id) ? ' · Focus area' : ''}</span>
        </Tile>
      })}
    </div>
  )

  if (gridOnly) return grid

  return <section className="mx-auto max-w-[75rem] py-3 text-zinc-950 sm:py-7">
    <h1 className="sr-only">Progress</h1>
    <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Evaluation time range" className="inline-flex rounded-full bg-zinc-100 p-1">
          {ranges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)} className={`min-h-9 rounded-full px-3 text-xs transition-colors sm:px-4 ${range === value ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{value === 'All' ? value : `${value}D`}</button>)}
        </div>
      <Link href="/analysis?start=1" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-zinc-100 px-4 text-sm font-medium hover:bg-zinc-200"><Plus size={16} /> New evaluation</Link>
    </div>
    {latest ? <>
      {active ? <>
        <div ref={detail} id="progress-detail" className="mt-4 grid scroll-mt-32 gap-3 lg:grid-cols-5">
          <div className="min-w-0 py-4 lg:col-span-3">
            <div className="flex items-baseline justify-between gap-3"><h3 className={caption}>{active.title} over time</h3><span className={caption}>{active.points.length} {active.points.length === 1 ? 'evaluation' : 'evaluations'}</span></div>
            <p className="mt-4 text-5xl font-normal tracking-[-0.06em] tabular-nums">{active.points.at(-1)!.score.toFixed(1)} <small className="text-xs tracking-normal text-zinc-500">/ 10</small></p>
            <div className="mt-5 grid grid-cols-[1.2rem_minmax(0,1fr)] items-stretch gap-2">
              <div className="flex flex-col justify-between py-1 text-[10px] text-zinc-500" aria-hidden="true"><span>10</span><span>5</span><span>0</span></div>
              <Trend points={active.points} title={active.title} color={active.color} />
            </div>
            <div className="ml-7 mt-2 flex justify-between gap-2 text-[10px] text-zinc-500"><span>{dateLabel(active.points[0].date)}</span>{active.points.length > 1 && <span>{dateLabel(active.points.at(-1)!.date)}</span>}</div>
          </div>
          <div className="min-w-0 py-4 lg:col-span-2 lg:pl-8">
            <h3 className={caption}>Evaluation timeline</h3>
            <ol className="mt-4 max-h-56 overflow-auto">
              {[...active.points].reverse().map(point => {
                const entry = <><span>{dateLabel(point.date)}</span><span className="inline-flex items-center gap-2 tabular-nums">{point.score.toFixed(1)} {!preview && <ArrowUpRight size={14} />}</span></>
                const row = 'flex min-h-11 items-center justify-between gap-2 text-sm'
                return <li key={point.id} className="relative pl-4 before:absolute before:left-0 before:top-[19px] before:size-[5px] before:rounded-full before:bg-zinc-400">
                  {preview ? <div className={row}>{entry}</div> : <Link href={`/analysis?analysisId=${encodeURIComponent(point.id)}`} className={`${row} hover:underline`}>{entry}</Link>}
                </li>
              })}
            </ol>
          </div>
        </div>
        <h2 className="mt-7 text-xl font-semibold tracking-tight">Feature readings</h2>
        {grid}
      </> : <p className="mt-6 py-5 text-sm text-zinc-500">No evaluations in this timeframe.</p>}
      <p className="mt-6 pt-4 text-xs leading-5 text-zinc-500">Compare evaluations taken in similar lighting and at the same angle. Showing up to your latest 100 saved evaluations.</p>
    </> : <p className="mt-6 text-sm text-zinc-500">Complete your first evaluation to establish a baseline.</p>}
  </section>
}

function ProgressCardArt({ position, points, title, color }: { position: number; points: Point[]; title: string; color: string }) {
  const score = points.at(-1)!.score
  if (position === 1) return <MetricVisual visual={points.length === 1 ? 'ticks' : 'bars'} points={points} title={title} color={color} />
  if (position === 2 || position === 4) return <Trend points={points} title={title} color={color} compact />
  if (position === 5) return <MetricVisual visual="ticks" points={points} title={title} color={color} />

  const field = position === 0
  const center = field ? 104 : 80
  const angle = Math.PI + Math.PI * score / 10
  const x = field ? 39 + score * 8 : center + Math.cos(angle) * 64
  const y = field ? 29 : 83 + Math.sin(angle) * 64
  return <svg viewBox="0 0 160 89" className="scan-progress-field" aria-hidden="true">
    {[25, 43, 64].map(radius => field
      ? <circle key={radius} cx={center} cy="83" r={radius} fill="none" stroke="#e9e9c2" strokeOpacity=".34" />
      : <path key={radius} d={`M${center - radius} 83a${radius} ${radius} 0 0 1 ${radius * 2} 0`} fill="none" stroke={color} strokeOpacity=".38" />)}
    <path d={`M${center} 83L${x} ${y}`} stroke={color} strokeWidth="1.3" />
    <circle cx={center} cy="83" r="2" fill={color} /><circle cx={x} cy={y} r="4.5" fill={color} />
  </svg>
}

function MobileMetricSheet({ area: [, title, , color], points }: { area: typeof areas[number]; points: Point[] }) {
  const [range, setRange] = useState<typeof ranges[number]>('All')
  const [selection, setSelection] = useState<number | null>(null)
  const reduced = useReducedMotion()
  const visible = points.filter(point => range === 'All' || Date.parse(point.date) >= Date.now() - range * 86_400_000)
  const index = selection ?? visible.length - 1
  const point = visible[index]
  const first = Date.parse(visible[0]?.date ?? '')
  const last = Date.parse(visible.at(-1)?.date ?? '')
  const coords = visible.map(({ date, score }, i) => ({ x: visible.length === 1 ? 150 : 12 + 276 * (last === first ? i / (visible.length - 1) : (Date.parse(date) - first) / (last - first)), y: 160 - score * 14 }))
  const path = coords.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  const mark = coords[index]
  const change = point && visible.length > 1 ? point.score - visible[0].score : null
  return <Drawer.Content className="scan-progress-sheet" style={{ '--metric-color': color } as React.CSSProperties} aria-describedby={undefined}>
    <Drawer.Handle className="scan-progress-handle" />
    <div className="scan-progress-sheet-header"><Drawer.Title>{title}</Drawer.Title><Drawer.Close aria-label="Close progress"><X size={19} /></Drawer.Close></div>
    <div className="scan-progress-ranges" role="group" aria-label="Time range">{ranges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => { setRange(value); setSelection(null) }}>{value === 'All' ? 'All' : `${value}D`}</button>)}</div>
    <div className="scan-progress-reading"><strong>{reduced ? point?.score.toFixed(1) ?? '—' : <TextMorph>{point?.score.toFixed(1) ?? '—'}</TextMorph>} <small>/ 10</small></strong>{change !== null && <span>{change > 0 ? '+' : ''}{change.toFixed(1)} points</span>}</div>
    <p>{point ? dateLabel(point.date) : 'No evaluations in this timeframe'}</p>
    <p>{visible.length} {visible.length === 1 ? 'evaluation' : 'evaluations'}</p>
    <div className="scan-progress-chart" data-vaul-no-drag>
      <svg viewBox="0 0 300 180" aria-hidden="true" preserveAspectRatio="none">
        {[20, 90, 160].map(y => <path key={y} d={`M0 ${y}H300`} stroke="#ffffff23" />)}
        {coords.length > 1 && <motion.path d={path} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} key={range} />}
        {coords.map(({ x, y }, i) => <circle key={visible[i].id} cx={x} cy={y} r="2.5" fill={color} />)}
        {mark && <><path d={`M${mark.x} 20V160`} stroke={color} opacity=".4" /><circle cx={mark.x} cy={mark.y} r="5" fill="#11181e" stroke={color} strokeWidth="2.5" /></>}
      </svg>
      {visible.length > 1 && <input aria-label="Select evaluation on chart" type="range" min={0} max={visible.length - 1} value={index} onChange={event => setSelection(Number(event.target.value))} />}
    </div>
    <div className="scan-progress-dates" data-vaul-no-drag>{visible.map(({ id, date }, i) => {
      const day = new Date(date)
      return <button key={id} type="button" aria-pressed={index === i} onClick={() => setSelection(i)}><small>{day.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small>{day.getUTCDate()}</button>
    })}</div>
  </Drawer.Content>
}

function Trend({ points, title, color, compact = false }: { points: Point[]; title: string; color: string; compact?: boolean }) {
  const first = Date.parse(points[0].date), last = Date.parse(points.at(-1)!.date)
  const coords = points.map((point, index) => ({
    x: points.length === 1 ? 150 : 5 + 290 * (last === first ? index / (points.length - 1) : (Date.parse(point.date) - first) / (last - first)),
    y: 64 - 58 * point.score / 10,
  }))
  return <svg viewBox="0 0 300 70" preserveAspectRatio="none" className={`block w-full ${compact ? 'h-14' : 'h-32 sm:h-36'}`} role={compact ? undefined : 'img'} aria-hidden={compact || undefined} aria-label={compact ? undefined : `${title} over ${points.length} evaluations`}>
    {compact ? <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      : coords.map(({ x, y }, index) => <path key={index} d={`M${x} 64V${y}`} stroke={color} opacity={index === coords.length - 1 ? .75 : .3} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    {coords.map(({ x, y }, index) => (!compact || index === coords.length - 1) && <path key={index} d={`M${x} ${y}h.01`} stroke={index === coords.length - 1 ? color : '#83909d'} strokeWidth={index === coords.length - 1 ? 6 : 4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
  </svg>
}

function MetricVisual({ visual, points, title, color }: { visual: Visual; points: Point[]; title: string; color: string }) {
  if (visual === 'line') return <Trend points={points} title={title} color={color} compact />
  const score = points.at(-1)!.score
  if (visual === 'dial') return <svg viewBox="0 0 100 82" preserveAspectRatio="xMaxYMid meet" className="ml-auto block h-24 w-full" aria-hidden="true">
    {Array.from({ length: 41 }, (_, index) => <path key={index} d={`M50 7v${index % 5 === 0 ? 7 : 4}`} transform={`rotate(${-126 + index * 6.3} 50 43)`} stroke={index <= score * 4 ? '#343b43' : '#dce2e8'} strokeWidth="1.3" strokeLinecap="round" />)}
    <path d="M50 3v10" transform={`rotate(${-126 + score * 25.2} 50 43)`} stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
  if (visual === 'ticks') return <span aria-hidden="true" className="flex h-12 items-center gap-1">
    {Array.from({ length: 21 }, (_, index) => <span key={index} className={`min-w-0 flex-1 rounded-full ${index % 5 === 0 ? 'h-5' : 'h-3'} bg-zinc-300`} style={index === Math.round(score * 2) ? { backgroundColor: color } : undefined} />)}
  </span>
  return <span aria-hidden="true" className="flex h-14 items-end gap-1.5">
    {points.slice(-12).map((point, index, recent) => <span key={point.id} style={{ height: `${point.score * 10}%`, backgroundColor: color, opacity: index === recent.length - 1 ? 1 : .35 }} className="min-h-px min-w-0 flex-1 rounded-t-sm" />)}
  </span>
}
