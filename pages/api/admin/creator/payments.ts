import type { NextApiRequest, NextApiResponse } from 'next'
import { createCreatorPayment, creatorAdminPaymentSchema } from '@/lib/admin/creator-service'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    await requireCreatorAdmin(req, res)
    const input = parseBody(creatorAdminPaymentSchema, req.body)
    return json(res, 201, { payment: await createCreatorPayment(input) })
  } catch (error) {
    return handleApiError(error, res)
  }
}
