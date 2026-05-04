import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { analyzeAndSave, analyzeAndSaveSchema } from '@/lib/analysis/analyze'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAnonymousProfile } from '@/lib/auth/anonymousProfile'
import { getAuthSession } from '@/lib/auth/session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { hairColorSchema, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'analyze', limit: 10, windowMs: 60 * 60 * 1000 })
    const sessionPromise = getAuthSession(req, res)
    const body = parseBody(analyzeAndSaveSchema, req.body)
    const session = await sessionPromise
    if (env.AUTH_REQUIRED && !session?.user?.id) {
      throw new ApiError(401, 'Authentication required')
    }

    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
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
      age: body.age ?? userProfile?.age ?? anonymousProfile?.age ?? null,
      name: body.name ?? anonymousProfile?.name ?? null,
      caption: body.caption ?? anonymousProfile?.social ?? null,
      hairColor: body.hairColor ?? anonymousHairColor,
      skinColor: body.skinColor ?? userSkinColor ?? anonymousSkinColor,
    })

    return json(res, result.deduped ? 200 : 201, result)
  } catch (error) {
    return handleApiError(error, res)
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
