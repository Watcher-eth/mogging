import type { NextApiRequest, NextApiResponse } from 'next'
import { and, desc, eq, gt, gte, lte, sql } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { creatorProgramLaunch, type CreatorNotificationsFeed } from '@/lib/creator/announcements'
import { campaignAccessSql } from '@/lib/creator/campaign-access-sql'
import { getCreatorSubmissionNotifications } from '@/lib/creator/submission-messages'
import { db, schema } from '@/lib/db'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    const profile = await db.query.creatorProfiles.findFirst({
      columns: { id: true },
      where: eq(schema.creatorProfiles.userId, session.user.id),
    })
    const campaign = schema.creatorSprints
    const now = new Date()
    const latestLaunch = new Date(Math.max(Date.parse(creatorProgramLaunch.publishedAt), now.getTime() - 30 * 86_400_000))
    const launchedAt = sql<Date>`greatest(${campaign.startsAt}, ${campaign.createdAt})`.mapWith(campaign.startsAt)
    const [launches, messages] = await Promise.all([
      db.select({ id: campaign.id, name: campaign.name, launchedAt })
        .from(campaign)
        .where(and(eq(campaign.status, 'published'), lte(campaign.startsAt, now), gt(campaign.endsAt, now), gte(launchedAt, sql.param(latestLaunch, campaign.startsAt)), campaignAccessSql(profile?.id)))
        .orderBy(desc(launchedAt), desc(campaign.id))
        .limit(20),
      profile ? getCreatorSubmissionNotifications(profile.id) : [],
    ])

    const announcements: CreatorNotificationsFeed['announcements'] = launches.map(launch => ({
      id: `campaign:${launch.id}`,
      title: launch.name,
      description: 'A new campaign is open for submissions.',
      publishedAt: launch.launchedAt.toISOString(),
      href: `/creator/sprints?id=${encodeURIComponent(launch.id)}`,
    }))
    announcements.push(creatorProgramLaunch)
    return json(res, 200, { announcements, messages })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/announcements', handler)
