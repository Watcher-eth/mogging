import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createCreatorAttributionClick } from '@/lib/creator/attribution'
import { creatorPostUrlSchema } from '@/lib/creator/validation'

const source = z.enum(['native_link', 'creator_code']).default('creator_code')
const inputSchema = z.union([
  z.object({ source, slug: z.string().trim().toLowerCase().min(1).max(200).regex(/^[a-z0-9._-]+$/) }),
  z.object({ source, postUrl: creatorPostUrlSchema }),
])

// Public creator codes are not credentials. Only the server can mint signed click tokens.
// This records an explicit referral touch, never an inferred or deferred install.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    await enforceRateLimit(req, res, { key: 'creator_link', limit: 20, windowMs: 60_000 })
    const target = parseBody(inputSchema, req.body)
    const attribution = await createCreatorAttributionClick({ ...target, anonymousActorId: null,
      userAgent: req.headers['user-agent'] || null })
    if (!attribution || attribution.isBot) throw new ApiError(404, 'Creator or submitted post not found. Ask the creator for their account code.')
    return json(res, 200, { url: attribution.deepLinkUrl })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('attribution/link',handler)
