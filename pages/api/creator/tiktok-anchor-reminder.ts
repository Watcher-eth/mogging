import type { NextApiRequest, NextApiResponse } from 'next'
import { Redis } from '@upstash/redis'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { accountFollowers, tiktokAnchorReminderAccount } from '@/lib/creator/tiktok-anchor'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
  : null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const profile = await db.query.creatorProfiles.findFirst({
      where: eq(schema.creatorProfiles.userId, session.user.id),
      columns: { id: true, authStatus: true },
    })
    if (!profile || profile.authStatus === 'suspended' || !redis) return json(res, 200, { accountId: null })
    const accounts = await db.query.creatorSocialAccounts.findMany({
      where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
      columns: { id: true, platform: true, followers: true, oauthProfile: true, oauthVerifiedAt: true, tiktokAnchorJoinedAt: true },
      orderBy: (account, { desc }) => [desc(account.createdAt)],
    })
    const account = tiktokAnchorReminderAccount(accounts.map(item => ({ ...item, followers: accountFollowers(item) })))
    const claimed = account && await redis.set(`creator:tiktok-anchor-reminder:${profile.id}`, true, { nx: true, ex: 86400 })
    return json(res, 200, { accountId: claimed ? account.id : null })
  } catch (error) {
    return handleApiError(error, res)
  }
}
