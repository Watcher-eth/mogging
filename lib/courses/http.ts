import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export function siteUrl() {
  const value = env.NEXTAUTH_URL || env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new ApiError(503, 'Site URL is not configured')
  return new URL(value).origin
}
export async function courseUser(req: NextApiRequest, res: NextApiResponse) {
  const session = await getAuthSession(req, res)
  if (!session?.user?.id) throw new ApiError(401, 'Sign in to continue')
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id) })
  if (!user) throw new ApiError(401, 'Account not found')
  return user
}
export function courseApi(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try {
      if (!env.COURSES_ENABLED) throw new ApiError(404, 'Courses are not enabled')
      // Cookie-authenticated writes must originate on our own site. Server clients may omit Origin.
      if (!['GET', 'HEAD'].includes(req.method || '') && req.headers.origin && req.headers.origin !== siteUrl()) throw new ApiError(403, 'Invalid request origin')
      if (req.headers['sec-fetch-site'] === 'cross-site' && req.method !== 'GET') throw new ApiError(403, 'Cross-site writes are not allowed')
      await enforceRateLimit(req, res, { key: 'courses-api', limit: 120, windowMs: 60_000 })
      await handler(req, res)
    } catch (error) {
      const cause = (error as { cause?: { code?: string } })?.cause
      handleApiError(cause?.code === '23505' ? new ApiError(409, 'This handle, course slug, or Stripe connection is already in use') : error, res)
    }
  }
}
export function pathOf(req: NextApiRequest) { return Array.isArray(req.query.path) ? req.query.path : [] }
export function sendThumbnail(res: NextApiResponse, thumbnail: { body: Buffer; type: string }) {
  res.setHeader('Content-Type', thumbnail.type)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Vary', 'Cookie')
  return res.status(200).send(thumbnail.body)
}
