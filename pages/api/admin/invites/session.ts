import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import {
  clearInviteAdminUnlock,
  hasInviteAdminUnlock,
  isInviteAdminConfigured,
  setInviteAdminUnlock,
  verifyInviteAdminCode,
} from '@/lib/admin/invite-auth'

const codeSchema = z.object({ code: z.string().min(1).max(256) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      return json(res, 200, {
        configured: isInviteAdminConfigured(),
        unlocked: hasInviteAdminUnlock(req),
      })
    }

    if (req.method === 'POST') {
      await enforceRateLimit(req, res, { key: 'invite_admin_unlock', limit: 8, windowMs: 15 * 60 * 1000 })
      const input = parseBody(codeSchema, req.body)
      if (!verifyInviteAdminCode(input.code)) throw new ApiError(401, 'Incorrect admin code')
      setInviteAdminUnlock(res)
      return json(res, 200, { configured: true, unlocked: true })
    }

    if (req.method === 'DELETE') {
      clearInviteAdminUnlock(res)
      return json(res, 200, { configured: isInviteAdminConfigured(), unlocked: false })
    }

    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
