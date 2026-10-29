import { ReportCategoryHeader, ReportColorPalette, type DesktopReportCategory } from '../analysis-report'
import { layoutWebRubrics, type WebRubricGroup } from '@/lib/analysis-v2/web-report'
import { RubricVisual } from './rubric-visual'
import { AnimatedGroup } from '@/components/core/animated-group'
import { motion, useReducedMotion } from 'motion/react'
import styles from './rubrics.module.css'

export function V2ReportDetail({ category, groups }: { category: DesktopReportCategory; groups: WebRubricGroup[] }) {
  const reduced = useReducedMotion()
  const summary = category.id === 'overall'
  const rubrics = layoutWebRubrics(groups.flatMap(group => group.rubrics), summary ? 'summary' : 'detail')
  return <motion.div layout="position" className={styles.groups} key={category.id}>
    <AnimatedGroup preset="slide">
    <ReportCategoryHeader category={category} simplified />
    {category.id === 'eyes' && category.eyeColor ? <div className="mt-3"><ReportColorPalette color={category.eyeColor} ribbon /></div> : null}
    {category.id === 'hair' && category.hairColor ? <div className="mt-3"><ReportColorPalette color={category.hairColor} kind="hair" ribbon /></div> : null}
    </AnimatedGroup>
    <motion.div layout="position" className={`${styles.grid} mt-3`}>{rubrics.map(({ rubric, full }, index) => {
      const score = rubric.scale === 'quality' && /^\d.*\/\s*\d/.test(rubric.value)
      const hasVisual = rubric.visual !== 'Text' && (rubric.visual === 'Rail' ? rubric.grade !== null : rubric.positions.length > 0)
      return <motion.div key={rubric.id} data-rubric={rubric.id} layout="position" initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 25, mass: .8, delay: index % 2 * .035 }}
        className={`${styles.metric} ${full ? styles.full : ''} ${hasVisual ? '' : summary ? styles.scoreOnly : styles.observation}`}>
        <div className={styles.metricHeader}><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{rubric.label}</p>
          {score ? <p className={styles.score}>{rubric.value}</p> : rubric.visual === 'Rail' && rubric.grade !== null ? <p className={styles.score}>{rubric.grade.toFixed(1)} <span>/ 10</span></p> : null}
        </div>
        {rubric.measurement ? <p className="font-mono text-xs text-muted-foreground">{rubric.measurement}</p> : null}
        {hasVisual ? <><RubricVisual kind={rubric.visual} positions={rubric.positions} grade={rubric.grade} scale={rubric.scale} label={rubric.label} value={rubric.value} />{!score && rubric.value.length <= 38 ? <span className="sr-only">{rubric.value}</span> : null}</> : null}
        {!score && (!hasVisual || rubric.value.length > 38) ? <p className={styles.valueRow}>{rubric.value}</p> : null}
      </motion.div>
    })}</motion.div>
    <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: reduced ? 0 : .25 }} className="mt-3 rounded-[24px] bg-zinc-50/60 p-5"><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p><p className="mt-6 text-sm leading-6 text-muted-foreground">{category.explanation}</p></motion.div>
  </motion.div>
}
