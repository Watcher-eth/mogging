import { and, eq, lt, isNull, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { courseOrders, courseAssets, courseEmails, courseRefunds, courses } from './schema'
import { syncOrder, ensureCheckout, refundOrder } from './commerce'
import { syncAsset, purgeAsset } from './media'
import { sendCourseEmail } from './identity'
import { siteUrl } from './http'
import { assetIdsOf } from './validation'

export async function maintainCourses() {
  const deadline = Date.now() + 40_000
  const result = { orders: 0, refunds: 0, assets: 0, emails: 0, failures: 0 }
  // Bounded work keeps each scheduled run predictable; failures remain eligible for retry.
  const orders = await db.select().from(courseOrders).where(or(and(eq(courseOrders.state, 'pending'), lt(courseOrders.updatedAt, new Date(Date.now() - 120_000))), and(eq(courseOrders.state, 'paid'), lt(courseOrders.updatedAt, new Date(Date.now() - 86400_000))))).orderBy(courseOrders.updatedAt).limit(3)
  for (const order of orders) {
    if (Date.now() > deadline) break
    try {
      if (order.stripeCheckoutId) await syncOrder(order.id)
      else await ensureCheckout(order)
      result.orders++
    } catch { result.failures++; await db.update(courseOrders).set({ updatedAt: new Date() }).where(eq(courseOrders.id, order.id)) }
  }
  const refunds = await db.select({ refund: courseRefunds, sellerId: courseOrders.sellerId }).from(courseRefunds).innerJoin(courseOrders, eq(courseRefunds.orderId, courseOrders.id)).where(and(inArray(courseRefunds.state, ['requested', 'pending']), lt(courseRefunds.updatedAt, new Date(Date.now() - 120_000)))).orderBy(courseRefunds.updatedAt).limit(3)
  for (const { refund, sellerId } of refunds) {
    if (Date.now() > deadline) break
    try { await refundOrder(sellerId, refund.orderId, refund.requestKey, refund.amount); result.refunds++ }
    catch { result.failures++; await db.update(courseRefunds).set({ updatedAt: new Date() }).where(eq(courseRefunds.id, refund.id)) }
  }
  const assets = await db.select().from(courseAssets).where(and(inArray(courseAssets.state, ['pending', 'processing', 'failed', 'deleted']), lt(courseAssets.updatedAt, new Date(Date.now() - 300_000)), or(sql`${courseAssets.bunnyVideoId} is not null`, sql`${courseAssets.storageKey} is not null`))).orderBy(courseAssets.updatedAt).limit(3)
  for (const asset of assets) {
    if (Date.now() > deadline) break
    try {
      if (asset.state === 'deleted') await purgeAsset(asset)
      else if (asset.uploadExpiresAt.getTime() < Date.now() - 86400_000) {
        // Serialize against draft saves/publishing before marking an abandoned upload deleted.
        const abandoned = await db.transaction(async tx => {
          const [course] = await tx.select().from(courses).where(eq(courses.id, asset.courseId)).for('update')
          const referenced = assetIdsOf(course.draft).includes(asset.id) || (course.published && assetIdsOf(course.published).includes(asset.id))
          if (referenced) return false
          const [updated] = await tx.update(courseAssets).set({ state: 'deleted', updatedAt: new Date() }).where(and(eq(courseAssets.id, asset.id), inArray(courseAssets.state, ['pending', 'processing', 'failed']))).returning()
          return Boolean(updated)
        })
        if (abandoned) await purgeAsset({ ...asset, state: 'deleted' })
        else if (asset.state !== 'failed') await syncAsset(asset)
      } else if (asset.state !== 'failed') await syncAsset(asset)
      result.assets++
    } catch { result.failures++; await db.update(courseAssets).set({ updatedAt: new Date() }).where(eq(courseAssets.id, asset.id)) }
  }
  const emails = await db.select().from(courseEmails).where(and(isNull(courseEmails.sentAt), lt(courseEmails.nextAttemptAt, new Date()))).orderBy(courseEmails.nextAttemptAt).limit(3)
  for (const email of emails) {
    if (Date.now() > deadline) break
    try {
      const order = await db.query.courseOrders.findFirst({ where: eq(courseOrders.id, email.orderId) })
      if (!order || order.state !== 'paid' || order.disputed) { await db.update(courseEmails).set({ sentAt: new Date() }).where(eq(courseEmails.id, email.id)); continue }
      await sendCourseEmail(email.to, `Your course is ready: ${order.courseTitle}`, `You have access to ${order.courseTitle}.\n\nOpen your library: ${siteUrl()}/courses/library\n\nOrder: ${order.id}\nRefund policy: ${order.refundPolicy}`, `course-receipt-${order.id}`)
      await db.update(courseEmails).set({ sentAt: new Date(), attempts: email.attempts + 1 }).where(eq(courseEmails.id, email.id))
      result.emails++
    } catch {
      result.failures++
      await db.update(courseEmails).set({ attempts: email.attempts + 1, nextAttemptAt: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(email.attempts, 6))) }).where(eq(courseEmails.id, email.id))
    }
  }
  return result
}
