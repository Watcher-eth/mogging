import { and, eq, notInArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

// Paid history and saved reports remain accessible after credits or subscriptions expire.
export async function canResumeMobileAccount(userId: string) {
  const [purchase, report] = await Promise.all([
    db.query.paymentEntitlements.findFirst({
      where: and(eq(schema.paymentEntitlements.userId, userId), notInArray(schema.paymentEntitlements.product, ['extra_potential_image'])),
      columns: { id: true },
    }),
    db.select({ id: schema.analyses.id }).from(schema.analyses)
      .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(and(eq(schema.photos.userId, userId), eq(schema.analyses.status, 'complete'))).limit(1),
  ])
  return Boolean(purchase || report.length)
}
