import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, json, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getProductConfig } from '@/lib/payments/entitlements'
import { validateCheckoutProduct } from '@/lib/payments/checkout-price'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const product = z.enum(['evaluation', 'evaluation_pack_3']).parse(req.query.product)
    const config = getProductConfig(product)
    const price = await validateCheckoutProduct(product, config)
    if (price && price.unit_amount === null) throw new ApiError(503, 'Report prices are not available')
    return json(res, 200, { product, currency: price?.currency ?? 'usd', amount: price?.unit_amount ?? config.unitAmount })
  } catch (error) { return handleApiError(error, res) }
}
