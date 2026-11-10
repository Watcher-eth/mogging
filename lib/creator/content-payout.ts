import { eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { creatorContentBalances } from './money'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Call after locking the creator row. All payout writers use this order.
export async function creatorContentPayout(tx: Transaction, creatorId: string) {
  const [posts, payments] = await Promise.all([
    tx.query.creatorSubmissions.findMany({ where: eq(schema.creatorSubmissions.creatorProfileId, creatorId) }),
    tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.creatorProfileId, creatorId) }),
  ])
  return { ...creatorContentBalances(posts.filter(post => !post.isDraft), payments), payments }
}
