import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError, json, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { courseAssets } from '@/lib/courses/schema'
import { rawBody, verifyBunnySignature } from '@/lib/courses/webhooks'
import { syncAsset } from '@/lib/courses/media'
export const config = { api: { bodyParser: false } }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    if (!env.COURSES_ENABLED || !env.BUNNY_STREAM_READ_ONLY_KEY) throw new ApiError(503, 'Video webhook is not configured')
    const body = await rawBody(req)
    if (!verifyBunnySignature(body, req.headers['x-bunnystream-signature'], req.headers['x-bunnystream-signature-version'], req.headers['x-bunnystream-signature-algorithm'], env.BUNNY_STREAM_READ_ONLY_KEY)) throw new ApiError(401, 'Invalid video signature')
    const event = z.object({ VideoLibraryId: z.number().int(), VideoGuid: z.uuid(), Status: z.number().int() }).parse(JSON.parse(body.toString('utf8')))
    if (String(event.VideoLibraryId) !== env.BUNNY_STREAM_LIBRARY_ID) throw new ApiError(400, 'Unknown video library')
    const asset = await db.query.courseAssets.findFirst({ where: and(eq(courseAssets.bunnyLibraryId, String(event.VideoLibraryId)), eq(courseAssets.bunnyVideoId, event.VideoGuid)) })
    if (asset && asset.state !== 'deleted') await syncAsset(asset)
    return json(res, 200, { received: true })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('courses/bunny-webhook',handler)
