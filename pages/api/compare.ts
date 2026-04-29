import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import {
  pairSelectionSchema,
  RatingServiceError,
  selectComparisonPair,
  submitComparisonVote,
  submitVoteSchema,
} from '@/lib/ratings/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const query = pairSelectionSchema.parse({
        gender: typeof req.query.gender === 'string' ? req.query.gender : 'all',
        photoType: typeof req.query.photoType === 'string' ? req.query.photoType : 'face',
      })
      const pair = await selectComparisonPair(query)

      return json(res, 200, pair)
    } catch (error) {
      if (error instanceof RatingServiceError) {
        return handleApiError(new ApiError(error.status, error.message), res)
      }

      return handleApiError(error, res)
    }
  }

  if (req.method === 'POST') {
    try {
      await enforceRateLimit(req, res, { key: 'compare_vote', limit: 120, windowMs: 60 * 1000 })
      const session = await getAuthSession(req, res)
      const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
      const body = parseBody(submitVoteSchema, {
        ...req.body,
        voterUserId: session?.user?.id ?? null,
        anonymousActorId,
      })
      const result = await submitComparisonVote(body)

      return json(res, 200, result)
    } catch (error) {
      if (error instanceof RatingServiceError) {
        return handleApiError(new ApiError(error.status, error.message), res)
      }

      return handleApiError(error, res)
    }
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}
