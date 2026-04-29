import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from 'drizzle-orm'
import { json, methodNotAllowed } from '@/lib/api/http'
import { db } from '@/lib/db'
import { getRuntimeReadiness } from '@/lib/env'
import { getRateLimitBackend } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  const startedAt = Date.now()
  const readiness = getRuntimeReadiness()
  const database = await checkDatabase()
  const ok = readiness.ok && database.ok

  return json(res, ok ? 200 : 503, {
    ok,
    service: 'moggingnew',
    environment: process.env.NODE_ENV ?? 'development',
    latencyMs: Date.now() - startedAt,
    database,
    rateLimit: {
      backend: getRateLimitBackend(),
    },
    config: readiness,
  })
}

async function checkDatabase() {
  try {
    await db.execute(sql`select 1`)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Database connection failed' }
  }
}
