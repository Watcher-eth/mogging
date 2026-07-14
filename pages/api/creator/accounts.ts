import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  addCreatorSocialAccount,
  creatorSocialAccountSchema,
  getCreatorDashboard,
  removeCreatorSocialAccount,
} from '@/lib/creator/service'

const deleteAccountSchema = z.object({ id: z.string().uuid() })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    if (req.method === 'GET') {
      const dashboard = await getCreatorDashboard(session.user.id)
      return json(res, 200, { socialAccounts: dashboard.socialAccounts })
    }
    if (req.method === 'POST') {
      const input = parseBody(creatorSocialAccountSchema, req.body)
      return json(res, 201, { account: await addCreatorSocialAccount(session.user.id, input) })
    }
    if (req.method === 'DELETE') {
      const input = parseBody(deleteAccountSchema, req.query)
      return json(res, 200, { account: await removeCreatorSocialAccount(session.user.id, input.id) })
    }
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
