import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { EmailAlreadyExistsError, registerSchema, registerUser } from '@/lib/auth/register'
import { getRequestLocation } from '@/lib/geo/request'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'auth_register', limit: 10, windowMs: 60 * 60 * 1000 })
    const input = parseBody(registerSchema, req.body)
    const user = await registerUser({ ...input, ...getRequestLocation(req) })
    return json(res, 201, { user })
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return handleApiError(new ApiError(409, error.message), res)
    }

    return handleApiError(error, res)
  }
}
