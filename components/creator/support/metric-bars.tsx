import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { CreatorConversionMetrics } from '@/lib/creator/conversion-report'
import { chartMetricRows } from './chart-metrics'
import styles from './support-chat.module.css'
const container: Variants = { visible: { transition: { staggerChildren: 0.045 } } }
const row: Variants = { hidden: { opacity:0,transform:'translateY(4px)' }, visible: {opacity:1,transform:'translateY(0px)',transition:{duration:0.18,ease:[0.22,1,0.36,1]}} }
const fill: Variants = { hidden: { scaleX:0 }, visible: { scaleX:1,transition:{duration:0.24,ease:[0.22,1,0.36,1]}} }
export function SupportMetricBars({ totals }: { totals: CreatorConversionMetrics }) {
  const reduced = useReducedMotion()
  return <motion.div role="list" aria-label="All performance metrics" className={styles.metricBars} initial={reduced ? false : 'hidden'} animate="visible" variants={reduced ? undefined : container}>
    {chartMetricRows(totals).map(metric => <motion.div role="listitem" className={styles.metricBarRow} data-financial={metric.key==='revenue'} key={metric.key} variants={reduced ? undefined : row}>
      <div className={styles.metricBarHeading}><span><i style={{background:metric.color}} aria-hidden="true" />{metric.label}{metric.key==='revenue' ? <small>USD · separate scale</small> : null}</span><strong>{metric.formatted}</strong></div>
      <div className={styles.metricBarTrack} aria-hidden="true"><motion.div style={{width:`${metric.fraction*100}%`,background:metric.value<0 ? '#b54b59' : metric.color,transformOrigin:'0% 50%'}} variants={reduced ? undefined : fill} /></div>
    </motion.div>)}
  </motion.div>
}
