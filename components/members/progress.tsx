import { FeatureInstrument } from './feature-instrument'
import { featureMeasurements, formatFeatureMeasurement } from '@/lib/analysis-v2/feature-history'
import { IndustrialHistory, historyTickPositions } from './industrial-history'
import { trackWebEvent } from '@/lib/analytics/client'
import { ScoreDistribution } from '@/components/analysis/score-distribution'
import { ProgressSkinPortrait, type SkinPortrait } from '@/components/analysis/progress-skin-portrait'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import { Drawer } from 'vaul'
import { MoggingIcon } from '@/components/ui/mogging-icon'
import { MobileScoreGauge } from './mobile-score-gauge'
import { formatProtocolDate, protocolTasks } from '@/lib/creator/protocol-tasks'
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

export default function ProgressPage({ evaluations, focusIds, skinPortrait, preview, gridOnly = false, desktop = true, onNewScan, userId }: { evaluations: ProgressEvaluation[]; focusIds: string[]; skinPortrait?: SkinPortrait | null; preview?: boolean; gridOnly?: boolean; desktop?: boolean; onNewScan?: () => void; userId?: string }) {
  const [metric, setMetric] = useState<string | null>(null)
  const reduced = useReducedMotion()
  useEffect(() => { if (!preview) trackWebEvent('progress_viewed', { surface: 'scan_app', count: evaluations.length }) }, [preview, evaluations.length])
  const [expanded, setExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  function showMetric(id: string) {
    navigator.vibrate?.(7)
    if (!preview) trackWebEvent('progress_area_viewed', { surface: 'scan_app', category: id })
    setMetric(id)
    setDrawerOpen(true)
  }
  const ordered = [...evaluations].reverse()
  const latest = evaluations[0]
  const history = areas.flatMap(([id, title, visual, color]) => {
    const points = ordered.flatMap(row => row.scores[id] === undefined ? [] : [{ id: row.id, date: row.date, score: row.scores[id] }])
    return points.length ? [{ id, title, visual, color, points }] : []
  })
  if (gridOnly) return <div aria-label="Sample progress grid" className="grid h-full auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4">
    {history.slice(0, 7).map(area => {
      const last = area.points.at(-1)!.score
      const change = area.points.length > 1 ? last - area.points[0].score : null
      const wide = ['overall', 'jaw', 'skin'].includes(area.id)
      const portrait = area.id === 'skin' ? skinPortrait : null
      const sideBySide = Boolean(portrait) || area.visual === 'dial'
      return <div key={area.id} className={`flex min-h-28 min-w-0 flex-col rounded-2xl p-3 text-left [&_svg]:max-h-12 ${wide ? 'col-span-2' : ''} ${area.id === 'overall' ? 'bg-[#eeeef1]' : 'bg-[#f4f4f6]'}`}>
        <span className={caption}>{area.title}</span>
        <span className={`mt-1 flex w-full flex-1 gap-1 ${sideBySide ? 'items-center justify-between' : 'flex-col justify-center'}`}>
          <span className="text-2xl font-normal tracking-[-0.05em] tabular-nums">{last.toFixed(1)} <small className="text-[10px] tracking-normal text-zinc-500">/ 10</small></span>
          <span className={sideBySide ? 'ml-auto min-w-0 flex-1' : 'w-full'}>
            {portrait ? <ProgressSkinPortrait key={portrait.src} {...portrait} /> : <MetricVisual visual={area.visual} points={area.points} color={area.color} />}
          </span>
        </span>
        <span className="mt-1 text-[10px] text-zinc-500">{change === null ? 'First reading' : `${change > 0 ? '+' : ''}${change.toFixed(1)} pts`}{focusIds.includes(area.id === 'face' ? 'face-shape' : area.id) ? ' · Focus area' : ''}</span>
      </div>
    })}
  </div>

  const newHref = `/analysis?start=1&from=app${preview ? `&preview=${desktop ? 'desktop' : 'mobile'}&walkthrough=1` : ''}`
  const overall = evaluations.find(evaluation => evaluation.scores.overall !== undefined)
  const selectedArea = areas.find(([id]) => id === metric)
  const focused = (id: string) => focusIds.some(focus => progressAreaId(focus) === id)
  const faceHistory = history.filter(area => area.id !== 'overall').sort((a, b) => Number(focused(b.id)) - Number(focused(a.id)))
  const visibleAreas = faceHistory.slice(0, expanded ? faceHistory.length : 6)
  const kinds = ['field', 'bars', 'trend', 'orbit', 'line', 'horizontal'] as const
  return <section className="scan-progress" data-wide={desktop || undefined}>
    <header><h1>Progress</h1>{onNewScan ? <button type="button" onClick={onNewScan}><MoggingIcon name="plus" size={14} /> New</button> : <Link href={newHref}><MoggingIcon name="plus" size={14} /> New</Link>}</header>
    {latest ? <>
      {overall && <div className="scan-progress-summary">
        <motion.button type="button" className="scan-progress-gauge-button" aria-label={`Explore overall score history, ${overall.scores.overall.toFixed(1)} out of ten`} onClick={() => showMetric('overall')}
          initial={reduced ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, ease: progressEase }}>
          {desktop ? <div className="member-standalone-overall"><strong>{overall.scores.overall.toFixed(1)}</strong><IndustrialHistory readings={history.find(area => area.id === 'overall')?.points ?? []} /></div>
            : <MobileScoreGauge score={overall.scores.overall} />}
          <span className="scan-progress-gauge-footer">Last Evaluation: {shortDate(overall.date)}<MoggingIcon name="external" size={13} /></span>
        </motion.button>
        <motion.button type="button" className="scan-progress-overall" onClick={() => showMetric('overall')} aria-label="Open overall score distribution and history"
          initial={reduced ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, delay: .07, ease: progressEase }}>
          <span className="scan-progress-overall-heading"><span>Score distribution</span><MoggingIcon name="external" size={15} /></span>
          <ScoreDistribution score={overall.scores.overall} potential={overall.potential} showSurvey />
          <span className="scan-progress-overall-values">
            <span data-reading="current"><span>Current</span><strong><ProgressText text={overall.scores.overall.toFixed(1)} /></strong></span>
            {overall.potential != null && <span data-reading="potential"><span>Potential</span><strong><ProgressText text={overall.potential.toFixed(1)} /></strong></span>}
          </span>
        </motion.button>
      </div>}
      {faceHistory.length > 0 && <motion.div layout={!reduced} className="scan-progress-section">
        <h2><MoggingIcon name="scan" size={22} />Your face</h2>
        <motion.div layout={!reduced} className="scan-progress-grid"><AnimatePresence initial={false} mode="popLayout">
          {visibleAreas.map((area, index) => {
            const id = area.id
            if (id === 'overall') return null
            const measurement = featureMeasurements[id]
            const measured = ordered.flatMap(item => {
              const value = item.measurements?.[measurement.id]
              return typeof value === 'number' && Number.isFinite(value) ? [{ id: item.id, date: item.date, score: value }] : []
            })
            const kind = index === visibleAreas.length - 1 && index % 3 === 0 ? 'trend' : kinds[index % 6]
            const last = area.points.at(-1)!.score
            const color = progressTone(area.id)
            return <motion.button layout={!reduced ? 'position' : false} type="button" key={area.id} data-kind={kind}
              style={{ '--metric-color': color } as CSSProperties} onClick={() => showMetric(area.id)}
              initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : .26, ease: progressEase }}>
              <span className="scan-progress-card-label"><span>{area.title}{focused(area.id) && <i aria-label="Focus area" />}</span><MoggingIcon name="external" size={12} /></span>
              <span className="scan-progress-card-score"><strong><ProgressText text={last.toFixed(1)} /> <small>/ 10</small></strong><small>{area.points.length < 2 ? 'Baseline' : deltaLabel(last - area.points[0].score)}</small></span>
              <FeatureInstrument area={id} readings={measured.length ? measured : area.points} measured={measured.length > 0}
                wide={kind === 'trend' || kind === 'horizontal'} caption={measured.length ? measurement.label : 'Score trend'}
                format={value => measured.length ? formatFeatureMeasurement(id, value) : value.toFixed(1)} />
              {kind === 'bars' && <small className="scan-progress-card-foot">{area.points.length === 1 ? '1 scan · Baseline' : `${area.points.length} scans`}</small>}
            </motion.button>
          })}
        </AnimatePresence></motion.div>
        {faceHistory.length > 6 && <motion.button layout={!reduced ? 'position' : false} className="scan-progress-expand" type="button" aria-expanded={expanded} onClick={() => {
          navigator.vibrate?.(7)
          setExpanded(value => !value)
        }}><ProgressText text={expanded ? 'Show overview' : `Explore all ${faceHistory.length} areas`} /><MoggingIcon name="chevron-down" size={13} /></motion.button>}
      </motion.div>}
      {faceHistory.length > 0 && <ProgressActivity areas={faceHistory} userId={userId} preview={preview} onOpen={showMetric} />}
    </> : <div className="scan-progress-empty"><MoggingIcon name="focus" size={42} /><h2>Your story starts here.</h2><p>Save your first evaluation to start tracking your focus areas.</p>
      {onNewScan ? <button type="button" onClick={onNewScan}>Take your first scan</button> : <Link href={newHref}>Take your first scan</Link>}
    </div>}
    <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} repositionInputs={false} handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay className="scan-progress-backdrop" />
        {selectedArea && <MetricSheet key={selectedArea[0]} area={selectedArea} evaluations={ordered} desktop={desktop} preview={preview} />}
      </Drawer.Portal>
    </Drawer.Root>
  </section>
}

const progressEase = [.22, 1, .36, 1] as const
const chartReveal = { hidden: { clipPath: 'inset(0 100% 0 0)' }, shown: { clipPath: 'inset(0 0% 0 0)' } }
const nativeTones: Record<string, string> = {
  overall: '#3bbfee', skin: '#bca1db', eyes: '#e4ad59', brows: '#ff6800', jaw: '#91c5a1',
  nose: '#d9b47e', mouth: '#ff1f5a', face: '#6dc7a3', hair: '#ff6800', cheeks: '#a58bef',
  symmetry: '#e4ad59', proportions: '#ff1f5a', ears: '#3bbfee',
}
const progressTone = (id: string) => nativeTones[id] ?? nativeTones.overall
const progressAreaId = (id: string) => ({
  'skin-age': 'skin', 'skin-quality': 'skin', 'sun-damage': 'skin', 'face-shape': 'face', cheekbones: 'cheeks', eyebrows: 'brows', lips: 'mouth',
} as Record<string, string>)[id] ?? id
const shortDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const deltaLabel = (delta: number) => `${delta > 0 ? '+' : ''}${delta.toFixed(1)} points`
const taskCatalog = new Map(protocolTasks.map(task => [task.key, task]))

function ProgressText({ text }: { text: string }) {
  return useReducedMotion() ? text : <TextMorph duration={250}>{text}</TextMorph>
}

function chartCoordinates(points: Point[], width: number, height: number) {
  const first = Date.parse(points[0]?.date ?? '')
  const span = Date.parse(points.at(-1)?.date ?? '') - first
  const scores = points.map(point => point.score)
  const min = Math.max(0, Math.min(...scores) - 1)
  const max = Math.min(10, Math.max(...scores) + 1)
  return points.map(({ date, score }, index) => ({
    x: points.length === 1 ? width / 2 : 8 + (width - 16) * (span > 0 ? (Date.parse(date) - first) / span : index / (points.length - 1)),
    y: height - 7 - (height - 14) * (score - min) / (max - min),
  }))
}

export function ProgressActivity({ areas, userId, preview, onOpen, tile = false }: {
  areas: { id: string; title: string }[]; userId?: string; preview?: boolean; onOpen: (id: string) => void; tile?: boolean
}) {
  const router = useRouter()
  const [ids, setIds] = useState<string[]>([])
  const reduced = useReducedMotion()
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`mogging:web-protocol:${userId ?? 'desktop-preview'}`) ?? '[]')
      setIds(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [])
    } catch { setIds([]) }
  }, [userId])
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  const startKey = formatProtocolDate(first)
  const todayKey = formatProtocolDate(today)
  const counts = new Map<string, number>()
  for (const key of new Set(ids)) {
    const [date, id] = key.split(':')
    if (date < startKey || date > todayKey) continue
    const target = taskCatalog.get(id)?.focusIds.map(progressAreaId).find(id => areas.some(area => area.id === id))
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  const visible = total ? areas.filter(area => counts.has(area.id)) : areas.slice(0, 3)
  return <motion.div layout={!reduced} className={tile ? "member-eval-tile member-eval-activity scan-progress-activity" : "scan-progress-section scan-progress-activity"}>
    <h2><MoggingIcon name="route" size={22} />Where you focused</h2>
    <p><strong><ProgressText text={String(total)} /></strong> completed {total === 1 ? 'task' : 'tasks'}</p>
    {!tile && <motion.div className="scan-progress-activity-strip" initial={reduced ? false : { scaleX: .96, opacity: .5 }} whileInView={{ scaleX: 1, opacity: 1 }} viewport={{ once: true }} aria-hidden="true">
      {total > 0 && visible.map(area => <span key={area.id} style={{ flex: counts.get(area.id), background: progressTone(area.id) }} />)}
    </motion.div>}
    {visible.map(area => <button type="button" key={area.id} onClick={() => onOpen(area.id)}><span><MoggingIcon name="focus" size={19} style={{ color: progressTone(area.id) }} />{area.title}</span><b>{counts.get(area.id) ?? 0}</b></button>)}
    <Link href={`/app/home?tab=protocol${preview ? '&preview=1' : ''}${preview && router.query.device === 'phone' ? '&device=phone' : ''}`}>View your Protocol <MoggingIcon name="forward" size={16} /></Link>
  </motion.div>
}

export function MetricSheet({ area: [id, title], evaluations, desktop, preview }: { area: readonly [string, string, ...unknown[]]; evaluations: ProgressEvaluation[]; desktop: boolean; preview?: boolean }) {
  const [range, setRange] = useState<typeof ranges[number]>('All')
  const [selection, setSelection] = useState<string>()
  const reduced = useReducedMotion()
  const dates = useRef<HTMLDivElement>(null)
  const gradient = useId()
  const color = progressTone(id)
  const visible = evaluations.filter(point => range === 'All' || Date.parse(point.date) >= Date.now() - range * 86_400_000)
  const points = visible.flatMap(row => row.scores[id] === undefined ? [] : [{ id: row.id, date: row.date, score: row.scores[id] }])
  const report = visible.find(report => report.id === selection) ?? visible.at(-1)
  const index = points.findIndex(point => point.id === report?.id)
  const point = points[index]
  const coords = chartCoordinates(points, 320, 132)
  const path = coords.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  const mark = coords[index]
  const tickPositions = desktop ? historyTickPositions(points) : null
  const select = (id: string) => {
    if (id === report?.id) return
    navigator.vibrate?.(6)
    setSelection(id)
  }
  useEffect(() => {
    const strip = dates.current
    const active = strip?.querySelector<HTMLElement>('button[aria-pressed="true"]')
    if (strip && active) strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2, behavior: reduced ? 'instant' : 'smooth' })
  }, [report?.id, reduced])
  function selectAt(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width * 320
    const nearest = coords.reduce((best, coord, i) => best < 0 || Math.abs((tickPositions?.[i] ?? coord.x) - x) < Math.abs((tickPositions?.[best] ?? coords[best].x) - x) ? i : best, -1)
    if (points[nearest]) select(points[nearest].id)
  }
  return <Drawer.Content className="scan-progress-sheet" data-wide={desktop || undefined} style={{ '--metric-color': color } as CSSProperties} aria-describedby={undefined}>
    <Drawer.Handle className="scan-progress-handle" />
    <div className="scan-progress-sheet-header"><Drawer.Title>{title}</Drawer.Title><Drawer.Close aria-label="Close progress"><MoggingIcon name="close" size={19} /></Drawer.Close></div>
    <LayoutGroup>
      <div className="scan-progress-ranges" role="group" aria-label="Time range">{ranges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => {
        navigator.vibrate?.(6)
        setRange(value)
        setSelection(undefined)
      }}>{range === value && <motion.i layoutId={reduced ? undefined : 'progress-range'} transition={{ duration: .24, ease: progressEase }} />}{value === 'All' ? 'All' : `${value}D`}</button>)}</div>
    </LayoutGroup>
    <div className="scan-progress-reading">
      <div><strong><ProgressText text={point?.score.toFixed(1) ?? '—'} /></strong> <small>/ 10</small><p><ProgressText text={report ? dateLabel(report.date) : 'No scans in this range'} /></p></div>
      <span><ProgressText text={point ? points.length > 1 ? deltaLabel(point.score - points[0].score) : 'First evaluation' : '—'} /></span>
    </div>
    <p>{points.length < visible.length ? `${point ? '' : 'Not measured · '}${points.length} of ${visible.length} evaluations` : `${visible.length} ${visible.length === 1 ? 'evaluation' : 'evaluations'}`}</p>
    <div className="scan-progress-chart" data-vaul-no-drag role={points.length > 1 ? 'slider' : undefined} tabIndex={points.length > 1 ? 0 : undefined}
      aria-label={points.length > 1 ? 'Select evaluation on chart' : undefined} aria-valuemin={points.length > 1 ? 1 : undefined}
      aria-valuemax={points.length > 1 ? points.length : undefined} aria-valuenow={points.length > 1 ? Math.max(0, index) + 1 : undefined}
      aria-valuetext={points.length > 1 ? point ? `${shortDate(point.date)}, ${point.score.toFixed(1)} out of 10` : 'Not measured in selected evaluation' : undefined}
      onPointerDown={event => {
        if (points.length < 2 || !event.isPrimary || event.button !== 0) return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        selectAt(event.clientX, event.currentTarget)
      }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) selectAt(event.clientX, event.currentTarget) }}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(points.length - 1, index + 1)
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, index - 1)
            : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : -1
        if (!points[next]) return
        event.preventDefault()
        select(points[next].id)
      }}>
      {desktop ? <IndustrialHistory readings={points} activeId={point?.id ?? null} /> : <svg viewBox="0 0 320 150" aria-hidden="true" preserveAspectRatio="none">
        <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor={color} stopOpacity=".3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[7, 45, 84, 125].map(y => <path key={y} d={`M0 ${y}H320`} stroke="#ffffff19" strokeDasharray="3 4" />)}
        {coords.length > 1 && <motion.g key={range} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
          <path d={`${path}L${coords.at(-1)!.x} 130H${coords[0].x}Z`} fill={`url(#${gradient})`} />
          <motion.path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            initial={reduced ? false : 'hidden'} animate="shown" variants={chartReveal} transition={{ duration: .6, ease: progressEase }} />
        </motion.g>}
        {coords.map(({ x, y }, i) => <circle key={points[i].id} cx={x} cy={y} r="2.4" fill={color} />)}
        {mark && <g>
          <motion.line initial={false} animate={{ x1: mark.x, x2: mark.x }} y1="7" y2="130" stroke={color} opacity=".4" strokeDasharray="3 3" transition={{ duration: reduced ? 0 : .18, ease: progressEase }} />
          <motion.circle initial={false} animate={{ cx: mark.x, cy: mark.y }} r="9" fill={color} opacity=".16" transition={{ duration: reduced ? 0 : .18, ease: progressEase }} />
          <motion.circle initial={false} animate={{ cx: mark.x, cy: mark.y }} r="5" fill="#11181e" stroke={color} strokeWidth="2.4" transition={{ duration: reduced ? 0 : .18, ease: progressEase }} />
        </g>}
      </svg>}
    </div>
    <div className="scan-progress-dates" ref={dates} data-vaul-no-drag>{visible.map(({ id: reportId, date, scores }) => {
      const day = new Date(date)
      return <button key={reportId} type="button" aria-label={dateLabel(date)} aria-pressed={report?.id === reportId} data-measured={scores[id] !== undefined || undefined} onClick={() => select(reportId)}>
        <small>{day.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small>{day.getUTCDate()}<i aria-hidden="true" />
      </button>
    })}</div>
    {desktop && report && !preview && <Link className="scan-progress-report-link" href={`/analysis?analysisId=${encodeURIComponent(report.id)}&from=app`}>Open evaluation <MoggingIcon name="external" size={14} /></Link>}
    <div className="scan-progress-stats">{[
      ['Measured', `${points.length} / ${visible.length}`], ['First', points[0]?.score.toFixed(1) ?? '—'], ['Latest', points.at(-1)?.score.toFixed(1) ?? '—'],
    ].map(([label, value]) => <div key={label}><p>{label}</p><strong><ProgressText text={value} /></strong></div>)}</div>
  </Drawer.Content>
}

function PreviewTrend({ points, color }: { points: Point[]; color: string }) {
  const coords = chartCoordinates(points, 300, 70)
  const last = coords.at(-1)!
  return <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="block h-14 w-full" aria-hidden="true">
    <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <path d={`M${last.x} ${last.y}h.01`} stroke={color} strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>
}

function MetricVisual({ visual, points, color }: { visual: Visual; points: Point[]; color: string }) {
  if (visual === 'line') return <PreviewTrend points={points} color={color} />
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
