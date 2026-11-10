import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { reconcileCreatorBilling } from './billing-attribution'
import { reconcileCreatorBonuses } from './bonus-service'
import { reconcileCreatorReferrals } from './creator-referrals'

export const creatorReconciliationJobs = {
  billing: () => reconcileCreatorBilling(100, 25_000),
  bonuses: () => reconcileCreatorBonuses(100, 20_000),
  referrals: async () => {
    await db.delete(schema.creatorReferralHandoffs)
      .where(sql`${schema.creatorReferralHandoffs.expiresAt} < now() - interval '1 day'`)
    return reconcileCreatorReferrals()
  },
}
