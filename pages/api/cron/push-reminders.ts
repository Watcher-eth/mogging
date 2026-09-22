import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { reminderFor, PUSH_HOUR, PUSH_WEEKDAYS } from '@/lib/push/schedule'
import { prepareApplePush, sendApplePush } from '@/lib/push/apns'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`)
    const actual = Buffer.from(req.headers.authorization ?? '')
    if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(401, 'Unauthorized')
    await prepareApplePush()
    const now = new Date()
    const started = Date.now()
    let cursor = ''
    let sent = 0
    let failed = 0
    let partial = false
    const latestDevices = db.selectDistinctOn([schema.pushDevices.userId]).from(schema.pushDevices)
      .orderBy(asc(schema.pushDevices.userId), desc(schema.pushDevices.updatedAt), desc(schema.pushDevices.installId)).as('latest_push_device')
    // Keyset pagination; each account receives a reminder on its most recently active device.
    while (Date.now() - started < 40_000) {
      const devices = await db.select().from(latestDevices)
        .where(and(
          gt(latestDevices.userId, cursor), gt(latestDevices.sessionExpiresAt, now),
          sql`extract(hour from (${now.toISOString()}::timestamptz at time zone ${latestDevices.timezone})) = ${PUSH_HOUR}`,
          sql`extract(isodow from (${now.toISOString()}::timestamptz at time zone ${latestDevices.timezone})) in (${sql.join(Object.values(PUSH_WEEKDAYS).map(day => sql`${day}`), sql`, `)})`,
          sql`not exists (select 1 from ${schema.pushDeliveries} where ${schema.pushDeliveries.userId} = ${latestDevices.userId}
            and ${schema.pushDeliveries.slot} = to_char(${now.toISOString()}::timestamptz at time zone ${latestDevices.timezone}, 'YYYY-MM-DD'))`,
        ))
        .orderBy(asc(latestDevices.userId)).limit(100)
      if (!devices.length) break
      for (let offset = 0; offset < devices.length; offset += 10) {
        if (Date.now() - started >= 40_000) { partial = true; break }
        await Promise.all(devices.slice(offset, offset + 10).map(async device => {
          const reminder = reminderFor(now, device.timezone, device.protocolDays)
          if (!reminder) return
          const claim = { userId: device.userId, kind: reminder.kind, slot: reminder.slot }
          const inserted = await db.insert(schema.pushDeliveries).values(claim).onConflictDoNothing().returning()
          if (!inserted.length) return
          // Reserve before sending: concurrent/repeated cron runs cannot duplicate a push.
          // An ambiguous transport failure stays reserved rather than risking duplicate delivery.
          try {
            const result = await sendApplePush({ ...device, ...reminder, collapseId: `${reminder.kind}-${reminder.slot}` })
            if (result.status === 200) { sent++; return }
            failed++
            console.error('APNs rejected reminder', { status: result.status, reason: result.reason })
            if (result.status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(result.reason ?? '')) {
              await db.delete(schema.pushDevices).where(and(eq(schema.pushDevices.installId, device.installId), eq(schema.pushDevices.token, device.token)))
            }
            // Definite rejections may be retried by the next run after configuration/service recovery.
            await db.delete(schema.pushDeliveries).where(and(eq(schema.pushDeliveries.userId, claim.userId), eq(schema.pushDeliveries.kind, claim.kind), eq(schema.pushDeliveries.slot, claim.slot)))
          } catch (error) {
            failed++
            console.error('APNs transport failed; delivery is uncertain', error instanceof Error ? error.message : 'Unknown error')
          }
        }))
      }
      if (partial) break
      cursor = devices[devices.length - 1].userId
      if (devices.length < 100) break
      partial = Date.now() - started >= 40_000
    }
    await db.delete(schema.pushDeliveries).where(lt(schema.pushDeliveries.createdAt, new Date(now.getTime() - 35 * 86400_000)))
    return json(res, failed ? 502 : 200, { sent, failed, partial })
  } catch (error) { return handleApiError(error, res) }
}
