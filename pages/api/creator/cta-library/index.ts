import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { createCreatorCtaLibraryItem, creatorCtaLibrarySubmissionSchema, getCreatorCtaLibrary } from '@/lib/creator/cta-library'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (req.method === 'GET') return json(res, 200, await getCreatorCtaLibrary(session.user.id))
    if (req.method === 'POST') {
      const input = parseBody(creatorCtaLibrarySubmissionSchema, req.body)
      return json(res, 201, { item: await createCreatorCtaLibraryItem(session.user.id, input) })
    }
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
