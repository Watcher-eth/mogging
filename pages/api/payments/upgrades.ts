import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { getEntitlementSummary, syncRevenueCatScans } from '@/lib/payments/entitlements'
import { scanProducts, readRevenueCatScanPurchases } from '@/lib/payments/revenuecat'

const inputSchema = z.object({
  mobileInstallId: z.string().trim().min(8).max(120),
  transactionId: z.string().min(1).max(300).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to view your upgrades')
    if (!env.REVENUECAT_SECRET_API_KEY) throw new ApiError(503, 'Purchases are temporarily unavailable. Please try again later.')
    if (req.method === 'GET') return json(res, 200, { products: scanProducts })
    const input = parseBody(inputSchema, req.body)
    const subscriber = await syncRevenueCatScans(userId, input.mobileInstallId)
    if (input.transactionId) {
      const purchase = readRevenueCatScanPurchases(subscriber).find((item) =>
        !item.refunded && (item.transactionId === input.transactionId || item.key === `revenuecat:${input.transactionId}`)
      )
      const credit = purchase ? await db.query.paymentEntitlements.findFirst({
        where: and(eq(schema.paymentEntitlements.stripeCheckoutSessionId, purchase.key), eq(schema.paymentEntitlements.userId, userId)),
        columns: { id: true, subscriptionStatus: true },
      }) : null
      if (!credit || credit.subscriptionStatus === 'refunded') throw new ApiError(409, 'Your purchase is still being confirmed. Retry to update your balance; you will not be charged again.')
    }
    return json(res, 200, {
      entitlements: await getEntitlementSummary({ userId, mobileInstallId: input.mobileInstallId }, subscriber),
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
