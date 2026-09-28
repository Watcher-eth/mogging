import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    const [health] = await db.transaction(async tx => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '8s'`)
      return tx.execute(sql`
      select
        (select count(*)::int from analytics_events where environment = 'production' and exported_at is null) as pending_events,
        (select min(received_at) from analytics_events where environment = 'production' and exported_at is null) as oldest_pending_event,
        (select count(*)::int from subscription_events where environment = 'production' and exported_at is null) as pending_billing_events,
        (select count(*)::int from billing_webhook_receipts where processed_at is null and received_at < now() - interval '10 minutes') as unfinished_webhooks,
        (select max(received_at) from subscription_events where provider = 'revenuecat') as last_revenuecat_receipt,
        (select max(received_at) from subscription_events where provider = 'stripe') as last_stripe_receipt
      `)
    })
    return json(res, 200, { ...health, configured: {
      posthog: Boolean(process.env.POSTHOG_PROJECT_KEY), scheduler: Boolean(process.env.CRON_SECRET),
      appleCampaignProvider: Boolean(process.env.APPLE_APP_STORE_PROVIDER_TOKEN),
      deferredLink: Boolean(process.env.CREATOR_DEFERRED_DEEP_LINK_TEMPLATE),
    } })
  } catch (error) { return handleApiError(error, res) }
}
