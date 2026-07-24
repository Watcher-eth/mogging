import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { requireInviteAdmin } from '@/lib/admin/invite-auth'
import { createInviteCode, createInviteCodeSchema, listInviteCodes } from '@/lib/payments/invite-codes'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireInviteAdmin(req)

    if (req.method === 'GET') {
      return json(res, 200, { inviteCodes: await listInviteCodes() })
    }

    if (req.method === 'POST') {
      const input = parseBody(createInviteCodeSchema, req.body)
      const result = await createInviteCode({ ...input, createdBy: 'invite-admin' })
      return json(res, 201, result)
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
