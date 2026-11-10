import { monitorBackend } from '@/lib/reliability/monitor'
import { z } from 'zod'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getCreatorAdminDashboard, getCreatorReviewQueue, getCreatorSubmissionReview, getReviewedCreatorSubmissions, reviewedSubmissionsQuery } from '@/lib/admin/creator-service'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    if (req.query.view === 'queue' && process.env.PORTAL_SCOPED_READS_DISABLED !== '1') return json(res, 200, await getCreatorReviewQueue())
    if (req.query.view === 'reviewed') return json(res, 200, await getReviewedCreatorSubmissions(parseBody(reviewedSubmissionsQuery, req.query)))
    if (req.query.view === 'review') return json(res, 200, await getCreatorSubmissionReview(parseBody(z.string().min(1).max(120), req.query.id)))
    return json(res, 200, await getCreatorAdminDashboard({ includeCoverage: req.query.coverage !== '0' }))
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('admin/creator-workspace', handler)
