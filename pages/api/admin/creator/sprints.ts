import { db, schema } from '@/lib/db'
import { asc } from 'drizzle-orm'
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
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method === 'GET') {
      const [sprints, creators] = await Promise.all([listCreatorSprints(true), db.select({ id: schema.creatorProfiles.id, displayName: schema.creatorProfiles.displayName, socialHandle: schema.creatorProfiles.socialHandle }).from(schema.creatorProfiles).orderBy(asc(schema.creatorProfiles.displayName))])
      return json(res, 200, { sprints, creators })
    }
    if (req.method === 'POST')
      return json(res, 200, {
        sprint: await saveCreatorSprint(parseBody(sprintInputSchema, req.body)),
      })
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
