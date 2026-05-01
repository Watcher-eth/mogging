import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'

const photoPrivacySchema = z.object({
  photoId: z.string().min(1),
  isPublic: z.boolean(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) {
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
        eq(schema.photos.userId, session.user.id)
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
