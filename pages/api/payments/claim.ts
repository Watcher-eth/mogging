import type { NextApiRequest, NextApiResponse } from 'next'
import { json, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  return json(res, 410, {
    error: {
      code: 'gone',
      message: 'Raw Stripe session claims are disabled. Use a signed payment handoff.',
    },
  })
}
