import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, methodNotAllowed } from '@/lib/api/http'
import { searchUsers, searchUsersSchema } from '@/lib/users/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = searchUsersSchema.parse(req.query)
    const result = await searchUsers(query)
    return res.status(200).json(result)
  } catch (error) {
    return handleApiError(error, res)
  }
}

