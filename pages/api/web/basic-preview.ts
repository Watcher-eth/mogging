import type { NextApiRequest, NextApiResponse } from 'next'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { db, schema } from '@/lib/db'
import { evaluateV2 } from '@/lib/analysis-v2/evaluator'
import { basicCategories, basicPreviewRubrics, type BasicReport } from '@/lib/analysis-v2/basic-preview'
import { formatRubricValue } from '@/lib/analysis-v2/web-report'
import { monitorBackend } from '@/lib/reliability/monitor'
import { finishEvaluation } from '@/lib/payments/entitlements'

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '5mb' } } }
const image = z.string().max(2_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
const bodySchema = z.object({ front: image, side: image, consent: z.literal(true) }).refine(body => body.front !== body.side, 'Choose two different photos.')

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST'])
  res.setHeader('Cache-Control', 'private, no-store')
  let reservationId: string | undefined
  try {
    await enforceRateLimit(req, res, { key: 'web-basic-preview', limit: 8, windowMs: 3_600_000 })
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to open your Basic report.')
    const key = `web-basic-preview:${userId}`
    if (req.method === 'GET') {
      const row = await db.query.scanReservations.findFirst({ where: eq(schema.scanReservations.id, key), columns: { result: true, status: true } })
      return json(res, 200, { report: row?.status === 'complete' ? row.result : null })
    }
    const { front, side } = parseBody(bodySchema, req.body)
    const cached = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
      const prior = await tx.query.scanReservations.findFirst({ where: eq(schema.scanReservations.id, key) })
      if (prior?.status === 'complete') return prior.result
      if (prior?.status === 'pending' && Date.now() - prior.createdAt.getTime() < 120_000) {
        throw new ApiError(409, 'Your Basic report is still processing. Try again shortly.')
      }
      if (prior) {
        await tx.update(schema.scanReservations).set({ status: 'pending', createdAt: new Date(), result: null }).where(eq(schema.scanReservations.id, key))
      } else {
        const [entitlement] = await tx.insert(schema.paymentEntitlements).values({
          userId, mobileInstallId: `account_${userId}`, stripeCheckoutSessionId: key, product: 'evaluation', source: 'web_basic_preview',
        }).returning({ id: schema.paymentEntitlements.id })
        await tx.insert(schema.scanReservations).values({ id: key, userId, entitlementId: entitlement.id, requestHash: key })
      }
      return null
    })
    if (cached) return json(res, 200, cached)
    reservationId = key

    const { capture, entries } = await evaluateV2({ imageDataUrl: front, sideImageDataUrl: side, geometry: null }, { only: basicPreviewRubrics })
    if (!capture.front || !capture.side) throw new ApiError(422, 'Use one clear front photo and one full side profile.')
    const values = Object.fromEntries(basicCategories.flatMap(({ metric }) => {
      const result = entries.find(entry => entry.id === metric.id)
      return result?.value == null ? [] : [[metric.id, formatRubricValue(metric.id, metric.output, result.value)]]
    }))
    if (Object.keys(values).length === 0) throw new ApiError(422, 'The photos didn’t support any clear measurements. Try a brighter, sharper pair.')
    const report: BasicReport = { values }
    await finishEvaluation(key, report, true)
    return json(res, 200, report)
  } catch (error) {
    if (reservationId) await finishEvaluation(reservationId, {}, false).catch(() => {})
    return handleApiError(error, res)
  }
}

export default monitorBackend('web-basic-preview', handler)
