import { monitorBackend, setBackendOutcome } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createCreatorAttributionClick } from '@/lib/creator/attribution'
import { creatorLinkInputSchema } from '@/lib/creator/link-input'

// Public creator codes are not credentials. Only the server can mint signed click tokens.
// This records an explicit referral touch, never an inferred or deferred install.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    await enforceRateLimit(req, res, { key: 'creator_link', limit: 20, windowMs: 60_000 })
    const target = parseBody(creatorLinkInputSchema, req.body)
    const attribution = await createCreatorAttributionClick({ ...target, anonymousActorId: null,
      userAgent: req.headers['user-agent'] || null })
    if (!attribution || attribution.isBot) {
      setBackendOutcome(res, { outcome: 'rejected', code: attribution?.isBot ? 'creator_link_bot' : 'postUrl' in target ? 'creator_post_not_found' : 'creator_code_not_found', alert: false })
      throw new ApiError(404, 'Creator or submitted post not found. Ask the creator for their account code.')
    }
    setBackendOutcome(res, { outcome: 'ok', code: 'postUrl' in target ? 'creator_post_resolved' : 'creator_code_resolved', alert: false })
    return json(res, 200, { url: attribution.deepLinkUrl })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('attribution/link',handler)
