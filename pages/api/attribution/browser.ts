import type { NextApiRequest, NextApiResponse } from 'next'
import { monitorBackend } from '@/lib/reliability/monitor'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getAuthSession } from '@/lib/auth/session'
import { getAccountCreatorAttribution, resolveCreatorAttribution } from '@/lib/creator/attribution'
import { createReferralHandoff, recoveryCallback, recoveryRedemption, recoveryRequest, redeemReferralHandoff } from '@/lib/creator/continuity'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (!['GET', 'POST'].includes(req.method || '')) return methodNotAllowed(res, ['GET', 'POST'])
  try {
    await enforceRateLimit(req, res, { key: 'creator_recovery', limit: 15, windowMs: 60_000 })
    if (req.method === 'POST') {
      const context = await redeemReferralHandoff(parseBody(recoveryRedemption, req.body))
      return json(res, 200, { url: `mogging://r/${encodeURIComponent(context.creatorSlug || 'recovered')}?attribution_token=${encodeURIComponent(context.token)}` })
    }
    const { state, challenge } = recoveryRequest.parse(req.query)
    let context = await resolveCreatorAttribution({ req })
    if (!context) {
      const session = await getAuthSession(req, res)
      if (session?.user?.id) context = await getAccountCreatorAttribution(session.user.id)
    }
    if (!context) return res.redirect(302, recoveryCallback(state, { error: 'not_found' }))
    const ticket = await createReferralHandoff(context.clickId, challenge)
    return res.redirect(302, recoveryCallback(state, { ticket }))
  } catch (error) {
    const pending = req.method === 'GET' ? recoveryRequest.safeParse(req.query) : null
    if (pending?.success) return res.redirect(302, recoveryCallback(pending.data.state, { error: 'unavailable' }))
    return handleApiError(error, res)
  }
}
export default monitorBackend('attribution/browser', handler)
