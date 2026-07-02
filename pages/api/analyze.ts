import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAnonymousProfile } from '@/lib/auth/anonymousProfile'
import { getAuthSession } from '@/lib/auth/session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { assertEvaluationEntitlement, consumeEvaluationEntitlement } from '@/lib/payments/entitlements'
import { createAnalysisShare } from '@/lib/sharing/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const requestIdHeader = req.headers['x-mogging-request-id']
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader || `web-${Date.now().toString(36)}`
  const startedAt = Date.now()

  try {
    await enforceRateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60 * 60 * 1000 })
    const sessionPromise = getAuthSession(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    console.info('analyze:start', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      imageDataChars: body.imageData.length,
      photoType: body.photoType,
      gender: body.gender,
      hasLandmarks: Boolean(body.landmarks),
    })
    const session = await sessionPromise
    if (env.AUTH_REQUIRED && !session?.user?.id) {
      throw new ApiError(401, 'Authentication required')
    }
    const mobileInstallId = readMobileInstallId(req)
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    if (env.PAID_ANALYSIS_REQUIRED && mobileInstallId) {
      await assertEvaluationEntitlement({
        mobileInstallId,
        userId: session?.user?.id ?? null,
        anonymousActorId,
        revenueCatAppUserId: readHeader(req.headers['x-mogging-revenuecat-app-user-id']),
      })
    }

    const [anonymousProfile, userProfile] = await Promise.all([
      anonymousActorId ? getAnonymousProfile(anonymousActorId) : null,
      session?.user?.id
        ? db.query.users.findFirst({
            where: eq(schema.users.id, session.user.id),
            columns: {
              age: true,
              gender: true,
              skinColor: true,
            },
          })
        : null,
    ])
    const profileGender = userProfile?.gender ?? anonymousProfile?.gender ?? null
    const analysisGender = body.gender === 'other' && profileGender ? profileGender : body.gender
    const anonymousHairColor = hairColorSchema.safeParse(anonymousProfile?.hairColor).data ?? null
    const anonymousSkinColor = skinColorSchema.safeParse(anonymousProfile?.skinColor).data ?? null
    const userSkinColor = skinColorSchema.safeParse(userProfile?.skinColor).data ?? null

    const result = await analyzeAndSave({
      ...body,
      gender: analysisGender,
      userId: session?.user?.id ?? null,
      anonymousActorId,
      age: normalizeApparentAge(body.age ?? userProfile?.age ?? anonymousProfile?.age ?? null),
      name: body.name ?? anonymousProfile?.name ?? null,
      caption: body.caption ?? anonymousProfile?.social ?? null,
      hairColor: body.hairColor ?? anonymousHairColor,
      skinColor: body.skinColor ?? userSkinColor ?? anonymousSkinColor,
    })
    const shareResult =
      result.analysis.status === 'complete'
        ? await createDefaultShare({
            analysisId: result.analysis.id,
            ownerUserId: session?.user?.id ?? null,
            ownerAnonymousActorId: anonymousActorId,
          })
        : null
    const entitlements =
      env.PAID_ANALYSIS_REQUIRED && mobileInstallId && result.analysis.status === 'complete'
        ? await consumeEvaluationEntitlement({
            mobileInstallId,
            userId: session?.user?.id ?? null,
            anonymousActorId,
            revenueCatAppUserId: readHeader(req.headers['x-mogging-revenuecat-app-user-id']),
          })
        : null

    console.info('analyze:finish', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      deduped: result.deduped,
      analysisStatus: result.analysis.status,
      failureReason: result.analysis.failureReason ?? null,
      pslScore: result.analysis.pslScore ?? null,
      shareToken: shareResult?.share.token ?? null,
      mobileInstallId,
    })

    return json(res, result.deduped ? 200 : 201, {
      ...result,
      entitlements,
      share: shareResult?.share
        ? {
            token: shareResult.share.token,
          }
        : null,
    })
  } catch (error) {
    console.error('analyze:error', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : null,
    })
    return handleApiError(error, res)
  }
}

function readMobileInstallId(req: NextApiRequest) {
  const header = req.headers['x-mogging-mobile-install-id']
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 120 ? trimmed : null
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

async function createDefaultShare({
  analysisId,
  ownerAnonymousActorId,
  ownerUserId,
}: {
  analysisId: string
  ownerAnonymousActorId: string | null
  ownerUserId: string | null
}) {
  try {
    return await createAnalysisShare({
      analysisId,
      ownerUserId,
      ownerAnonymousActorId,
      includeLeaderboard: false,
    })
  } catch (error) {
    console.warn('analyze:share:create-failed', {
      analysisId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
