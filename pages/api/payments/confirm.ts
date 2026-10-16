import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { confirmCheckoutForAccount, getEntitlementSummary } from '@/lib/payments/entitlements'
import { monitorBackend } from '@/lib/reliability/monitor'

const inputSchema = z.object({ sessionId: z.string().trim().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/) })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { sessionId } = parseBody(inputSchema, req.body)
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in with the account used at checkout')
    const entitlement = await confirmCheckoutForAccount(sessionId, userId)
    return json(res, 200, { entitlements: await getEntitlementSummary({ userId, mobileInstallId: entitlement.mobileInstallId }) })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('payments/confirm', handler)
