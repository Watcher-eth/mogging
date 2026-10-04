import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { backendOutcome, type BackendOutcome } from './outcome'
import { sendReliabilityAlert } from './alerts'

export function monitorBackend(feature: string, handler: (req: NextApiRequest, res: NextApiResponse) => unknown) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const started = Date.now()
    const trace = randomUUID()
    res.setHeader('X-Mogging-Trace',trace)
    let outcome: BackendOutcome | undefined
    const originalJson = res.json.bind(res)
    res.json = body => {
      outcome = backendOutcome(res.statusCode,body)
      return originalJson(body)
    }
    try { return await handler(req,res) }
    catch (error) {
      outcome = {outcome:'failed',code:'unhandled_error',alert:true}
      throw error
    } finally {
      const result = outcome ?? backendOutcome(res.statusCode,null)
      // Vercel retains this task after sending the response. Logging never gates a purchase or scan.
      waitUntil(recordBackendRequest(feature,result,Date.now()-started,trace))
    }
  }
}

export async function recordBackendRequest(feature: string, result: BackendOutcome, duration: number, trace = randomUUID()) {
  const environment = process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  const now = new Date()
  const properties = {feature,outcome:result.outcome,code:result.code,duration_ms:duration}
  console.info('backend:request',{trace,...properties,environment})
  // Keep service telemetry separate from the user/financial PostHog export.
  const save = async (eventName:string, props:Record<string,unknown>) => db.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '3s'`)
    await tx.insert(schema.analyticsEvents).values({eventId:randomUUID(),eventName,environment,platform:'server',source:'backend',occurredAt:now,exportedAt:now,properties:{...props,trace_id:trace}})
  })
  const alert = async () => {
    if (environment !== 'production' || !result.alert) return
    try {
      const status = await sendReliabilityAlert(feature,result.code,trace)
      if (status !== 'suppressed') await save('backend_alert',{feature,code:result.code,status})
    } catch { console.error('backend:alert_failed',{trace,feature,code:result.code}) }
  }
  await Promise.allSettled([
    save('backend_request',properties).catch(()=>console.error('backend:telemetry_failed',{trace,feature})),
    alert(),
  ])
}
