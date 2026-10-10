// Import original RevenueCat purchase events into billing history only.
// This never grants credits, marks webhook receipts processed, or initiates charges.
import { readFile } from 'node:fs/promises'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { recordRevenueCatLifecycle } from '@/lib/payments/billing-ledger'
import { revenueCatEventSchema } from '@/lib/payments/subscription-events'
import { scanProducts } from '@/lib/payments/revenuecat'

try {
  const [file, accountId, mode] = process.argv.slice(2)
  if (!file || !accountId || (mode && mode !== '--apply')) throw new Error('Usage: bun run scripts/admin/reconcile-revenuecat-events.ts original-events.json account-id [--apply]')
  const events = z.array(revenueCatEventSchema).min(1).max(200).parse(JSON.parse(await readFile(file, 'utf8')))
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate event IDs in input')
  for (const event of events) {
    if (event.app_user_id !== accountId || event.type !== 'NON_RENEWING_PURCHASE' || event.environment !== 'PRODUCTION'
      || !scanProducts.some(product => product.productId === event.product_id) || !event.transaction_id
      || event.event_timestamp_ms == null || event.purchased_at_ms == null
      || event.price_in_purchased_currency == null || !event.currency) throw new Error('Use complete original production scan-purchase events for the specified account')
  }
  if (!await db.query.users.findFirst({where:eq(schema.users.id,accountId),columns:{id:true}})) throw new Error('Account not found')
  const existing = await db.query.subscriptionEvents.findMany({
    where:and(eq(schema.subscriptionEvents.provider,'revenuecat'),inArray(schema.subscriptionEvents.providerEventId,events.map(event=>event.id))),
    columns:{providerEventId:true},
  })
  const known = new Set(existing.map(event=>event.providerEventId))
  const missing = events.filter(event=>!known.has(event.id))
  console.log(JSON.stringify({mode:mode?'apply':'dry-run',existing:existing.length,missing:missing.map(event=>({id:event.id,product:event.product_id,amount:event.price_in_purchased_currency,currency:event.currency}))}))
  if (mode) {
    for (const event of missing) await recordRevenueCatLifecycle(event)
    console.log(`Reconciled ${missing.length} billing events; scan balances untouched. Re-running is safe.`)
  }
} finally {
  await db.$client.end()
}
