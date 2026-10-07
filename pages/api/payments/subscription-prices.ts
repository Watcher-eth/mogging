import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { json, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getRequestLocation } from '@/lib/geo/request'
import { preferredCurrency } from '@/lib/payments/subscription-prices'
import { getSubscriptionPrices } from '@/lib/payments/subscription-prices-server'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  // Location-sensitive defaults must not be cached across visitors.
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const currency = z.string().regex(/^[a-zA-Z]{3}$/).optional().parse(req.query.currency)?.toLowerCase()
    return json(res, 200, await getSubscriptionPrices(currency ?? preferredCurrency(getRequestLocation(req).country)))
  } catch (error) {
    return handleApiError(error, res)
  }
}
