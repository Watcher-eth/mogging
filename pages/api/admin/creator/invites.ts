import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { createCreatorInvite, listCreatorInvites, revokeCreatorInvite } from '@/lib/creator/invites'
import { creatorInviteSchema } from '@/lib/creator/invite-validation'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { email } = await requireCreatorAdmin(req, res)
    if (req.method === 'GET') return json(res, 200, { invites: await listCreatorInvites() })
    if (req.method === 'POST') return json(res, 201, await createCreatorInvite(parseBody(creatorInviteSchema, req.body), email))
    if (req.method === 'DELETE') return json(res, 200, await revokeCreatorInvite(parseBody(z.object({ id: z.string().uuid() }), req.body).id))
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  } catch (error) { return handleApiError(error, res) }
}
