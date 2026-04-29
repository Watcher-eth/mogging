import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getAuthSession } from '@/lib/auth/session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60 * 60 * 1000 })
    const sessionPromise = getAuthSession(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    const session = await sessionPromise
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    const result = await analyzeAndSave({
      ...body,
      userId: session?.user?.id ?? null,
      anonymousActorId,
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
