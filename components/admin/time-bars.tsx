import {useId} from 'react'
import type {MetricRow} from '@/lib/admin/analytics'
import {formatReportingTime} from '@/lib/admin/reporting-time'
import type {ChartMetric} from './analytics-chart'
import {count,money} from './analytics-ui'

// Discrete bucket totals use narrow bars, a zero baseline and native exact-value
// tooltips. No live interpolation, moving time window or client chart library.
export function TimeBars({rows,metrics,title,days,currency}:{rows:MetricRow[];metrics:ChartMetric[];title:string;days:number;currency?:string}) {
  const id=useId(),width=Math.max(640,rows.length*18+70),height=230,left=64,right=12,top=12,bottom=35
  const values=rows.flatMap(row=>metrics.flatMap(m=>row[m.key]==null?[]:[Number(row[m.key])])).filter(Number.isFinite)
  if(!rows.length||!values.length)return <p className="admin-empty">No recorded {title.toLowerCase()} for this window.</p>
  const minimum=Math.min(0,...values),maximum=Math.max(0,...values)||1,range=maximum-minimum
  const ticks=Array.from(new Set([minimum,currency?minimum+range/2:Math.ceil(minimum+range/2),maximum]))
  const y=(value:number)=>top+(maximum-value)/range*(height-top-bottom),zero=y(0),step=(width-left-right)/rows.length
  const bar=Math.min(8,(step-5)/metrics.length),format=(value:number)=>currency?money(value,currency):count(value)
  return <div>
    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">{metrics.map(m=><span key={m.key} className="inline-flex items-center gap-2"><i aria-hidden style={{background:m.color}} className="h-2 w-2 rounded-sm"/>{m.label}</span>)}</div>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title}, ${days===1?'hourly':'daily'} bars. Scroll for all dates; exact values follow in the underlying data.`}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{minWidth:width}} role="img" aria-labelledby={id}>
        <title id={id}>{`${title} by ${days===1?'hour':'day'}, Pacific time`}</title>
        {ticks.map((v,i)=><g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="#eceef0"/><text x={left-8} y={y(v)+4} textAnchor="end" fontSize="10" fill="#858a91">{format(v)}</text></g>)}
        <line x1={left} x2={width-right} y1={zero} y2={zero} stroke="#cdd1d6"/>
        {rows.map((row,index)=>{
          const date=String(row.day),dateLabel=formatReportingTime(date,{month:'short',day:'numeric',...(days===1?{hour:'numeric',timeZoneName:'short'}:{})})
          return <g key={date}>{metrics.map((m,j)=>{
            const raw=row[m.key],value=raw==null?null:Number(raw),x=left+step*(index+.5)+(j-metrics.length/2)*bar
            if(value===null||!Number.isFinite(value))return <g key={m.key}><title>{`${dateLabel} · ${m.label}: unavailable`}</title><text x={x+bar/2} y={zero-5} fontSize="10" fill="#a1a1aa">—</text></g>
            return <rect key={m.key} x={x} y={Math.min(y(value),zero)} width={Math.max(1,bar-1)} height={Math.max(value===0?0:1,Math.abs(y(value)-zero))} rx="1.5" fill={m.color}><title>{`${dateLabel} · ${m.label}: ${format(value)}`}</title></rect>
          })}<rect x={left+step*index} y={top} width={step} height={height-top-bottom} fill="transparent"><title>{`${dateLabel}\n${metrics.map(m=>`${m.label}: ${row[m.key]==null?'unavailable':format(Number(row[m.key]))}`).join('\n')}${Number(row.missing_amount_events)>0?'\nPartial total: missing payment amounts':''}`}</title></rect>{index%Math.max(1,Math.ceil(rows.length/8))===0||index===rows.length-1?<text x={left+step*(index+.5)} y={height-10} textAnchor="middle" fontSize="10" fill="#858a91">{dateLabel}</text>:null}</g>
        })}
      </svg>
    </div>
  </div>
}
