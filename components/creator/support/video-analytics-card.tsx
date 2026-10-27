import { motion, useReducedMotion } from 'motion/react'
import type { SupportArtifact } from '@/lib/creator/support/contracts'
import { SupportAnalyticsCard } from './analytics-card'
import styles from './support-chat.module.css'

export function SupportVideoAnalyticsCard({ artifact, onExplain }: { artifact: Extract<SupportArtifact,{type:'video-analytics'}>; onExplain: (text:string) => void }) {
  const { report } = artifact
  const reduced = useReducedMotion()
  const dates = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
  const range = `${report.window.label} · ${dates.format(new Date(report.window.start))}${report.window.days > 1 ? `–${dates.format(new Date(Date.parse(report.window.end)-1))}` : ''}`
  const metric = artifact.metric ?? 'conversions'
  const label = { conversions:'Conversions', revenue:'Attributed revenue', downloads:'Downloads', linkPresses:'Link presses' }[metric]
  const value = (v: typeof report.videos[number]) => metric === 'revenue' ? v.revenueCents / 100 : v[metric]
  const format = (n:number) => metric === 'revenue' ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : `${n.toLocaleString()} ${label.toLowerCase()}`
  const videos = [...report.videos].sort((a,b)=>value(b)-value(a))
  const maximum = Math.max(1,...videos.map(v=>Math.abs(value(v))))
  if (artifact.presentation === 'comparison') return <section className={styles.viewsChart} aria-label={`${label} by video`}>
    <div className={styles.cardHeader}><span>{label} by video</span><span>{range} · UTC</span></div>
    <div role="list">{videos.map((video,i)=><div role="listitem" key={video.id}><button className={styles.viewsRow} onClick={()=>onExplain(`Show conversions for my submission ${video.id} ${report.window.label.toLowerCase()}`)} type="button"><span><strong>{video.title}</strong><span>{format(value(video))}</span></span><span className={styles.viewsTrack} aria-hidden="true"><motion.span initial={reduced ? false : {scaleX:0}} animate={{scaleX:Math.abs(value(video))/maximum}} transition={{duration:reduced ? 0 : .22,delay:reduced ? 0 : i*.03}} /></span></button></div>)}</div>
    {report.unassigned.conversions > 0 ? <p className={styles.caption}>{report.unassigned.conversions} unassigned conversions remain separate.</p> : null}
  </section>
  return <SupportAnalyticsCard artifact={{ type:'analytics', report, days:report.window.days, metric, chartKind:artifact.chartKind }} rangeLabel={range} />
}
