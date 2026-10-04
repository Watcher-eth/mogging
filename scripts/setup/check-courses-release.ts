// Read-only provider/schema checks. Run with the target environment's private configuration.
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { env, getCourseReadinessChecks } from '../../lib/env'
import { getCourseStripe, courseStripeOptions } from '../../lib/courses/stripe'
import { bunny, resourceHead, resourceUpload, videoPlayback, videoThumbnail } from '../../lib/courses/providers'
import { courseAccountEventTypes } from '../../lib/courses/webhooks'

const live = process.argv.includes('--live')
const staging = process.argv.includes('--staging')
assert.ok(!(live && staging), 'Choose --live or --staging')
if (staging) assert.equal(env.COURSE_LIVE_PAYMENTS_ENABLED, false, 'Keep live payments disabled in staging')
const config = { ...env, COURSES_ENABLED: true, COURSE_LIVE_PAYMENTS_ENABLED: live }
const checks = getCourseReadinessChecks(config)
for (const check of checks) console.log(`${check.ok ? 'ok' : check.required ? 'missing' : 'optional'}\t${check.key}`)
if (checks.some(check => check.required && !check.ok)) process.exit(1)

let failures = 0
async function check(name: string, action: () => Promise<void>) {
  try { await action(); console.log(`ok\t${name}`) }
  catch (error) {
    failures++
    // Provider errors may contain sensitive URLs or connection details.
    const status = (error as { statusCode?: number; $metadata?: { httpStatusCode?: number } }).statusCode || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    console.log(`failed\t${name}${status ? `\tHTTP ${status}` : ''}`)
  }
}
const client = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 })
let resourceKey: string | undefined
await check(live || staging ? 'course database schema and migration ledger' : 'course database schema', async () => {
  try {
    await client`select watched_ranges, video_asset_id from course_progress limit 0`
    await client`select id from course_emails limit 0`
    const resources = await client<{ storage_key: string }[]>`select storage_key from course_assets where kind = 'resource' and state = 'ready' limit 1`
    resourceKey = resources[0]?.storage_key
    if (live || staging) {
      const rows = await client<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`
      const journal = await Bun.file('drizzle/meta/_journal.json').json()
      const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' })
      for (const tag of ['0040_course_platform', '0042_course_watch_progress']) {
        const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag)
        assert.ok(rows.some(row => row.hash === migrations[index].hash))
      }
    }
  } finally { await client.end() }
})
await check(live ? 'Stripe live US activation' : 'Stripe sandbox platform access', async () => {
  const platform = await getCourseStripe().accounts.retrieveCurrent({}, courseStripeOptions)
  if (live) {
    assert.equal(platform.country, 'US')
    assert.equal(platform.charges_enabled, true)
    assert.equal(platform.payouts_enabled, true)
    assert.equal(platform.details_submitted, true)
  } else assert.ok(env.COURSE_STRIPE_SECRET_KEY?.startsWith('sk_test_') || env.COURSE_STRIPE_SECRET_KEY?.startsWith('rk_test_'))
})
if (live || staging) await check(`${live ? 'live' : 'sandbox'} HTTPS Connect destinations, scope, payload and events`, async () => {
  assert.ok(env.NEXTAUTH_URL)
  const origin = new URL(env.NEXTAUTH_URL).origin
  assert.equal(new URL(origin).protocol, 'https:')
  const destinations = await getCourseStripe().v2.core.eventDestinations.list({ include: ['webhook_endpoint.url'] }, courseStripeOptions).autoPagingToArray({ limit: 1000 })
  const snapshot = destinations.find(item => item.webhook_endpoint?.url === `${origin}/api/payments/stripe-connect-webhook` && item.event_payload === 'snapshot' && item.events_from?.includes('@accounts') && item.status === 'enabled' && item.livemode === live)
  const thin = destinations.find(item => item.webhook_endpoint?.url === `${origin}/api/payments/stripe-connect-account-webhook` && item.event_payload === 'thin' && item.events_from?.includes('@self') && item.status === 'enabled' && item.livemode === live)
  assert.equal(snapshot?.snapshot_api_version, courseStripeOptions.apiVersion)
  const paymentEvents = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded', 'charge.updated', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'refund.created', 'refund.updated', 'refund.failed', 'account.updated', 'account.application.deauthorized']
  assert.ok(snapshot && paymentEvents.every(type => snapshot.enabled_events.includes('*') || snapshot.enabled_events.includes(type)))
  assert.ok(thin && [...courseAccountEventTypes].every(type => thin.enabled_events.includes('*') || thin.enabled_events.includes(type)))
})
await check('Bunny video API and protected signed thumbnail', async () => {
  const videos = await bunny<{ items: { guid: string; status: number }[] }>('?page=1&itemsPerPage=10')
  const video = videos.items.find(item => item.status === 4)
  assert.ok(video, 'A ready verification video is required')
  const signed = await videoThumbnail(video.guid)
  assert.ok(signed.body.byteLength > 0)
  const playback = await bunny<{ thumbnailUrl: string; tokenAuthEnabled: boolean }>(`/${video.guid}/play${new URL(videoPlayback(video.guid).url).search}`)
  assert.equal(playback.tokenAuthEnabled, true)
  const unsigned = new URL(playback.thumbnailUrl)
  assert.ok(unsigned.hostname.endsWith('.b-cdn.net'))
  unsigned.search = ''
  const referer = new URL('/', env.NEXTAUTH_URL || env.NEXT_PUBLIC_SITE_URL || 'https://mogging.com').toString()
  assert.ok([401, 403].includes((await fetch(unsigned, { headers: { Referer: referer }, signal: AbortSignal.timeout(15_000) })).status))
})
await check('private course bucket credentials and browser upload CORS', async () => {
  assert.ok(resourceKey, 'Upload a private verification resource before running the release check')
  const resource = await resourceHead(resourceKey)
  assert.ok(resource.ContentLength && resource.ContentType)
  const origin = new URL(env.NEXTAUTH_URL!).origin
  // OPTIONS exercises browser CORS without uploading or modifying the object.
  const upload = await resourceUpload(resourceKey, resource.ContentType, resource.ContentLength)
  const cors = await fetch(upload, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(15_000) })
  assert.ok(cors.ok)
  assert.equal(cors.headers.get('access-control-allow-origin'), origin)
  assert.ok(cors.headers.get('access-control-allow-methods')?.includes('PUT'))
})
console.log('Email delivery, HTTPS webhook signature delivery, public bucket settings, backups and a real pilot purchase still require the release checklist.')
process.exit(failures ? 1 : 0)
