import { createHash, randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAnonymousProfile } from '@/lib/auth/anonymousProfile'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { reserveEvaluation, finishEvaluation } from '@/lib/payments/entitlements'
import { createAnalysisShare } from '@/lib/sharing/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const requestIdHeader = req.headers['x-mogging-request-id']
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader || randomUUID()
  const startedAt = Date.now()
  let reservation: Awaited<ReturnType<typeof reserveEvaluation>> | null = null
  let generationReturned = false

  try {
    await enforceRateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60 * 60 * 1000 })
    const userIdPromise = getRequestUserId(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    console.info('analyze:start', {
      requestId,
      contentLength: req.headers['content-length'] ?? null,
      imageDataChars: body.imageData.length,
      photoType: body.photoType,
      gender: body.gender,
      hasLandmarks: Boolean(body.landmarks),
    })
    const userId = await userIdPromise
    if (env.AUTH_REQUIRED && !userId) {
      throw new ApiError(401, 'Authentication required')
    }
    const mobileInstallId = readMobileInstallId(req)
    const adminMode = readHeader(req.headers['x-mogging-admin-code']) === '674523'
    const anonymousActorId = userId ? null : getOrSetAnonymousActorId(req, res)
    if (!adminMode && !userId) {
      throw new ApiError(401, 'Sign in before generating a paid report')
    }
    if (requestId.length > 200) throw new ApiError(400, 'Invalid scan request ID')

    const [anonymousProfile, userProfile] = await Promise.all([
      anonymousActorId ? getAnonymousProfile(anonymousActorId) : null,
      userId
        ? db.query.users.findFirst({
            where: eq(schema.users.id, userId),
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

    if (userId && !adminMode) {
      reservation = await reserveEvaluation({ userId, mobileInstallId: mobileInstallId ?? undefined }, requestId,
        createHash('sha256').update(JSON.stringify(body)).digest('hex'))
      if (reservation.result) return json(res, 200, { ...reservation.result, entitlements: reservation.summary })
    }

    const result = await analyzeAndSave({
      ...body,
      gender: analysisGender,
      userId,
      anonymousActorId,
      age: normalizeApparentAge(body.age ?? userProfile?.age ?? anonymousProfile?.age ?? null),
      name: body.name ?? anonymousProfile?.name ?? null,
      caption: body.caption ?? anonymousProfile?.social ?? null,
      hairColor: body.hairColor ?? anonymousHairColor,
      skinColor: body.skinColor ?? userSkinColor ?? anonymousSkinColor,
    }, reservation?.id)
    generationReturned = true
    const shareResult =
      result.analysis.status === 'complete'
        ? await createDefaultShare({
            analysisId: result.analysis.id,
            ownerUserId: userId,
            ownerAnonymousActorId: anonymousActorId,
          })
        : null
    const successful = result.analysis.status === 'complete'
    const entitlements = reservation ? {
      ...reservation.summary,
      evaluationCredits: Math.min(Number.MAX_SAFE_INTEGER, reservation.summary.evaluationCredits + (successful ? 0 : 1)),
    } : null
    const response = { ...result, entitlements, share: shareResult?.share ? { token: shareResult.share.token } : null }
    if (reservation) await finishEvaluation(reservation.id, response, successful)

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

    return json(res, result.deduped ? 200 : 201, response)
  } catch (error) {
    if (reservation && !generationReturned) {
      await finishEvaluation(reservation.id, { analysis: { status: 'failed', failureReason: 'Unable to generate report. Please retry.' } }, false)
        .catch(refundError => console.error('analyze:credit-return-failed', reservation?.id, refundError))
    }
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
  maxDuration: 120,
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
