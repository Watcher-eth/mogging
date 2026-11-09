import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { pslToOverallScore } from '@/lib/analysis/score-scale'
import { getMemberLeaderboard } from '@/lib/users/member-account'

const filters = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  scope: z.enum(['global', 'friends']).default('global'),
  order: z.enum(['score', 'battle']).default('score'),
  gender: z.enum(['all', 'female', 'male']).default('all'),
})

const publicRankings = z.object({
  data: z.object({ total: z.number(), items: z.array(z.object({
    rank: z.number(), name: z.string().nullable(), pslScore: z.number().nullable(),
    displayRating: z.number(), imageUrl: z.string().nullish(),
  })) }),
})

async function previewLeaderboard(page: number, gender: string, battle: boolean) {
  const query = new URLSearchParams({ page: String(page), limit: '25', photoType: 'face', sort: battle ? 'rating' : 'psl', gender })
  try {
    const response = await fetch(`https://www.mogging.com/api/leaderboard/photos?${query}`, { signal: AbortSignal.timeout(6000) })
    if (!response.ok) throw new Error('Public leaderboard unavailable')
    const { data } = publicRankings.parse(await response.json())
    return {
      items: data.items.flatMap(({ name, rank, pslScore, displayRating, imageUrl }) => pslScore != null && pslScore >= 1 && pslScore <= 8
        ? [{
          name: name?.trim() || 'Mogging member', rank, score: pslToOverallScore(pslScore),
          imageUrl: imageUrl && (imageUrl.startsWith('https://') || /^\/(?!\/)/.test(imageUrl))
            ? new URL(imageUrl, 'https://www.mogging.com').href : null,
          ...(battle ? { rating: displayRating } : {}),
        }] : []),
      hasMore: page * 25 < data.total,
    }
  } catch {
    throw new ApiError(502, 'Couldn’t load live Mogging rankings.')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const { page, scope, gender, order } = filters.parse(req.query)
    const battle = order === 'battle'
    if (process.env.NODE_ENV === 'development' && req.query.preview === '1') {
      return json(res, 200, scope === 'global' ? await previewLeaderboard(page, gender, battle) : { items: [], hasMore: false })
    }
    const viewerId = scope === 'friends' ? (await getAuthSession(req, res))?.user?.id : undefined
    if (scope === 'friends' && !viewerId) throw new ApiError(401, 'Sign in to view your friends.')
    return json(res, 200, await getMemberLeaderboard(page, 25, { gender, viewerId, battle }))
  } catch (error) {
    return handleApiError(error, res)
  }
}
