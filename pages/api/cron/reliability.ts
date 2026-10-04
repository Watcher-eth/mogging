import type { NextApiRequest,NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { unfinishedEvaluationsQuery } from '@/lib/admin/reliability'
import { recordBackendRequest } from '@/lib/reliability/monitor'
import { backendHealth } from '@/lib/reliability/health'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export const config={maxDuration:60}
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET') return res.status(405).end()
  const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual=Buffer.from(req.headers.authorization || '')
  if(!process.env.CRON_SECRET || expected.length!==actual.length || !timingSafeEqual(expected,actual)) return res.status(401).end()
  const [health,unfinished]=await Promise.all([backendHealth(),db.transaction(async tx=>{
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '3s'`)
    return tx.execute(unfinishedEvaluationsQuery(new Date()))
  }).catch(()=>null)])
  const healthy=health.ok && unfinished!==null
  await recordBackendRequest('availability',{outcome:healthy?'ok':'failed',code:healthy?'ok':!health.database?'database_unavailable':!health.configured?'runtime_configuration':'telemetry_unavailable',alert:!healthy},health.duration_ms)
  if(unfinished?.length) await recordBackendRequest('analyze',{outcome:'failed',code:'evaluation_unfinished',alert:true},0)
  return res.status(healthy?200:503).json({ok:healthy,unfinished:unfinished?.length ?? null})
}
