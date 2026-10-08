import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    if (typeof req.query.id !== 'string') throw new ApiError(400, 'Payment ID required')
    const [receipt] = await db.select().from(schema.creatorPaymentReceipts).where(eq(schema.creatorPaymentReceipts.paymentId, req.query.id)).limit(1)
    if (!receipt) throw new ApiError(404, 'Receipt not found')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', 'inline; filename="payment-receipt.jpg"')
    return res.status(200).send(Buffer.from(receipt.image, 'base64'))
  } catch (error) { return handleApiError(error, res) }
}
