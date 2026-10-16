import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { reminderFor, PUSH_HOUR, PUSH_WEEKDAYS } from '@/lib/push/schedule'
import { deliverPush } from '@/lib/push/delivery'
import { recordServerEvent } from '@/lib/analytics/events'

export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`)
    const actual = Buffer.from(req.headers.authorization ?? '')
    if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(401, 'Unauthorized')
    const now = new Date()
    const started = Date.now()
    let cursor = ''
    let sent = 0
    let failed = 0
    let partial = false
    const latestDevices = db.selectDistinctOn([schema.pushDevices.userId]).from(schema.pushDevices)
      .orderBy(asc(schema.pushDevices.userId), desc(schema.pushDevices.updatedAt), desc(schema.pushDevices.installId)).as('latest_push_device')
    // Reward notifications are independent of the weekly reminder hour. An unspent
    // reward plus the unique delivery claim acts as the durable notification queue.
    const rewards = await db.select({ device: { installId: latestDevices.installId, userId: latestDevices.userId, token: latestDevices.token, environment: latestDevices.environment, timezone: latestDevices.timezone, sessionExpiresAt: latestDevices.sessionExpiresAt, protocolDays: latestDevices.protocolDays, updatedAt: latestDevices.updatedAt }, rewardId: schema.paymentEntitlements.id }).from(latestDevices)
      .innerJoin(schema.paymentEntitlements,eq(schema.paymentEntitlements.userId,latestDevices.userId))
      .where(and(gt(latestDevices.sessionExpiresAt,now),eq(schema.paymentEntitlements.source,'referral_reward'),
        gt(schema.paymentEntitlements.creditBalance,0),
        gt(schema.paymentEntitlements.createdAt,new Date(now.getTime()-30*86400_000)),
        sql`not exists(select 1 from ${schema.pushDeliveries} where ${schema.pushDeliveries.userId}=${latestDevices.userId}
          and ${schema.pushDeliveries.kind}='referral_reward' and ${schema.pushDeliveries.slot}=${schema.paymentEntitlements.id})`))
      .orderBy(asc(schema.paymentEntitlements.createdAt)).limit(100)
    for(let offset=0;offset<rewards.length && Date.now()-started<20_000;offset+=10) {
      await Promise.all(rewards.slice(offset,offset+10).map(async ({device,rewardId})=>{
        const result=await deliverPush(device,{kind:'referral_reward',slot:rewardId,title:'Your free scan is unlocked',
          body:'Your three friends joined. Your full face scan is ready—open Mogging to use it.',target:'scan_reward',ttlSeconds:86400})
        if(result==='sent') {
          sent++
          await recordServerEvent({eventName:'referral_reward_notification_sent',accountId:device.userId,source:'push',properties:{surface:'referral_reward'}})
        }
        if(result==='failed') failed++
      }))
    }
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
          const result = await deliverPush(device, reminder)
          if (result === 'sent') sent++
          if (result === 'failed') failed++
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
export default monitorBackend('cron/push-reminders',handler)
