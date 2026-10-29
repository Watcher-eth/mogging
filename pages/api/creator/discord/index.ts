import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { beginDiscordLink, disconnectDiscord, findDiscordLink, requireCreator, requirePortalOrigin } from '@/lib/creator/discord/linking'
import { CALLBACK_PATH, discordConfigured, LINK_COOKIE, portalOrigin } from '@/lib/creator/discord/config'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const userId = session.user.id
    if (req.method === 'GET') return json(res, 200, { configured: discordConfigured(), link: await findDiscordLink(userId) ?? null })
    requirePortalOrigin(req.headers.origin)
    await enforceRateLimit(req, res, { key: 'creator-discord-link', identity: userId, limit: 10, windowMs: 60_000 })
    if (req.method === 'DELETE') { await disconnectDiscord(userId); return json(res, 200, { disconnected: true }) }
    await requireCreator(userId)
    const { state, url } = await beginDiscordLink(userId)
    res.setHeader('Set-Cookie', `${LINK_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=${CALLBACK_PATH}; Max-Age=600${portalOrigin().startsWith('https:') ? '; Secure' : ''}`)
    return json(res, 200, { url })
  } catch (error) { return handleApiError(error, res) }
}
