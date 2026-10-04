import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { searchUsers, searchUsersSchema } from '@/lib/users/service'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = searchUsersSchema.parse(req.query)
    const result = await searchUsers(query)
    return json(res, 200, result)
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('search/users',handler)
