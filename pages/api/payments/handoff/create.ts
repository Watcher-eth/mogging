import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { createPaymentHandoff } from '@/lib/payments/handoff'

const createHandoffSchema = z.object({
  sessionId: z.string().trim().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(createHandoffSchema, req.body)
    const accountId = await getRequestUserId(req, res)
    if (!accountId) throw new ApiError(401, 'Sign in to continue this purchase')

    const handoff = await createPaymentHandoff({
      sessionId: input.sessionId,
      accountId,
    })
    return json(res, 200, handoff)
  } catch (error) {
    return handleApiError(error, res)
  }
}
