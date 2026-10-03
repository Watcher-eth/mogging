import type { NextApiRequest, NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import {
  handleApiError,
  json,
  methodNotAllowed,
  parseBody,
} from '@/lib/api/http'
import {
  listCreatorSprints,
  saveCreatorSprint,
} from '@/lib/creator/sprint-service'
import { sprintInputSchema } from '@/lib/creator/sprints'
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await requireCreatorAdmin(req, res)
    if (req.method === 'GET')
      return json(res, 200, { sprints: await listCreatorSprints(true) })
    if (req.method === 'POST')
      return json(res, 200, {
        sprint: await saveCreatorSprint(parseBody(sprintInputSchema, req.body)),
      })
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
