import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { canResumeMobileAccount } from '@/lib/auth/mobile-access'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to continue')
    return json(res, 200, { canResume: await canResumeMobileAccount(userId) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/mobile-access', handler)
