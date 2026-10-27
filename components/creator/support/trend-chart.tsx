import { useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Bar, ComposedChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { CreatorConversionReport } from '@/lib/creator/conversion-report'
import { chartCount, chartMoney, supportChartMetrics, type SupportChartKey } from './chart-metrics'
import styles from './support-chat.module.css'
const date = (day:string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
const config=Object.fromEntries(supportChartMetrics.map(metric=>[metric.key,{label:metric.label,color:metric.color}]))
export function SupportTrendChart({ daily, selected, kind = 'line' }: { kind?: 'bar' | 'line'; daily: CreatorConversionReport['daily']; selected: SupportChartKey[] }) {
  const reduced=useReducedMotion()
  const [entered,setEntered]=useState(false)
  const currency=selected.includes('revenue')
  const series=supportChartMetrics.filter(metric=>selected.includes(metric.key))
  return <div className={styles.supportTrend}>
    <ChartContainer config={config} className="aspect-auto h-full w-full" aria-label={`${currency ? 'Attributed revenue in USD' : series.map(metric=>metric.label).join(', ')}. Daily UTC observations.`}>
      <ComposedChart accessibilityLayer data={daily} margin={{top:12,right:0,bottom:0,left:0}}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tickFormatter={date} minTickGap={58} tickMargin={10} tick={{fontSize:10}} interval="preserveStartEnd" />
        <YAxis orientation="right" axisLine={false} tickLine={false} width={36} tickCount={3} tick={{fontSize:10}} tickFormatter={currency ? value=>`$${chartCount(Number(value))}` : chartCount} domain={currency ? ['auto','auto'] : [0,'auto']} />
        <ChartTooltip cursor={{stroke:'#d8dde3',strokeWidth:1}} content={<ChartTooltipContent labelFormatter={value=>date(String(value))} formatter={(value,name)=>{const metric=supportChartMetrics.find(item=>item.key===name || item.label===name);return <span className={styles.trendTooltipValue}><span>{metric?.label ?? name}</span><strong>{currency ? chartMoney(Number(value)) : chartCount(Number(value))}</strong></span>}} />} />
        {series.map((metric,index)=>kind === 'bar' ? <Bar key={metric.key} dataKey={metric.key} name={metric.key} fill={metric.color} radius={[3,3,0,0]} maxBarSize={38} isAnimationActive={!reduced&&!entered} animationBegin={index*40} animationDuration={220} onAnimationEnd={()=>setEntered(true)} /> : <Line key={metric.key} type="monotone" dataKey={metric.key} name={metric.key} stroke={metric.color} strokeWidth={2} dot={false} activeDot={{r:3,strokeWidth:2,stroke:'#fff'}} isAnimationActive={!reduced&&!entered} animateNewValues={false} animationBegin={60+index*40} animationDuration={220} animationEasing="ease-out" onAnimationEnd={index===series.length-1 ? ()=>setEntered(true) : undefined} />)}
      </ComposedChart>
    </ChartContainer>
    <table className="sr-only"><caption>Daily performance, UTC</caption><thead><tr><th>Date</th>{series.map(metric=><th key={metric.key}>{metric.label}</th>)}</tr></thead><tbody>{daily.map(day=><tr key={day.day}><th>{day.day}</th>{series.map(metric=><td key={metric.key}>{metric.key==='revenue' ? chartMoney(day.revenue) : chartCount(day[metric.key])}</td>)}</tr>)}</tbody></table>
  </div>
}
