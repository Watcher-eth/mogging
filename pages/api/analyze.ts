import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getAuthSession } from '@/lib/auth/session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const sessionPromise = getAuthSession(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    const session = await sessionPromise
    const result = await analyzeAndSave({
      ...body,
      userId: session?.user?.id ?? null,
    })

    return res.status(result.deduped ? 200 : 201).json(result)
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

