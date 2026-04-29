import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'
import { handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
import { EmailAlreadyExistsError, registerSchema, registerUser } from '@/lib/auth/register'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(registerSchema, req.body)
    const user = await registerUser(input)
    return res.status(201).json({ user })
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      return handleApiError(new ApiError(409, error.message), res)
    }

    return handleApiError(error, res)
  }
}
