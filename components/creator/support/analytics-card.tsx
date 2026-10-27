import { useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatedGroup } from '@/components/core/animated-group'
import type { SupportArtifact } from '@/lib/creator/support/contracts'
import { timeChartKind } from '@/lib/creator/support/presentation'
import { chartMetricRows, type SupportChartKey } from './chart-metrics'
import styles from './support-chat.module.css'
const TrendChart=dynamic(()=>import('./trend-chart').then(m=>m.SupportTrendChart),{ssr:false,loading:()=><div className={styles.supportTrend} role="status">Loading chart…</div>})
export function SupportAnalyticsCard({ artifact, rangeLabel }: { rangeLabel?: string; artifact: Extract<SupportArtifact, { type: 'analytics' }> }) {
  const [selected,setSelected]=useState<SupportChartKey[]>([artifact.metric ?? 'conversions'])
  const {report,days}=artifact
  const kind = artifact.chartKind ?? timeChartKind(report.daily.length)
  function toggle(key:SupportChartKey) {
    setSelected(current=>key==='revenue' ? ['revenue'] : current.includes('revenue') ? [key] : current.includes(key) ? current.length>1 ? current.filter(item=>item!==key) : current : [...current,key])
  }
  return <section className={styles.analytics} aria-label={`Your analytics over ${days} ${days===1 ? 'day' : 'days'}`}>
    <header className={styles.cardHeader}><span>Your performance</span><span>{rangeLabel ?? `Last ${days} days`} · UTC</span></header>
    <AnimatedGroup className={styles.metrics}>{chartMetricRows(report.totals).map(metric=>kind === 'summary' ? <div key={metric.key}><span>{metric.label}</span><strong>{metric.formatted}</strong></div> : <button key={metric.key} type="button" onClick={()=>toggle(metric.key)} aria-pressed={selected.includes(metric.key)}><span><i style={{background:metric.color}} aria-hidden="true" />{metric.label}</span><strong>{metric.formatted}</strong></button>)}</AnimatedGroup>
    {kind !== 'summary' ? <TrendChart daily={report.daily} selected={selected} kind={kind} /> : null}
  </section>
}
