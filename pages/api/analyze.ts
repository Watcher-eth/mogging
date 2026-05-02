import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAnonymousProfile } from '@/lib/auth/anonymousProfile'
import { getAuthSession } from '@/lib/auth/session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { env } from '@/lib/env'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60 * 60 * 1000 })
    const sessionPromise = getAuthSession(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    const session = await sessionPromise
    if (env.AUTH_REQUIRED && !session?.user?.id) {
      throw new ApiError(401, 'Authentication required')
    }

    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    const anonymousProfile = anonymousActorId ? await getAnonymousProfile(anonymousActorId) : null

    const result = await analyzeAndSave({
      ...body,
      userId: session?.user?.id ?? null,
      anonymousActorId,
      name: body.name ?? anonymousProfile?.name ?? null,
      caption: body.caption ?? anonymousProfile?.social ?? null,
    })

    return json(res, result.deduped ? 200 : 201, result)
  } catch (error) {
    return handleApiError(error, res)
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
