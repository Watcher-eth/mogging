import {formatReportingTime} from '@/lib/admin/reporting-time'
import {count,label} from './analytics-ui'
export const operationalTime=(value:unknown)=>typeof value==='string'?formatReportingTime(value,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'No record available'
export const operationalDuration=(value:unknown)=>value==null?'—':`${count(Number(value)/1000)} s`
export const operationalLabel=(value:unknown)=>label(String(value??'Not recorded').replaceAll('-',' '))
