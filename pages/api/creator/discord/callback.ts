import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { consumeDiscordState, finishDiscordLink, verifyLinkState } from '@/lib/creator/discord/linking'
import { CALLBACK_PATH, LINK_COOKIE, LINK_PATH, portalOrigin } from '@/lib/creator/discord/config'
import { methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Set-Cookie', `${LINK_COOKIE}=; HttpOnly; SameSite=Lax; Path=${CALLBACK_PATH}; Max-Age=0${portalOrigin().startsWith('https:') ? '; Secure' : ''}`)
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) return res.redirect(303, `${LINK_PATH}?error=expired`)
    const state = verifyLinkState(req.query.state, req.cookies[LINK_COOKIE])
    await consumeDiscordState(state, session.user.id)
    if (req.query.error) return res.redirect(303, `${LINK_PATH}?error=cancelled`)
    if (typeof req.query.code !== 'string' || req.query.code.length > 2000) return res.redirect(303, `${LINK_PATH}?error=expired`)
    await finishDiscordLink(req.query.code, session.user.id)
    return res.redirect(303, `${LINK_PATH}?connected=1`)
  } catch (error) {
    // Never log authorization codes, credentials, or Discord response bodies.
    return res.redirect(303, `${LINK_PATH}?error=${error instanceof Error && 'status' in error && error.status === 409 ? 'conflict' : 'failed'}`)
  }
}
