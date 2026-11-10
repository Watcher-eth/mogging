import { MoggingIcon } from '@/components/ui/mogging-icon'
import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { ScoreDistribution } from '@/components/analysis/score-distribution'
import { FeatureInstrument } from './feature-instrument'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { featureMeasurements, formatFeatureMeasurement } from '@/lib/analysis-v2/feature-history'
import { MetricSheet, ProgressActivity } from './progress'
import type { ProgressEvaluation } from '@/lib/users/member-pages'

type Report = { photo: { imageUrl: string }; analysis: { id: string; createdAt: string } }
const areas = [
  ['skin', 'Skin'], ['jaw', 'Jaw & chin'], ['eyes', 'Eye area'], ['cheeks', 'Cheeks'], ['face', 'Face shape'],
  ['symmetry', 'Symmetry'], ['proportions', 'Proportions'], ['brows', 'Brows'], ['nose', 'Nose'], ['mouth', 'Lips'], ['hair', 'Hair'], ['ears', 'Ears'],
] as const
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const ordinal = new Intl.PluralRules('en-US', { type: 'ordinal' })
const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th', zero: 'th', many: 'th' } as const
function displayLatestDate(isoDate: string, preview: boolean) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: preview ? 'UTC' : undefined,
  }).formatToParts(new Date(isoDate))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value
  const day = Number(get('day'))
  return { date: `${get('month')} ${day}${suffix[ordinal.select(day)]}`, year: get('year') }
}
type Area = readonly [string, string]

export function DesktopEvaluations({ reports, evaluations, focusIds, observations, preview, activityUser, reportHref, onNewScan, processing, loading, error, more, jumpToHistory }: {
  reports: Report[]; evaluations: ProgressEvaluation[]; focusIds: string[];
  observations: Record<string, { value: string; label: string }>;
  preview: boolean; activityUser?: string; reportHref: (id: string) => string; onNewScan: () => void; processing: boolean; loading: boolean; error: boolean;
  more?: { loading: boolean; load: () => void }; jumpToHistory: boolean
}) {
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState<Area | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const history = useRef<HTMLDivElement>(null)
  const latest = reports[0]
  const latestDate = latest && displayLatestDate(latest.analysis.createdAt, preview)
  const ordered = [...evaluations].reverse()
  const forArea = (id: string) => ordered.flatMap(({ id: readingId, date, scores }) =>
    Number.isFinite(scores[id]) ? [{ id: readingId, date, score: scores[id] }] : [])
  const overall = forArea('overall')
  const current = overall.at(-1)
  const potential = evaluations.find(item => item.id === current?.id)?.potential
  const visible = areas.map(area => {
    const measurement = featureMeasurements[area[0]]
    const measured = ordered.flatMap(({ id, date, measurements }) => {
      const score = measurements?.[measurement.id]
      return score !== undefined && Number.isFinite(score) ? [{ id, date, score }] : []
    })
    return { area, readings: forArea(area[0]), measurement, measured, observation: observations[area[0]] }
  }).filter(item => item.readings.length || item.measured.length || item.observation?.value)
    .sort((a, b) => Number(focusIds.includes(b.area[0])) - Number(focusIds.includes(a.area[0])))

  const cards = visible.slice(0, expanded ? visible.length : 6)
  const trackedAreas = visible.filter(item => item.readings.length).map(({ area: [id, title] }) => ({ id, title }))
  const showActivity = Boolean(activityUser && trackedAreas.length)

  useEffect(() => {
    if (jumpToHistory) history.current?.scrollIntoView({ block: 'start' })
  }, [jumpToHistory, current?.id])

  function viewMetric(area: Area) {
    setSelected(area)
    setOpen(true)
  }

  return <section className="member-evaluations">
    <header className="member-evaluations-header">
      <div><h1>Progress</h1><p>Your latest findings and how they’ve changed over time.</p></div>
      <button type="button" className="scan-home-primary" onClick={onNewScan}><MoggingIcon name="plus" size={17} /> New evaluation</button>
    </header>
    {processing && <p className="member-evaluations-status" role="status">Your new evaluation is being prepared.</p>}
    <div className="member-evaluations-grid">
      {latest && latestDate && <Link href={reportHref(latest.analysis.id)} className="member-eval-tile member-eval-latest" data-single={!current || undefined}>
        <div className="member-eval-cover"><img src={latest.photo.imageUrl} alt="" />
          <ProgressiveBlur direction="right" intensity={6} blurLayers={3} className="member-eval-photo-blur" />
        </div>
        <div className="member-eval-latest-copy"><small>Latest evaluation</small>
          <time dateTime={latest.analysis.createdAt}>{latestDate.date}<span>{latestDate.year}</span></time>
          <span>Open report <MoggingIcon name="external" size={15} /></span>
        </div>
      </Link>}
      {current && <div className="member-eval-tile member-eval-overall" data-single={!latest || undefined}>
        <div className="member-eval-card-head"><h2>Overall score</h2></div>
        <div className="member-eval-overall-body">
          <div><strong>{current.score.toFixed(1)}</strong> <small>/ 10</small>{potential != null && <p>Potential <b>{potential.toFixed(1)}</b></p>}</div>
          <ScoreDistribution score={current.score} potential={potential} showSurvey />
        </div>
        <div ref={history} id="evaluation-progress" className="member-eval-anchor" />
      </div>}
      {cards.map(({ area, readings, measurement, measured, observation }, index) => {
        const last = readings.at(-1)
        const delta = last && readings.length > 1 ? last.score - readings[0].score : null
        const wide = index % 6 === 0 || index % 6 === 5 || cards.length % 3 === 1 && index === cards.length - 1
        const graph = measured.length ? measured : readings
        const usesMeasurement = graph === measured
        const body = <><div className="member-eval-card-head"><h2>{area[1]}</h2><MoggingIcon name="external" size={14} /></div>
          {last && <div className="member-eval-score"><strong>{last.score.toFixed(1)}</strong><small>{delta == null ? 'Baseline' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts`}</small></div>}
          {observation?.value && <p className="member-eval-observation"><span>{observation.label}</span><b>{observation.value}</b></p>}
          {graph.length > 0 && <FeatureInstrument area={area[0]} readings={graph} measured={usesMeasurement}
            caption={usesMeasurement ? measurement.label : 'Score trend'} wide={wide}
            format={value => usesMeasurement ? formatFeatureMeasurement(area[0], value) : value.toFixed(1)} />}</>
        const remainder = cards.length % 3
        const tail = remainder > 0 && index >= cards.length - remainder ? remainder : undefined
        const className = 'member-eval-tile member-eval-feature'
        return last ? <motion.button key={area[0]} type="button" layout={reduced ? false : 'position'} className={className} data-span={index % 6} data-tail={tail} onClick={() => viewMetric(area)}>{body}</motion.button>
          : latest && <Link key={area[0]} href={reportHref(latest.analysis.id)} className={className} data-span={index % 6} data-tail={tail}>{body}</Link>
      })}
      {visible.length > 6 && <button type="button" className="member-eval-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer features' : `Show all ${visible.length} features`}</button>}
      {showActivity && <ProgressActivity tile areas={trackedAreas} preview={preview} userId={activityUser} onOpen={id => {
        const area = areas.find(item => item[0] === id)
        if (area) viewMetric(area)
      }} />}
      <div className="member-eval-tile member-eval-reports" data-with-activity={showActivity || undefined}>
        <div className="member-eval-card-head"><h2>Saved evaluations</h2><small>{reports.length} loaded</small></div>
        {reports.map(({ photo, analysis }) => <Link key={analysis.id} href={reportHref(analysis.id)}>
          <img src={photo.imageUrl} alt="" loading="lazy" /><span>Face evaluation</span><time>{shortDate.format(new Date(analysis.createdAt))}</time><MoggingIcon name="external" size={15} />
        </Link>)}
        {(loading || error || !reports.length) && <p className="member-evaluations-status" role={error ? 'alert' : 'status'}>{error ? 'Couldn’t load your evaluations.' : loading ? 'Loading saved evaluations…' : 'Your saved reports will appear here after your first evaluation.'}</p>}
        {more && <button type="button" className="member-eval-expand" disabled={more.loading} onClick={more.load}>{more.loading ? 'Loading…' : 'Load more evaluations'}</button>}
      </div>
    </div>
    <Drawer.Root open={open} onOpenChange={setOpen} repositionInputs={false} handleOnly>
      <Drawer.Portal><Drawer.Overlay className="scan-progress-backdrop" />
        {selected && <MetricSheet key={selected[0]} area={selected} evaluations={ordered} desktop preview={preview} />}
      </Drawer.Portal>
    </Drawer.Root>
  </section>
}
