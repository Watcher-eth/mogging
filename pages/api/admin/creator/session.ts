import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import {
  clearCreatorAdminUnlock,
  hasCreatorAdminUnlock,
  requireCreatorAdmin,
  setCreatorAdminUnlock,
  verifyCreatorAdminPassword,
} from '@/lib/admin/creator-auth'

const passwordSchema = z.object({ password: z.string().min(1).max(256) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { email } = await requireCreatorAdmin(req, res, { requireUnlock: false })
      return json(res, 200, { unlocked: hasCreatorAdminUnlock(req, email), email })
    }

    if (req.method === 'POST') {
      await enforceRateLimit(req, res, { key: 'creator_admin_unlock', limit: 5, windowMs: 15 * 60 * 1000 })
      const { email } = await requireCreatorAdmin(req, res, { requireUnlock: false })
      const input = parseBody(passwordSchema, req.body)
      if (!verifyCreatorAdminPassword(input.password)) throw new ApiError(401, 'Incorrect admin password')
      setCreatorAdminUnlock(res, email)
      return json(res, 200, { unlocked: true, email })
    }

    if (req.method === 'DELETE') {
      await requireCreatorAdmin(req, res, { requireUnlock: false })
      clearCreatorAdminUnlock(res)
      return json(res, 200, { unlocked: false })
    }

    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
