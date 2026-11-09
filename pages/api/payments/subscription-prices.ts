import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { json, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getRequestLocation } from '@/lib/geo/request'
import { preferredCurrency } from '@/lib/payments/subscription-prices'
import { getSubscriptionPrices } from '@/lib/payments/subscription-prices-server'
import { getWebAnalysisCatalog } from '@/lib/payments/checkout-price'
import { env } from '@/lib/env'
import { getPaywallTreatmentPrice, paywallPriceProduct, quotePaywallExperiment } from '@/lib/payments/paywall-experiment-server'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  // Location-sensitive defaults must not be cached across visitors.
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const web = req.query.catalog === 'web-analysis' || req.query.catalog === 'web-analysis-mobile'
    const currency = web ? undefined : z.string().regex(/^[a-zA-Z]{3}$/).optional().parse(req.query.currency)?.toLowerCase()
    const catalog = web
      ? await getWebAnalysisCatalog(req.query.catalog === 'web-analysis-mobile')
      : await getSubscriptionPrices(currency ?? preferredCurrency(getRequestLocation(req).country))
    const surface = req.query.experiment === 'mobile' && !req.query.catalog ? 'mobile'
      : req.query.experiment === 'desktop' && req.query.catalog === 'web-analysis' ? 'desktop' : null
    const assignment = surface && env.NEXTAUTH_SECRET ? quotePaywallExperiment(req, res, surface, env.NEXTAUTH_SECRET) : null
    if (!assignment) return json(res, 200, catalog)
    if (assignment.config.kind === 'length') return json(res, 200, { ...catalog, experiment: assignment.exposure })
    if (catalog.currency !== 'usd') return json(res, 200, catalog)
    const product = paywallPriceProduct(assignment.exposure.surface)
    const control = (catalog.amounts as Record<string, number>)[product]
    if (control === assignment.config.unitAmount) return json(res, 200, catalog)
    // Check the treatment for both arms before enrolling anyone.
    try { await getPaywallTreatmentPrice(assignment.config) }
    catch {
      console.error('Paywall experiment price unavailable', assignment.config.id)
      return json(res, 200, catalog)
    }
    return json(res, 200, {
      ...catalog,
      starterIntro: undefined,
      amounts: { ...catalog.amounts, [product]: assignment.exposure.arm === 'treatment' ? assignment.config.unitAmount : control },
      experiment: assignment.exposure,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
