import { z } from 'zod'

const overview = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  metrics: z.array(z.object({
    id: z.string(),
    name: z.string(),
    period: z.string(),
    value: z.number().finite(),
    last_updated_at: z.number().finite(),
  })),
})

export async function getRevenueCatMetrics() {
  const project = process.env.REVENUECAT_METRICS_PROJECT_ID
  const key = process.env.REVENUECAT_METRICS_API_KEY
  if (!project || !key) return { status: 'unconfigured' as const }

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v2/projects/${encodeURIComponent(project)}/metrics/overview?currency=USD`,
      { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) },
    )
    if (!response.ok) return { status: 'unavailable' as const, httpStatus: response.status }
    const snapshot = overview.parse(await response.json())
    return { status: 'ready' as const, checkedAt: new Date().toISOString(), ...snapshot }
  } catch {
    return { status: 'unavailable' as const }
  }
}

export type RevenueCatMetrics = Awaited<ReturnType<typeof getRevenueCatMetrics>>
