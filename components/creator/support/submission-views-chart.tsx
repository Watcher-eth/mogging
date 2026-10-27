import { motion, useReducedMotion } from 'motion/react'
import type { SubmissionViews } from '@/lib/creator/support/performance'
import styles from './support-chat.module.css'

export function SubmissionViewsChart({ rows, scope, onOpen }: { rows: SubmissionViews[]; scope: string; onOpen: (id: string) => void }) {
  const reduced = useReducedMotion()
  const maximum = Math.max(1, ...rows.map(r => r.views ?? 0))
  return <section className={styles.viewsChart} aria-label="Latest recorded views by video">
    <div className={styles.cardHeader}><span>Latest recorded views</span><span>{scope}</span></div>
    <p className={styles.caption}>Cumulative snapshots · not views gained in the selected period</p>
    <div role="list">{rows.map((row, i) => <motion.div role="listitem" key={row.id} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18, delay: reduced ? 0 : Math.min(i * .03, .18) }}>
      <button type="button" onClick={() => onOpen(row.id)} className={styles.viewsRow}>
        <span><strong>{row.title}</strong><span>{row.views == null ? 'Not recorded' : `${row.views.toLocaleString('en-US')} ${row.basis} views`}</span></span>
        <span className={styles.viewsTrack} aria-hidden="true"><motion.span initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: (row.views ?? 0) / maximum }} transition={{ duration: reduced ? 0 : .24, delay: reduced ? 0 : Math.min(i * .03, .18) }} /></span>
      </button>
    </motion.div>)}</div>
    {!rows.length ? <p className={styles.empty}>No recorded views found for these videos.</p> : null}
  </section>
}
