import { unstable_cache } from 'next/cache'
import type { NextApiRequest, NextApiResponse } from 'next'
import { analyticsFilters, getAnalyticsDashboard } from '@/lib/admin/analytics'
import { getAppStoreSales } from '@/lib/admin/app-store-sales'
import { getRevenueCatMetrics } from '@/lib/admin/revenuecat-metrics'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

// Shared across function instances; stale snapshots refresh in the background.
// Authentication still runs on every request before any cached data is read.
const getReport = unstable_cache(getAnalyticsDashboard, ['admin-analytics-workspace-v13'], { revalidate: 60 })

const getProviderMetrics = unstable_cache(getRevenueCatMetrics, ['admin-revenuecat-provider-metrics-v1'], { revalidate: 60 })

const getAppleSales = unstable_cache(getAppStoreSales, ['admin-apple-sales-v1'], { revalidate: 900 })

export const config = { maxDuration: 30 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    await enforceRateLimit(req, res, { key: 'admin_analytics', limit: 30, windowMs: 60_000 })
    const filters = analyticsFilters.safeParse(req.query)
    if (!filters.success) throw new ApiError(400, 'Choose a supported time range and platform')
    if (filters.data.section === 'Revenue' && req.query.view === 'providers') {
      const [revenueCatMetrics, appStoreSales] = await Promise.all([getProviderMetrics(), getAppleSales()])
      return json(res, 200, { revenueCatMetrics, appStoreSales })
    }
    return json(res, 200, await getReport(filters.data))
  } catch (error) { return handleApiError(error, res) }
}
