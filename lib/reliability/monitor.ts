import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { backendOutcome, type BackendOutcome } from './outcome'
import { sendReliabilityAlert } from './alerts'

function backendEnvironment() {
  return process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')
}
async function saveBackendEvent(eventName:string,properties:Record<string,unknown>,trace:string) {
  const now=new Date()
  return db.transaction(async tx=>{
    await tx.execute(sql`set local statement_timeout = '3s'`)
    await tx.insert(schema.analyticsEvents).values({eventId:randomUUID(),eventName,environment:backendEnvironment(),platform:'server',source:'backend',occurredAt:now,exportedAt:now,properties:{...properties,trace_id:trace}})
  })
}

export function monitorBackend(feature: string, handler: (req: NextApiRequest, res: NextApiResponse) => unknown) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const started = Date.now()
    const trace = randomUUID()
    res.setHeader('X-Mogging-Trace',trace)
    let outcome: BackendOutcome | undefined
    const originalJson = res.json.bind(res)
    res.json = body => {
      outcome = backendOutcome(res.statusCode,body,feature)
      return originalJson(body)
    }
    try { return await handler(req,res) }
    catch (error) {
      outcome = {outcome:'failed',code:'unhandled_error',alert:true}
      throw error
    } finally {
      const result = outcome ?? backendOutcome(res.statusCode,null,feature)
      // Vercel retains this task after sending the response. Logging never gates a purchase or scan.
      waitUntil(recordBackendRequest(feature,result,Date.now()-started,trace))
    }
  }
}

export async function recordBackendRequest(feature: string, result: BackendOutcome, duration: number, trace = randomUUID()) {
  const environment = backendEnvironment()
  const properties = {feature,outcome:result.outcome,code:result.code,duration_ms:duration}
  console.info('backend:request',{trace,...properties,environment})
  // Keep service telemetry separate from the user/financial PostHog export.
  const alert = async () => {
    if (environment !== 'production' || !result.alert) return
    try {
      const status = await sendReliabilityAlert(feature,result.code,trace)
      if (status !== 'suppressed') await saveBackendEvent('backend_alert',{feature,code:result.code,status},trace)
    } catch {
      console.error('backend:alert_failed',{trace,feature,code:result.code})
      await saveBackendEvent('backend_alert',{feature,code:result.code,status:'failed'},trace).catch(()=>{})
    }
  }
  await Promise.allSettled([
    saveBackendEvent('backend_request',properties,trace).catch(()=>console.error('backend:telemetry_failed',{trace,feature})),
    alert(),
  ])
}

export function markEvaluationStarted(res: NextApiResponse) {
  const trace = String(res.getHeader('X-Mogging-Trace'))
  waitUntil(saveBackendEvent('backend_evaluation_started',{},trace).catch(()=>console.error('backend:scan_start_telemetry_failed',{trace})))
}
