import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { revokeTikTokAccess } from '@/lib/auth/tiktok-api'
import { env } from '@/lib/env'
import {
  addCreatorSocialAccount,
  creatorAccountAnalyticsSubmissionSchema,
  creatorSocialAccountSchema,
  getCreatorDashboard,
  getCreatorTikTokAccessToken,
  removeCreatorSocialAccount,
  submitCreatorAccountAnalyticsEvidence,
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
    if (req.method === 'PATCH') {
      const input = parseBody(creatorAccountAnalyticsSubmissionSchema, req.body)
      return json(res, 200, { account: await submitCreatorAccountAnalyticsEvidence(session.user.id, input) })
    }
    if (req.method === 'DELETE') {
      const input = parseBody(deleteAccountSchema, req.query)
      const accessToken = await getCreatorTikTokAccessToken(session.user.id, input.id)
      const account = await removeCreatorSocialAccount(session.user.id, input.id)
      if (accessToken && env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET) {
        await revokeTikTokAccess(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET, accessToken).catch((error) => {
          console.warn('Could not revoke TikTok creator access', error instanceof Error ? error.message : error)
        })
      }
      return json(res, 200, { account })
    }
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
