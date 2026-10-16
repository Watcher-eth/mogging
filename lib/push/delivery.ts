import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { prepareApplePush, sendApplePush } from './apns'
import { prepareAndroidPush, sendAndroidPush } from './fcm'

type Device = typeof schema.pushDevices.$inferSelect
export type PushMessage = { kind: string; slot: string; title: string; body: string; target: string; ttlSeconds?: number }

// One delivery owner for reminders and earned rewards. Never log device tokens.
export async function deliverPush(device: Device, message: PushMessage): Promise<'sent' | 'duplicate' | 'failed'> {
  try {
    if (device.environment === 'fcm') await prepareAndroidPush()
    else await prepareApplePush()
  } catch { return 'failed' }
  const claim = { userId: device.userId, kind: message.kind, slot: message.slot }
  const inserted = await db.insert(schema.pushDeliveries).values(claim).onConflictDoNothing().returning()
  if (!inserted.length) return 'duplicate'
  try {
    const send = device.environment === 'fcm' ? sendAndroidPush : sendApplePush
    const result = await send({ ...device, ...message, collapseId: `${message.kind}-${message.slot}` })
    if (result.status === 200) return 'sent'
    console.error('Push rejected notification', { provider: device.environment, status: result.status, reason: result.reason })
    if (result.status === 410 || ['BadDeviceToken','DeviceTokenNotForTopic'].includes(result.reason ?? '')) {
      await db.delete(schema.pushDevices).where(and(eq(schema.pushDevices.installId,device.installId),eq(schema.pushDevices.token,device.token)))
    }
    await db.delete(schema.pushDeliveries).where(and(eq(schema.pushDeliveries.userId,claim.userId),eq(schema.pushDeliveries.kind,claim.kind),eq(schema.pushDeliveries.slot,claim.slot)))
  } catch {
    // Keep an ambiguous transport result reserved; retrying could send a duplicate.
    console.error('Push transport failed; delivery is uncertain', { kind: message.kind })
  }
  return 'failed'
}
