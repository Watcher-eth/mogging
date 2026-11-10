import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { getMemberVisibility, setMemberVisibility } from '@/lib/users/member-account'

const settings = z.object({ isPublic: z.boolean() }).strict()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH'])
  try {
    const userId = (await getAuthSession(req, res))?.user?.id
    if (!userId) throw new ApiError(401, 'Sign in to manage your settings.')
    const result = req.method === 'GET'
      ? await getMemberVisibility(userId)
      : await setMemberVisibility(userId, parseBody(settings, req.body).isPublic)
    return json(res, 200, result)
  } catch (error) {
    return handleApiError(error, res)
  }
}
