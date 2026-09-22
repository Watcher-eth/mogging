import type { NextApiRequest, NextApiResponse } from 'next'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

const identity = z.object({ installId: z.string().min(16).max(100) })
const registration = identity.extend({
  token: z.string().regex(/^[a-f0-9]{32,512}$/),
  environment: z.enum(['sandbox', 'production']),
  timezone: z.string().max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }),
  protocolDays: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tasks: z.array(z.object({ id: z.string().min(1).max(200), title: z.string().trim().min(1).max(180), completed: z.boolean() })).max(10),
  })).max(40).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'PUT' && req.method !== 'DELETE') return methodNotAllowed(res, ['PUT', 'DELETE'])
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    const session = bearer ? await db.query.sessions.findFirst({
      where: and(eq(schema.sessions.sessionToken, bearer), gt(schema.sessions.expires, new Date())),
      columns: { userId: true, expires: true },
    }) : null
    if (!session) throw new ApiError(401, 'Sign in to manage notifications')
    const userId = session.userId
    await enforceRateLimit(req, res, { key: 'push_device', limit: 120, windowMs: 60_000 })
    if (req.method === 'DELETE') {
      const { installId } = identity.parse(req.body)
      await db.delete(schema.pushDevices).where(and(eq(schema.pushDevices.installId, installId), eq(schema.pushDevices.userId, userId)))
    } else {
      const input = registration.parse(req.body)
      await db.transaction(async tx => {
        // A rotated token, reinstall, or account switch has exactly one owner.
        await tx.delete(schema.pushDevices).where(eq(schema.pushDevices.token, input.token))
        await tx.insert(schema.pushDevices).values({ ...input, userId, sessionExpiresAt: session.expires }).onConflictDoUpdate({
          target: schema.pushDevices.installId,
          set: { ...input, userId, sessionExpiresAt: session.expires, protocolDays: input.protocolDays ?? [], updatedAt: new Date() },
        })
      })
    }
    return json(res, 200, { ok: true })
  } catch (error) { return handleApiError(error, res) }
}
