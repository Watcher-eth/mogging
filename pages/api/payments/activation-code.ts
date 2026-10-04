import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { json, methodNotAllowed } from '@/lib/api/http'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  return json(res, 410, {
    error: {
      code: 'gone',
      message: 'Activation codes are delivered only after webhook-confirmed payment.',
    },
  })
}

export default monitorBackend('payments/activation-code',handler)
