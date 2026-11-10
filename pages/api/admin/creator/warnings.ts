import type { NextApiRequest, NextApiResponse } from 'next'
import { addCreatorInternalWarning, addCreatorWarningSchema, addCreatorInternalWarnings, addCreatorWarningsSchema, resolveCreatorInternalWarning, resolveCreatorWarningSchema } from '@/lib/admin/creator-warnings'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    res.setHeader('Cache-Control', 'private, no-store')
    const { email } = await requireCreatorAdmin(req, res)
    if (req.method === 'POST') return json(res, 201, { warning: await addCreatorInternalWarning(parseBody(addCreatorWarningSchema, req.body), email) })
    if (req.method === 'PUT') return json(res, 201, { warnings: await addCreatorInternalWarnings(parseBody(addCreatorWarningsSchema, req.body), email) })
    if (req.method === 'PATCH') return json(res, 200, { warning: await resolveCreatorInternalWarning(parseBody(resolveCreatorWarningSchema, req.body), email) })
    return methodNotAllowed(res, ['POST', 'PUT', 'PATCH'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
