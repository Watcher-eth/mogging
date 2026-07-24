import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { requireInviteAdmin } from '@/lib/admin/invite-auth'
import { deleteInviteCode, setInviteCodeActive } from '@/lib/payments/invite-codes'

const updateInviteCodeSchema = z.object({
  active: z.boolean(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireInviteAdmin(req)
    const id = readInviteCodeId(req)

    if (req.method === 'PATCH') {
      const input = parseBody(updateInviteCodeSchema, req.body)
      return json(res, 200, { inviteCode: await setInviteCodeActive(id, input.active) })
    }

    if (req.method === 'DELETE') {
      await deleteInviteCode(id)
      return json(res, 200, { ok: true })
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE'])
  } catch (error) {
    return handleApiError(error, res)
  }
}

function readInviteCodeId(req: NextApiRequest) {
  const id = req.query.id
  const value = Array.isArray(id) ? id[0] : id
  if (!value) throw new ApiError(400, 'Invite code id is required')
  return value
}
