import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import {
  anonymousProfileSchema,
  getAnonymousProfile,
  upsertAnonymousProfile,
} from '@/lib/auth/anonymousProfile'
import { env } from '@/lib/env'
import { getRequestLocation } from '@/lib/geo/request'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (env.AUTH_REQUIRED) {
    return handleApiError(new ApiError(404, 'Anonymous profiles are disabled'), res)
  }

  const anonymousActorId = getOrSetAnonymousActorId(req, res)

  if (req.method === 'GET') {
    try {
      const profile = await getAnonymousProfile(anonymousActorId)
      return json(res, 200, { profile })
    } catch (error) {
      return handleApiError(error, res)
    }
  }

  if (req.method === 'PATCH') {
    try {
      const location = getRequestLocation(req)
      const input = parseBody(anonymousProfileSchema, {
        ...req.body,
        ...(location.country ? location : null),
      })
      const profile = await upsertAnonymousProfile(anonymousActorId, input)
      return json(res, 200, { profile })
    } catch (error) {
      return handleApiError(error, res)
    }
  }

  return methodNotAllowed(res, ['GET', 'PATCH'])
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}
