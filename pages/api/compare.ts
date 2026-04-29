import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
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

      return res.status(200).json(pair)
    } catch (error) {
      if (error instanceof RatingServiceError) {
        return handleApiError(new ApiError(error.status, error.message), res)
      }

      return handleApiError(error, res)
    }
  }

  if (req.method === 'POST') {
    try {
      const session = await getAuthSession(req, res)
      const body = parseBody(submitVoteSchema, {
        ...req.body,
        voterUserId: session?.user?.id ?? null,
      })
      const result = await submitComparisonVote(body)

      return res.status(200).json(result)
    } catch (error) {
      if (error instanceof RatingServiceError) {
        return handleApiError(new ApiError(error.status, error.message), res)
      }

      return handleApiError(error, res)
    }
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}
