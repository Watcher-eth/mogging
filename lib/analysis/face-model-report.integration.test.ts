import { beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'

const url = process.env.FACE_MODEL_TEST_DATABASE_URL
const enabled = Boolean(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname))

describe.skipIf(!enabled)('3D scan and private web analysis on isolated Postgres', () => {
  let db: typeof import('@/lib/db').db, schema: typeof import('@/lib/db').schema
  let eq: typeof import('drizzle-orm').eq
  let processReport: typeof import('./face-model-report').generateFaceModelReport
  let save: typeof import('./service').saveAnalysisResult
  let photo: typeof import('@/lib/photos/service').createPhotoRecord
  let credits: typeof import('@/lib/payments/entitlements')
  let image: Awaited<ReturnType<typeof import('@/lib/storage/images').storeImageDataUrl>>
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.IMAGE_STORAGE_DIR = await mkdtemp('/private/tmp/mogging-report-job-')
    for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[key]
    delete process.env.REVENUECAT_SECRET_API_KEY
    ;({ db, schema } = await import('@/lib/db'))
    ;({ eq } = await import('drizzle-orm'))
    ;({ generateFaceModelReport: processReport } = await import('./face-model-report'))
    ;({ saveAnalysisResult: save } = await import('./service'))
    ;({ createPhotoRecord: photo } = await import('@/lib/photos/service'))
    credits = await import('@/lib/payments/entitlements')
    image = await (await import('@/lib/storage/images')).storeImageDataUrl('data:image/jpeg;base64,dGVzdA==')
  })

  async function scan() {
    const userId = randomUUID()
    await db.insert(schema.users).values({ id: userId, email: `${userId}@test.invalid` })
    await db.insert(schema.paymentEntitlements).values({ userId, mobileInstallId: 'model-report-test', stripeCheckoutSessionId: randomUUID(), product: 'evaluation', creditBalance: 1, source: 'test' })
    const reservation = await credits.reserveEvaluation({ userId }, randomUUID(), 'test-photo')
    const original = await photo({ ...image, userId, imageHash: randomUUID().replaceAll('-', '').repeat(2) })
    const landmarks = { version: 1, source: 'apple-vision', confidence: .9, image: { width: 600, height: 800 },
      anchors: { leftPupil: { x: .35, y: .4 }, rightPupil: { x: .65, y: .4 } } }
    const result = await save({ photoId: original.photo.id, status: 'complete', landmarks, metrics: { presentation: 'face-model', webAnalysis: { status: 'pending', attempts: 0 } } },
      { id: reservation.id, ...original })
    return { userId, model: result.analysis }
  }

  test('concurrent workers generate one web-only report, spend one credit, and preserve geometry and legacy history', async () => {
    const { userId, model } = await scan()
    let calls = 0
    const generate = async (input: any, modelId: string) => {
      calls++
      expect(input.userId).toBe(userId)
      const result = await photo({ ...image, userId, imageHash: modelId.replaceAll('-', '').repeat(2) })
      const saved = await save({ photoId: result.photo.id, status: 'complete', landmarks: {}, pslScore: 5,
        metrics: { webOnly: true, sourceFaceModelId: modelId, report: { categories: [{ id: 'overall', score: 6 }] } } })
      return { ...result, ...saved }
    }
    await Promise.all([processReport(model.id, generate as any), processReport(model.id, generate as any)])
    expect(calls).toBe(1)
    expect((await credits.getEntitlementSummary({ userId })).evaluationCredits).toBe(0)
    const preserved = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, model.id) })
    expect(preserved).toMatchObject({ pslScore: null, landmarks: model.landmarks,
      metrics: { presentation: 'face-model', webAnalysis: { status: 'complete', attempts: 1 } } })
    expect(await processReport(model.id, generate as any)).toBe(false)

    const token = randomUUID()
    await db.insert(schema.sessions).values({ userId, sessionToken: token, expires: new Date(Date.now() + 60_000) })
    const { handler } = await import('@/pages/api/mobile/reports')
    async function history(query: Record<string, string>) {
      let body: any
      const res: any = { setHeader() {}, status() { return res }, json(value: unknown) { body = value } }
      await handler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query } as any, res)
      return body.data.reports
    }
    expect(await history({})).toHaveLength(0)
    expect((await history({ includeFaceStudies: '1' }))[0].analysis.id).toBe(model.id)
    expect((await history({ includeWebReports: '1' }))[0].analysis.metrics).toMatchObject({ webOnly: true, sourceFaceModelId: model.id })
  })

  test('provider failures retry without losing the scan or reserving another credit', async () => {
    const { userId, model } = await scan()
    const fail = async () => { throw new Error('Temporary provider outage') }
    await processReport(model.id, fail)
    const saved = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, model.id) })
    expect(saved).toMatchObject({ status: 'complete', pslScore: null,
      metrics: { presentation: 'face-model', webAnalysis: { status: 'pending', attempts: 1 } } })
    expect(await processReport(model.id, fail)).toBe(false)
    expect((await credits.getEntitlementSummary({ userId })).evaluationCredits).toBe(0)
  })
})
