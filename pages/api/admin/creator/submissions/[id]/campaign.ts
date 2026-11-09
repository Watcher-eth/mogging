import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { moveCreatorSubmissions } from '@/lib/admin/move-creator-submissions'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'

const inputSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  formatId: z.string().min(1),
}).strict()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    await requireCreatorAdmin(req, res)
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
      throw new ApiError(403, 'Use the admin campaigns page to move a submission')
    }
    const id = z.string().min(1).parse(req.query.id)
    const input = parseBody(inputSchema, req.body)
    return json(res, 200, await moveCreatorSubmissions({ ...input, submissionIds: [id] }))
  } catch (error) {
    return handleApiError(error, res)
  }
}
