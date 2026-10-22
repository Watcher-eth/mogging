// Full client -> HTTP -> PostgreSQL -> storage -> provider -> saved report test.
// A successful store confirmation is supplied; the real client/server code owns activation and credits.
// --live calls the real analysis provider; --cloud-storage exercises R2 and deletes only its unique test image.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import postgres from 'postgres'
import sharp from 'sharp'
import registry from '../../lib/analysis-v2/rubric-registry.json'
import { designValues } from '../../lib/analysis-v2/preview-fixtures'

const address = process.env.MOBILE_FLOW_TEST_DATABASE_URL
if (!address || !['localhost', '127.0.0.1'].includes(new URL(address).hostname)) throw Error('Set MOBILE_FLOW_TEST_DATABASE_URL to a localhost PostgreSQL admin database')
const live = process.argv.includes('--live')
if (!live && !process.argv.includes('--fixture')) throw Error('Pass --live for the real provider or --fixture for local fault/recovery tests')
if (live && !process.env.MOONSHOT_API_KEY) throw Error('Analysis provider credentials are required')
const cloud = process.argv.includes('--cloud-storage')
if (cloud && !live) throw Error('Cloud storage is enabled only for an explicit --live run')
const admin = postgres(address, { max: 1 })
const database = `mobile_flow_${randomUUID().replaceAll('-', '')}`
const databaseUrl = new URL(address)
databaseUrl.pathname = `/${database}`
const folder = await mkdtemp(join(tmpdir(), 'mogging-mobile-flow-'))
const config = resolve(`.mobile-flow-${database}.config.ts`)
let created = false
let server: ReturnType<typeof createServer> | undefined
let connection: ReturnType<typeof postgres> | undefined
let cleanupImage: (() => Promise<void>) | undefined
const realFetch = globalThis.fetch
try {
  await admin.unsafe(`CREATE DATABASE "${database}"`)
  created = true
  process.env.DATABASE_URL = databaseUrl.toString()
  process.env.NEXTAUTH_SECRET = 'isolated-mobile-flow-test-only'
  process.env.AUTH_REQUIRED = 'true'
  if (!live) process.env.MOONSHOT_API_KEY = 'isolated-provider-fixture'
  process.env.REVENUECAT_SECRET_API_KEY = 'isolated-successful-purchase-fixture'
  process.env.VERCEL_ENV = 'development'
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  process.env.IMAGE_STORAGE_DIR = folder
  if (!cloud) for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL', 'COURSE_R2_BUCKET_NAME']) delete process.env[key]
  await writeFile(config, `import {defineConfig} from 'drizzle-kit'; export default defineConfig({schema:['./lib/db/schema.ts','./lib/courses/schema.ts'],dialect:'postgresql',dbCredentials:{url:process.env.DATABASE_URL!}});`)
  const setup = Bun.spawn([process.execPath, 'node_modules/drizzle-kit/bin.cjs', 'push', '--force', '--config', config], { stdout: 'pipe', stderr: 'pipe', env: process.env })
  const setupOutput = new Response(setup.stdout).text()
  const setupErrors = new Response(setup.stderr).text()
  assert.equal(await setup.exited, 0, `${await setupOutput}\n${await setupErrors}`)
  connection = postgres(databaseUrl.toString(), { max: 2, connection: { TimeZone: 'UTC' } })
  const sql = connection
  const userId = `mobile-flow-${randomUUID()}`, install = `test-${randomUUID()}`, token = randomUUID()
  await sql`insert into users (id,email,analytics_internal) values (${userId},${`${userId}@example.invalid`},true)`
  await sql`insert into sessions (session_token,user_id,expires) values (${token},${userId},${new Date(Date.now() + 600_000)})`
  let paid = false, providerMode: 'live' | 'replay' | 'failure' = 'live', providerCalls = 0, providerDelayMs = 0
  const captured = new Map<string, { text: string; type: string }>()
  const now = new Date(), end = new Date(now.getTime() + 7 * 86400_000)
  globalThis.fetch = (async (input, options) => {
    const url = String(input)
    if (url.startsWith('https://api.revenuecat.com/')) return Response.json({ subscriber: paid ? {
      entitlements: { [process.env.REVENUECAT_PRO_ENTITLEMENT_ID || 'pro']: { product_identifier: 'mogging.pro.weekly', expires_date: end.toISOString() } },
      subscriptions: { 'mogging.pro.weekly': { purchase_date: now.toISOString(), expires_date: end.toISOString(), store_transaction_id: `test-${database}`, store: 'app_store', is_sandbox: true } },
    } : {} })
    if (url.includes('/chat/completions')) {
      providerCalls++
      if (providerDelayMs) await new Promise(resolve => setTimeout(resolve, providerDelayMs))
      if (providerMode === 'failure') return Response.json({ error: 'injected outage' }, { status: 503 })
      const body = JSON.parse(String(options?.body))
      if (!live) {
        const prompt = String(body.messages[0].content)
        const overview = { faceDetected: true, pslScore: 5, overallScore: 7, harmonyScore: 7, symmetryScore: 7, proportionalityScore: 7, averagenessScore: 7, dimorphismScore: 7, angularityScore: 7,
          summary: 'Isolated transport fixture, not a real assessment.', categories: registry.categories.map(category => ({ id: category.id, score: 7, explanation: 'Isolated test observation.' })), eyeColor: 'blue', hairColor: 'brown', contours: { hair: [], ears: [] } }
        const definitions = prompt.startsWith('Assess') ? [] : JSON.parse(body.messages[1].content.find((item: any) => item.type === 'text').text.split('Requested definitions: ')[1].split('\nUpstream geometry: ')[0])
        const result = prompt.startsWith('Assess') ? overview : { capture: { front: true, side: false, hairline: true, neutralEyes: true, neutralMouth: true, bothEars: true, evenLight: true, detail: true },
          entries: definitions.map((rubric: any) => [rubric.id, designValues[rubric.id] ?? null, 'Test fixture.', ['T','D'].includes(rubric.output) ? null : 7, ['T','D'].includes(rubric.output) ? [] : [.7]]) }
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] })
      }
      const key = createHash('sha256').update(JSON.stringify(body.messages.map((message: any) => ({ ...message, content: Array.isArray(message.content) ? message.content.filter((item: any) => item.type !== 'image_url') : message.content })))).digest('hex')
      if (providerMode === 'replay') {
        const saved = captured.get(key)
        assert.ok(saved, 'Only real responses for the test portrait may be replayed')
        return new Response(saved.text, { headers: { 'content-type': saved.type } })
      }
      const response = await realFetch(input, options)
      if (!response.ok) return response
      const text = await response.text(), type = response.headers.get('content-type') || 'application/json'
      captured.set(key, { text, type })
      return new Response(text, { headers: { 'content-type': type } })
    }
    return realFetch(input, options)
  }) as typeof fetch
  const { default: entitlements } = await import('../../pages/api/payments/entitlements')
  const { default: analyze } = await import('../../pages/api/mobile/v2/analyze')
  const { handler: reports } = await import('../../pages/api/mobile/reports')
  const { handler: analytics } = await import('../../pages/api/analytics/events')
  const { parseBody } = await import('next/dist/server/api-utils/node/parse-body')
  server = createServer(async (req, response) => {
    const url = new URL(req.url!, 'http://localhost')
    const route = { '/api/payments/entitlements': entitlements, '/api/mobile/v2/analyze': analyze, '/api/mobile/reports': reports, '/api/analytics/events': analytics }[url.pathname]
    const res: any = response
    res.status = (status: number) => { res.statusCode = status; return res }
    res.json = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res }
    try {
      if (!route) { res.status(404).json({ error: 'Unknown test route' }); return }
      const request: any = req
      request.query = Object.fromEntries(url.searchParams)
      request.cookies = {}
      // Independent fault scenarios represent separate source networks. Retries
      // within each scenario retain one IP and exercise the real rate limiter.
      const scenario = String(req.headers['x-mogging-request-id'] || url.pathname).split(':retry:')[0]
      request.headers['x-forwarded-for'] = `192.0.2.${createHash('sha256').update(scenario).digest()[0] || 1}`
      if (req.method === 'POST') request.body = await parseBody(request, '12mb')
      await route(request, res)
    } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Request failed' }) }
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const authFetch = (url: string, options: RequestInit = {}) => realFetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } })
  const events: Array<{ name: string; properties: any }> = []
  const trackMobileEvent = (name: string, properties: unknown) => { events.push({ name, properties }); return Promise.resolve() }
  const mobileRoot = resolve('../mogging-mobile')
  const transpiler = new Bun.Transpiler({ loader: 'tsx' })
  const execute = (source: string, scope: Record<string, any>) => runInNewContext(transpiler.transformSync(source), scope)
  const paymentScope: any = { ...await import(join(mobileRoot, 'src/lib/payment-response.ts')), URLSearchParams, AbortController, setTimeout, clearTimeout, Error, Date, JSON, authFetch, getMoggingApiBaseUrl: () => base }
  const paymentSource = await readFile(join(mobileRoot, 'src/api/payments.ts'), 'utf8')
  execute(paymentSource.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.fetchAccess=fetchEntitlements;globalThis.PaymentApiError=PaymentApiError;', paymentScope)
  assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 0)

  // Unique metadata makes cleanup safe even if another test uses the same portrait.
  const image = await sharp(join(mobileRoot, 'assets/images/app-store/editorial-male-portrait.png')).resize(960, 1440).withMetadata({ exif: { IFD0: { ImageDescription: database } } }).jpeg({ quality: 85 }).toBuffer()
  const photoPath = join(folder, 'portrait.jpg')
  await writeFile(photoPath, image)
  const imageKey = `${createHash('sha256').update(image.toString('base64')).digest('hex')}.jpg`
  const { deleteStoredImages } = await import('../../lib/storage/images')
  cleanupImage = () => deleteStoredImages([imageKey])
  const landmarks = JSON.parse(await readFile(join(mobileRoot, 'src/data/report-v2/editorial-male-landmarks.json'), 'utf8'))
  const clientScope: any = { Error, Date, Math, JSON, Promise, Number, AbortController, setTimeout, clearTimeout, console,
    FileSystem: { readAsStringAsync: async (path: string) => (await readFile(path)).toString('base64'), getInfoAsync: async () => ({ exists: true }) },
    getMoggingApiBaseUrl: () => base, authFetch, trackMobileEvent, PaymentApiError: paymentScope.PaymentApiError,
    enrichFaceLandmarks: (value: unknown) => value, isFaceLandmarksUsable: () => true,
  }
  const clientSource = await readFile(join(mobileRoot, 'src/api/face-report.ts'), 'utf8')
  // Verify the server works for already-shipped clients with no processing poll.
  execute(clientSource.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '').replace('await waitForReportResponse(', 'await authFetch(') + '\nglobalThis.submit=submitFaceReport;', clientScope)
  const onboarding = await readFile(join(mobileRoot, 'src/screens/onboarding-screen.tsx'), 'utf8')
  const state: any = { reportStatus: 'preview', onboardingCompleted: false, entitlements: null }
  let consent = 0, saved = 0, navigated = 0
  const noop = () => {}
  Object.assign(clientScope, {
    useCallback: (fn: unknown) => fn, useEffectEvent: (fn: unknown) => fn, phase: 'preview',
    requireMobileSession: async () => ({ userId }), mobileInstallId: install, fetchEntitlements: paymentScope.fetchAccess,
    setEntitlements: (balance: unknown) => { state.entitlements = balance }, bindGuestPurchaseRecovery: async () => {},
    paymentGateCompleted: { current: false }, useAssessmentStore: { getState: () => state },
    setPurchasePending: noop, setPaywallVisible: noop, paywallLandmarksRef: { current: null }, setPaywallLandmarks: noop,
    requestThirdPartyAiConsent: () => { consent++ }, retryReport: noop,
  })
  execute(onboarding.slice(onboarding.indexOf('  const unlockPaidEvaluation = useCallback'), onboarding.indexOf('  const requestNativePurchase = useCallback')) + '\nglobalThis.unlock=unlockPaidEvaluation;', clientScope)
  assert.equal(await clientScope.unlock(), false)
  const { PurchaseAttempt } = await import(join(mobileRoot, 'src/analytics/purchase-attempt.ts'))
  Object.assign(clientScope, {
    unlockPaidEvaluation: clientScope.unlock,
    purchaseLoading: false, purchaseActionLock: { current: false }, feedbackOfferLoading: false,
    feedbackOfferProduct: null, feedbackOffer: null, acceptCancellationFeedback: noop,
    setPurchaseLoading: noop, setPurchaseError: (error: unknown) => { state.purchaseError = error },
    selectedRevenueCatPlan: 'weekly', ensureMobileSession: async () => ({ userId }),
    beginPurchaseAttempt: (context: any) => PurchaseAttempt.start({ ...context, channel: 'apple' }, { now: Date.now, id: randomUUID, save: async () => {}, emit: trackMobileEvent }),
    finishPurchaseAttempt: noop, setRevenueCatPaywall: noop, isNativeSubscriptionPackage: () => true,
    loadRevenueCatPaywall: async () => ({ packages: { weekly: { product: { identifier: 'mogging.pro.weekly', priceString: '$4.99', currencyCode: 'USD' } } }, storeProducts: {} }),
    purchaseRevenueCatPackage: async (_account: string, _product: unknown, beforeStore: () => Promise<void>, transaction: (id: string) => void) => {
      await beforeStore(); paid = true; transaction(`test-${database}`); return { entitlements: { active: { pro: {} } } }
    },
    hasRevenueCatPro: () => true, purchaseStoreEnvironment: () => 'sandbox',
    Alert: { alert: (_title: string, message: string) => { throw Error(message) } }, formatAppBuildDebug: () => 'integration test',
  })
  execute(onboarding.slice(onboarding.indexOf('  const requestNativePurchase = useCallback'), onboarding.indexOf('  const restoreNativePurchase = useCallback')) + '\nglobalThis.purchase=requestNativePurchase;', clientScope)
  await clientScope.purchase()
  assert.equal(state.purchaseError, null)
  assert.equal(events.filter(event => event.name === 'purchase_activated').length, 1)
  assert.equal(consent, 1)
  assert.equal(state.entitlements.evaluationCredits, 1)
  console.log('PASS: verified sandbox subscription activates exactly one scan through the real client and entitlement endpoint')

  // Lose the response after the server commits. The actual mobile transport must replay the same request.
  let lostResponse = false
  clientScope.authFetch = async (url: string, options: RequestInit) => {
    const response = await authFetch(url, options)
    if (url.endsWith('/analyze') && response.ok && !lostResponse) { lostResponse = true; await response.text(); throw Error('Network request failed') }
    return response
  }
  Object.assign(clientScope, {
    phase: 'report', reportAttempt: 0, photoUri: photoPath, evaluationGender: 'male', locationCoordinates: null,
    landmarksRef: { current: landmarks }, reportNavigationStarted: { current: false },
    hasReliableScanLandmarks: () => true, cacheLandmarks: noop, setLandmarks: noop,
    submitFaceReport: clientScope.submit, parseReportLandmarks: () => null, isEntitlementSummary: () => true,
    setReportStatus: (status: string) => { state.reportStatus = status }, setReportError: (error: unknown) => { state.error = error },
    setReportResult: (result: unknown) => { state.result = result },
    saveCurrentReport: () => { saved++ }, resetToReport: () => { navigated++ }, startReportHandoff: (fn: () => void) => fn(),
    setScanUpgradeOpen: noop, MISSING_PHOTO_ERROR: 'missing photo', getReportFailureMessage: () => 'Analysis failed',
  })
  const start = onboarding.indexOf('  const generateReport = useEffectEvent')
  execute(onboarding.slice(start, onboarding.indexOf('\n  useEffect(() => {', start)) + '\nglobalThis.generate=generateReport;', clientScope)
  await clientScope.generate({ cancelled: false, controller: new AbortController() })
  assert.equal(state.reportStatus, 'complete', state.error || JSON.stringify(state.result?.analysis))
  assert.equal(saved, 1); assert.equal(navigated, 1); assert.equal(lostResponse, true)
  assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 0)
  const persisted = await (await authFetch(`${base}/api/mobile/reports`)).json() as any
  assert.equal(persisted.data.reports.length, 1)
  assert.equal(persisted.data.reports[0].analysis.id, state.result.analysis.id)
  assert.ok(persisted.data.reports[0].analysis.metrics.report.categories.length >= 11)
  if (cloud) {
    const download = await realFetch(persisted.data.reports[0].photo.imageUrl)
    assert.equal(download.status, 200)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), image)
  } else assert.deepEqual(await readFile(join(folder, imageKey)), image)
  assert.equal(events.filter(event => event.name === 'evaluation_completed').length, 1)
  assert.equal(events.filter(event => event.name === 'evaluation_request_failed').length, 1)
  console.log(`PASS: actual mobile JPEG upload -> ${cloud ? 'R2 read-back' : 'disk read-back'} -> ${live ? 'live' : 'fixture'} analysis -> stored report -> client save/navigation; lost response replay uses one credit (${providerCalls} provider calls)`)

  // A fresh paid allowance allows fault injection without affecting a real account.
  await sql`update payment_entitlements set credit_balance=2 where source='subscription_allowance' and user_id=${userId}`
  providerMode = 'failure'
  const failed = await clientScope.submit({ photoUri: photoPath, landmarks, mobileInstallId: install, evaluationId: 'provider-outage' })
  assert.equal(failed.analysis.status, 'failed')
  assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 2)
  providerMode = 'replay'
  const { env } = await import('../../lib/env')
  const storageAccount = env.R2_ACCOUNT_ID
  env.R2_ACCOUNT_ID = undefined
  env.IMAGE_STORAGE_DIR = photoPath // A file, so image writes fail deterministically.
  const beforeStorageFailure = providerCalls
  try {
    await assert.rejects(clientScope.submit({ photoUri: photoPath, landmarks, mobileInstallId: install, evaluationId: 'storage-outage' }), /save the report image/)
    assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 2)
    assert.equal(providerCalls, beforeStorageFailure, 'Failed storage must not start provider work')
  } finally { env.R2_ACCOUNT_ID = storageAccount; env.IMAGE_STORAGE_DIR = folder }
  console.log('PASS: provider outage and image-storage outage return credits and cannot deliver a fake completed evaluation')
  let storageRecovered = false
  clientScope.authFetch = async (url: string, options: RequestInit) => {
    const response = await authFetch(url, options)
    if (response.status === 503 && !storageRecovered) {
      storageRecovered = true
      env.R2_ACCOUNT_ID = storageAccount; env.IMAGE_STORAGE_DIR = folder
    }
    return response
  }
  env.R2_ACCOUNT_ID = undefined; env.IMAGE_STORAGE_DIR = photoPath
  const recovered = await clientScope.submit({ photoUri: photoPath, landmarks, mobileInstallId: install, evaluationId: 'after-outage' })
  assert.equal(storageRecovered, true)
  assert.equal(recovered.analysis.status, 'complete')
  assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 1)
  console.log('PASS: evaluation succeeds after outage with exactly one debit')
  providerDelayMs = 500
  let interrupted = false, discarded: Promise<unknown> | undefined
  clientScope.authFetch = async (url: string, options: RequestInit) => {
    const pending = authFetch(url, options)
    if (url.endsWith('/analyze') && !interrupted) {
      interrupted = true
      discarded = pending.then(response => response.text())
      await new Promise(resolve => setTimeout(resolve, 50))
      throw Error('Network request failed')
    }
    return pending
  }
  const inFlight = await clientScope.submit({ photoUri: photoPath, landmarks, mobileInstallId: install, evaluationId: 'interrupted-in-flight' })
  await discarded
  assert.equal(inFlight.analysis.status, 'complete')
  assert.equal((await paymentScope.fetchAccess(install, userId)).evaluationCredits, 0)
  console.log('PASS: backend waits for the original in-flight evaluation, delivers its saved report and debits once without client polling')
  const delivered = await authFetch(`${base}/api/analytics/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: events.map((event, index) => ({ eventId: randomUUID(), eventName: event.name, accountId: userId, mobileInstallId: install, anonymousId: install, sessionId: install, platform: 'ios', source: 'mobile', schemaVersion: 1, environment: 'development', appVersion: 'flow-test', properties: event.properties, occurredAt: new Date(now.getTime() + index).toISOString() })) }) })
  const ingestion = await delivered.json() as any
  assert.equal(delivered.status, 202, JSON.stringify(ingestion))
  assert.equal(ingestion.data.rejected, 0)
  console.log('PASS: real evaluation telemetry accepted by the analytics endpoint')
} finally {
  try { await cleanupImage?.() }
  finally {
    globalThis.fetch = realFetch
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    await connection?.end()
    await (globalThis as any).postgresClient?.end()
    if (created) await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
    await admin.end()
    await rm(config, { force: true })
    await rm(folder, { recursive: true, force: true })
  }
}
