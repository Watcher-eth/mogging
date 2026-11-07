import type { NextApiRequest, NextApiResponse } from 'next'
import { and, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import sharp from 'sharp'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { studyContextSchema } from '@/lib/analysis/analyze'
import { faceLandmarksPayloadSchema } from '@/lib/analysis/landmarks'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getFaceStudyRenderOrigin } from '@/lib/creator/face-study-runtime'
import { renderMobileFaceStudy } from '@/lib/creator/render-mobile-face-study'

export const config = { maxDuration: 600, api: { responseLimit: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const owner = await getRequestUserId(req, res)
    if (!owner) throw new ApiError(401, 'Sign in to view your portrait study.')
    const { id, narrated } = z.object({ id: z.string().min(1).max(100), narrated: z.literal('1').optional() }).parse(req.query)
    const [row] = await db.select({ analysis: schema.analyses, photo: schema.photos })
      .from(schema.analyses).innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(and(eq(schema.analyses.id, id), eq(schema.photos.userId, owner), eq(schema.analyses.status, 'complete'))).limit(1)
    if (!row || row.analysis.metrics.presentation !== 'face-study') throw new ApiError(404, 'Portrait study not found.')
    const face = faceLandmarksPayloadSchema.parse(row.analysis.landmarks)
    await enforceRateLimit(req, res, { key: 'face-study-video', identity: owner, limit: 8, windowMs: 60 * 60 * 1000 })
    const context = studyContextSchema.safeParse(row.analysis.metrics.studyContext).data
    const [previous] = context?.previousAnalysisId ? await db.select({ landmarks: schema.analyses.landmarks })
      .from(schema.analyses).innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(and(eq(schema.analyses.id, context.previousAnalysisId), eq(schema.photos.userId, owner),
        eq(schema.analyses.status, 'complete'), lt(schema.analyses.createdAt, row.analysis.createdAt))).limit(1) : []
    const priorFace = faceLandmarksPayloadSchema.safeParse(previous?.landmarks).data
    const script = context && {
      goals: context.goals, protocolTaskKeys: context.protocolTaskKeys, checkIn: context.checkIn, returning: Boolean(previous),
      previousFace: priorFace?.source !== 'kimi-vision-estimate' && (priorFace?.confidence ?? 0) >= .5 ? priorFace : undefined,
    }
    const origin = getFaceStudyRenderOrigin()
    if (!origin) throw new ApiError(503, 'Video generation is temporarily unavailable.')
    const photo = await fetch(new URL(row.photo.imageUrl, process.env.NEXT_PUBLIC_SITE_URL || origin), { redirect: 'error', signal: AbortSignal.timeout(8000) })
    const mime = photo.headers.get('content-type')?.split(';')[0]
    if (!photo.ok || !mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new ApiError(503, 'Could not load the study portrait.')
    const image = Buffer.from(await photo.arrayBuffer())
    if (image.length > 10_000_000) throw new ApiError(413, 'The study portrait is too large.')
    const portrait = await sharp(image).resize({ width: 1080, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()
    const { video, chapterStarts } = await renderMobileFaceStudy({ id, face, script, narrated: narrated === '1', photo: `data:image/webp;base64,${portrait.toString('base64')}` }, origin)
    if (narrated) res.setHeader('X-Face-Study-Chapters', JSON.stringify(chapterStarts))
    res.setHeader('Content-Type', 'video/mp4')
    // Stream the MP4 so longer studies can exceed the buffered response limit.
    res.write(video.subarray(0, 64 * 1024))
    res.end(video.subarray(64 * 1024))
  } catch (error) {
    return handleApiError(error, res)
  }
}
