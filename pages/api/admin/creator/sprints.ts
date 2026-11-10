import { db, schema } from '@/lib/db'
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm'
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
      if (req.query.view === 'move' && process.env.PORTAL_SCOPED_READS_DISABLED !== '1') {
        const campaign = schema.creatorSprints
        const now = new Date()
        const sprints = await db.select({
          id: campaign.id, name: campaign.name, status: campaign.status, audience: campaign.audience,
          startsAt: campaign.startsAt, endsAt: campaign.endsAt, terms: campaign.terms,
        }).from(campaign).where(and(eq(campaign.status, 'published'), lte(campaign.startsAt, now), gt(campaign.endsAt, now)))
          .orderBy(desc(campaign.startsAt), asc(campaign.name))
        return json(res, 200, { sprints })
      }
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
