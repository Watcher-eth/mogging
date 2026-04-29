import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  createAnalysisShare,
  createAnalysisShareSchema,
  SharingServiceError,
} from '@/lib/sharing/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const session = await getAuthSession(req, res)
    const input = parseBody(createAnalysisShareSchema, {
      ...req.body,
      ownerUserId: session?.user?.id ?? null,
    })
    const result = await createAnalysisShare(input)

    return res.status(result.existing ? 200 : 201).json(result)
  } catch (error) {
    if (error instanceof SharingServiceError) {
      return handleApiError(new ApiError(error.status, error.message), res)
    }

    return handleApiError(error, res)
  }
}

