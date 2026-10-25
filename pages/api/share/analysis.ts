import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import {
  createAnalysisShare,
  createAnalysisShareSchema,
  SharingServiceError,
} from '@/lib/sharing/service'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const userId = await getRequestUserId(req, res)
    const anonymousActorId = userId ? null : getOrSetAnonymousActorId(req, res)
    const input = parseBody(createAnalysisShareSchema, {
      ...req.body,
      ownerUserId: userId,
      ownerAnonymousActorId: anonymousActorId,
    })
    const result = await createAnalysisShare(input)

    // Build 76 reads the token at the top level; newer clients use the data envelope.
    return res.status(result.existing ? 200 : 201).json({ data: result, share: result.share })
  } catch (error) {
    if (error instanceof SharingServiceError) {
      return handleApiError(new ApiError(error.status, error.message), res)
    }

    return handleApiError(error, res)
  }
}

export default monitorBackend('share/analysis',handler)
