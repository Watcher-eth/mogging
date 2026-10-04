import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { resolveCreatorAttribution } from '@/lib/creator/attribution'
import { APPLE_CREATOR_MONTHLY_PRODUCT_ID, getCreatorStripeCustomer, isCreatorDiscountEligible } from '@/lib/payments/creator-discount'
import { getStripe } from '@/lib/payments/stripe'
import { enforceRateLimit } from '@/lib/api/rateLimit'

const inputSchema = z.object({ mobileInstallId: z.string().trim().min(8).max(120), attributionToken: z.string().min(40).max(200) })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const accountId = await getRequestUserId(req, res)
    if (!accountId) throw new ApiError(401, 'Sign in to use your creator discount')
    await enforceRateLimit(req, res, { key: `creator_discount:${accountId}`, limit: 20, windowMs: 60_000 })
    const input = parseBody(inputSchema, req.body)
    const attribution = await resolveCreatorAttribution({ token: input.attributionToken, owner: { userId: accountId, mobileInstallId: input.mobileInstallId } })
    let eligible = await isCreatorDiscountEligible(accountId, attribution)
    if (eligible) {
      const customer = await getCreatorStripeCustomer(accountId)
      eligible = !(await getStripe().subscriptions.list({ customer, status: 'all', limit: 1 })).data.length
    }
    return json(res, 200, {
      eligible,
      appleProductId: eligible ? APPLE_CREATOR_MONTHLY_PRODUCT_ID : null,
    })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('payments/creator-discount',handler)
