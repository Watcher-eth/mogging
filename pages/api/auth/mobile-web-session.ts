import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { createMobileWebSession, consumeMobileWebSession } from '@/lib/auth/mobile-web-session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])
  try {
    if (req.method === 'POST') {
      if (!req.headers.authorization?.startsWith('Bearer ')) throw new ApiError(401, 'Sign in to open your account')
      const userId = await getRequestUserId(req, res)
      if (!userId) throw new ApiError(401, 'Sign in to open your account')
      await enforceRateLimit(req, res, { key: 'mobile_web_session', identity: userId, limit: 30, windowMs: 60 * 60_000 })
      const code = await createMobileWebSession(userId)
      return json(res, 200, { path: `/api/auth/mobile-web-session?code=${code}` })
    }
    await enforceRateLimit(req, res, { key: 'mobile_web_session_consume', limit: 60, windowMs: 60_000 })
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const { token, maxAge } = await consumeMobileWebSession(code)
    const secure = process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://')
    const name = `${secure ? '__Secure-' : ''}next-auth.session-token`
    res.setHeader('Set-Cookie', `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
    res.redirect(303, '/app/home')
    return
  } catch (error) {
    if (req.method === 'GET' && error instanceof ApiError && error.status === 401) {
      res.redirect(303, '/app/home')
      return
    }
    return handleApiError(error, res)
  }
}
