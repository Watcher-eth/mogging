import { Fragment } from 'react'
import { ReportCategoryHeader, ReportColorPalette, type DesktopReportCategory } from '../analysis-report'
import { ScoreDistribution } from '../score-distribution'
import { layoutDesktopRubrics, layoutWebRubrics, scoreHistogram, type WebRubricGroup } from '@/lib/analysis-v2/web-report'
import { RubricVisual } from './rubric-visual'
import { AnimatedGroup } from '@/components/core/animated-group'
import { motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import { LockKeyhole } from '@/components/ui/mogging-glyphs'
import { SkeletonBox } from 'skullet/react'
import styles from './rubrics.module.css'

export function V2ReportDetail({ category, groups, embedded = false, hero = false, locked = false, mobile = false, animateValues = false, preview, categoryScores }: { category: DesktopReportCategory; groups: WebRubricGroup[]; embedded?: boolean; hero?: boolean; locked?: boolean; mobile?: boolean; animateValues?: boolean; preview?: { visibleId: string; onUnlock: () => void }; categoryScores?: number[] }) {
  const reduced = useReducedMotion()
  const morph = (value: string) => animateValues && !reduced ? <TextMorph>{value}</TextMorph> : value
  const summary = category.id === 'overall'
  const entries = groups.flatMap(group => group.rubrics)
  const desktop = animateValues && !mobile && !embedded && !locked && !preview && !hero
  const histogram = desktop ? scoreHistogram(summary ? categoryScores ?? [] : groups[0]?.rubrics.map(rubric => rubric.grade) ?? []) : null
  const rubrics = preview ? entries.map((rubric, index) => ({ rubric, full: index === 0 })) : hero ? entries.slice(0, 3).map((rubric, index) => ({ rubric, full: index === 2 }))
    : desktop ? layoutDesktopRubrics(entries, summary) : layoutWebRubrics(entries, summary ? 'summary' : 'detail')
  const histogramAfter = Math.min(rubrics.length - 1, summary ? 3 : rubrics[0]?.full ? 0 : 1)
  const distribution = histogram && <div className={`${styles.metric} ${styles.full} ${styles.distributionCard}`}>
    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{summary ? 'Category score distribution' : 'Feature score distribution'}</p>
    <ScoreDistribution score={category.score} histogram={histogram} />
  </div>
  return <motion.div layout="position" className={styles.groups} data-hero={hero || undefined} data-mobile-report={mobile || undefined} data-desktop-metrics={desktop || undefined} key={animateValues ? undefined : category.id}>
    {!hero && !(mobile && summary) && <AnimatedGroup preset="slide">
    <ReportCategoryHeader category={category} simplified hideScore={Boolean(preview)} lockScore={locked} morph={animateValues && !reduced} />
    {category.id === 'eyes' && (category.eyeColor || locked) ? <div className="mt-3"><ReportColorPalette color={category.eyeColor} ribbon locked={locked} /></div> : null}
    {category.id === 'hair' && (category.hairColor || locked) ? <div className="mt-3"><ReportColorPalette color={category.hairColor} kind="hair" ribbon locked={locked} /></div> : null}
    </AnimatedGroup>}
    <motion.div layout="position" className={hero ? styles.grid : `${styles.grid} mt-3`} data-embedded={embedded || undefined}>{(embedded ? rubrics.slice(0, 6) : rubrics).map(({ rubric, full }, index) => {
      const score = rubric.scale === 'quality' && (locked || /^\d.*\/\s*\d/.test(rubric.value))
      const hidden = Boolean(preview && rubric.id !== preview.visibleId)
      const hasVisual = rubric.visual !== 'Text' && (locked || (rubric.visual === 'Rail' ? rubric.grade !== null : rubric.positions.length > 0))
      const dial = hasVisual && rubric.visual === 'Dial'
      const hasMeasurementAxis = hasVisual && Boolean(rubric.chartAxis)
      const scoreAtBottom = mobile && (score || (rubric.visual === 'Rail' && rubric.grade !== null))
      return <Fragment key={animateValues ? index : rubric.id}><motion.div data-rubric={rubric.id} data-chart={hasVisual ? rubric.visual : undefined} data-preview={Boolean(preview) || undefined} layout={locked ? false : "position"} initial={locked || reduced ? false : { opacity: 0, y: 12 }} whileInView={locked ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 25, mass: .8, delay: index % 2 * .035 }}
        className={`${styles.metric} ${full ? styles.full : ''} ${hasVisual ? '' : summary ? styles.scoreOnly : styles.observation}`}>
        <div className={styles.metricHeader}><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{morph(rubric.label)}</p>
          {!mobile && !locked && score && !dial ? <p className={styles.score}>{morph(rubric.value)}</p> : !mobile && !locked && rubric.visual === 'Rail' && rubric.grade !== null ? <p className={styles.score}>{morph(rubric.grade.toFixed(1))} <span className={styles.scoreDenominator}>/ 10</span></p> : null}
          {hasMeasurementAxis && !dial && <p className={styles.measurementValue}>{locked ? <LockedValue /> : morph(rubric.value)}</p>}
        </div>
        {rubric.measurement ? <p className="font-mono text-xs text-muted-foreground">{morph(rubric.measurement)}</p> : null}
        {hasVisual ? <><RubricVisual concealed={locked} kind={rubric.visual} positions={rubric.positions} grade={rubric.grade} scale={rubric.scale} label={rubric.label} value={rubric.value} axis={rubric.chartAxis} denseTicks={(animateValues || locked) && rubric.label.toLowerCase() === 'psl score'} />{!locked && (dial || (!score && !hasMeasurementAxis && rubric.value.length <= 38)) ? <span className="sr-only">{rubric.value}</span> : null}</> : null}
        {scoreAtBottom && <p className={styles.score}>{locked ? <LockedValue /> : score ? rubric.value : `${rubric.grade?.toFixed(1)} / 10`}</p>}
        {hidden ? <div aria-hidden="true" className={styles.previewPlaceholder}><RubricVisual kind="Orbit" positions={[.55]} grade={null} scale="range" label="" value="" /></div> : locked ? !scoreAtBottom && !hasMeasurementAxis && <p className={styles.valueRow}><LockedValue /></p> : !score && (!hasVisual || (!hasMeasurementAxis && !dial && rubric.value.length > 38)) ? <p className={styles.valueRow}>{morph(rubric.value)}</p> : null}
        {preview && <button type="button" onClick={preview.onUnlock} className={styles.previewUnlock} aria-label={`Unlock ${rubric.label}`}><LockKeyhole size={13} /> Unlock</button>}
      </motion.div>{index === histogramAfter ? distribution : null}</Fragment>
    })}{!rubrics.length ? distribution : null}</motion.div>
    {!hero && !preview && <motion.div initial={locked || reduced ? false : { opacity: 0, y: 10 }} whileInView={locked ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: reduced ? 0 : .25 }} className="mt-3 rounded-[24px] bg-zinc-50/60 p-5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p>
      {locked ? <div className="mt-6 grid gap-3" aria-label="Explanation locked"><SkeletonBox className={styles.lockedLine} width="96%" height={10} /><SkeletonBox className={styles.lockedLine} width="70%" height={10} /></div>
        : <p className="mt-6 text-sm leading-6 text-muted-foreground">{category.explanation}</p>}
    </motion.div>}
  </motion.div>
}

function LockedValue() {
  return <span className={styles.lockedValue}><span className="sr-only">Locked value</span><SkeletonBox width="3.2em" height=".65em" radius=".2em" /></span>
}
