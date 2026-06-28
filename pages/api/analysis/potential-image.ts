import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { generatePotentialImage, potentialImageInputSchema } from '@/lib/analysis/potential-image'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const startedAt = Date.now()
  try {
    await enforceRateLimit(req, res, { key: 'potential-image', limit: 6, windowMs: 60 * 60 * 1000 })
    const body = parseBody(potentialImageInputSchema, req.body)
    const result = await generatePotentialImage(body)

    console.info('potential-image:finish', {
      elapsedMs: Date.now() - startedAt,
      model: result.model,
      stored: Boolean(result.imageUrl),
    })

    return json(res, 201, result)
  } catch (error) {
    console.error('potential-image:error', {
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    })
    return handleApiError(error, res)
  }
}

export const config = {
  maxDuration: 90,
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
