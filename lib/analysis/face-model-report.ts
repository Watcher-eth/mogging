import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { readStoredImageDataUrl } from '@/lib/storage/images'
import { analyzeAndSaveModelReport } from '@/lib/analysis-v2/production'
import { analyzeAndSaveSchema } from './analyze'

const eligible = sql`${schema.analyses.metrics}->>'presentation' = 'face-model'
  AND ${schema.analyses.status} = 'complete'
  AND coalesce((${schema.analyses.metrics} #>> '{webAnalysis,attempts}')::int, 0) < 3
  AND (
    (${schema.analyses.metrics} #>> '{webAnalysis,status}' = 'pending'
      AND coalesce((${schema.analyses.metrics} #>> '{webAnalysis,nextAttempt}')::bigint, 0) <= extract(epoch from now()) * 1000)
    OR (${schema.analyses.metrics} #>> '{webAnalysis,status}' = 'processing'
      AND ${schema.analyses.updatedAt} < now() - interval '5 minutes')
  )`

// The complete geometry record owns a durable report job. No raw photograph is
// copied into job metadata, and claims are atomic across requests and cron runs.
export async function generateFaceModelReport(id: string, generate = analyzeAndSaveModelReport) {
  const [claimed] = await db.update(schema.analyses).set({
    metrics: sql`jsonb_set(${schema.analyses.metrics}, '{webAnalysis}', jsonb_build_object(
      'status', 'processing', 'attempts', coalesce((${schema.analyses.metrics} #>> '{webAnalysis,attempts}')::int, 0) + 1))`,
    updatedAt: new Date(),
  }).where(and(eq(schema.analyses.id, id), eligible)).returning()
  if (!claimed) return false
  const attempts = Number((claimed.metrics.webAnalysis as { attempts: number }).attempts)
  try {
    const photo = await db.query.photos.findFirst({ where: eq(schema.photos.id, claimed.photoId) })
    if (!photo?.userId || !photo.imageStorageKey) throw new Error('Stored scan image unavailable')
    const existing = await db.query.analyses.findFirst({ where: and(
      eq(schema.analyses.status, 'complete'),
      sql`${schema.analyses.metrics}->>'sourceFaceModelId' = ${id}`,
      sql`${schema.analyses.metrics}->>'webOnly' = 'true'`,
    ) })
    const report = existing ?? (await generate(analyzeAndSaveSchema.parse({
      imageData: await readStoredImageDataUrl(photo.imageStorageKey),
      userId: photo.userId, gender: photo.gender, age: photo.age, name: photo.name,
      photoType: 'face', landmarks: claimed.landmarks, studyContext: claimed.metrics.studyContext,
    }), id)).analysis
    if (report.status !== 'complete') throw new Error('Web analysis did not complete')
    await finish({ status: 'complete', attempts, reportId: report.id })
  } catch {
    await finish({ status: attempts >= 3 ? 'failed' : 'pending', attempts, nextAttempt: Date.now() + attempts * 60_000 })
    console.error('face-model:web-report-failed', { id, attempts })
  }
  return true

  async function finish(state: Record<string, unknown>) {
    await db.update(schema.analyses).set({
      metrics: sql`jsonb_set(${schema.analyses.metrics}, '{webAnalysis}', ${JSON.stringify(state)}::jsonb)`,
      updatedAt: new Date(),
    }).where(and(eq(schema.analyses.id, id), eq(schema.analyses.updatedAt, claimed.updatedAt)))
  }
}

export async function resumeFaceModelReports() {
  await db.update(schema.analyses).set({
    metrics: sql`jsonb_set(${schema.analyses.metrics}, '{webAnalysis,status}', '"failed"'::jsonb)`, updatedAt: new Date(),
  }).where(sql`${schema.analyses.metrics}->>'presentation' = 'face-model'
    AND ${schema.analyses.metrics} #>> '{webAnalysis,status}' = 'processing'
    AND (${schema.analyses.metrics} #>> '{webAnalysis,attempts}')::int >= 3
    AND ${schema.analyses.updatedAt} < now() - interval '5 minutes'`)
  const jobs = await db.select({ id: schema.analyses.id }).from(schema.analyses).where(eligible)
    .orderBy(schema.analyses.createdAt).limit(2)
  await Promise.all(jobs.map(job => generateFaceModelReport(job.id)))
  return jobs.length
}
