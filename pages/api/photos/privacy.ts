import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { db, schema } from '@/lib/db'

const photoPrivacySchema = z.object({
  photoId: z.string().min(1),
  isPublic: z.boolean(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) {
      throw new ApiError(401, 'Authentication required')
    }

    const body = parseBody(photoPrivacySchema, req.body)
    const [photo] = await db
      .update(schema.photos)
      .set({
        isPublic: body.isPublic,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.photos.id, body.photoId),
        eq(schema.photos.userId, userId)
      ))
      .returning({
        id: schema.photos.id,
        isPublic: schema.photos.isPublic,
      })

    if (!photo) {
      throw new ApiError(404, 'Photo not found')
    }

    return json(res, 200, { photo })
  } catch (error) {
    return handleApiError(error, res)
  }
}
