// Isolate SDK mocks so this check cannot contaminate other payment suites.
import assert from 'node:assert/strict'

for (const courseKey of ['sk_test_course_fixture', 'sk_live_course_fixture', '']) {
  const result = Bun.spawnSync(['bun', '-e', `
    import assert from 'node:assert/strict'
    import { mock } from 'bun:test'
    const clients = []
    mock.module('stripe', () => ({ default: class {
      constructor(key, options) { clients.push({ key, options }) }
    } }))
    const { getStripe } = await import('./lib/payments/stripe')
    const { getCourseStripe, courseStripeOptions } = await import('./lib/courses/stripe')
    const { env, getCourseReadinessChecks } = await import('./lib/env')
    const main = getStripe()
    assert.equal(getStripe(), main)
    assert.equal(clients[0].key, 'sk_live_main_fixture')
    assert.equal(courseStripeOptions.apiVersion, '2026-08-26.dahlia')
    if (process.env.COURSE_STRIPE_SECRET_KEY) {
      const course = getCourseStripe()
      assert.notEqual(course, main)
      assert.equal(getCourseStripe(), course)
      assert.equal(clients[1].key, process.env.COURSE_STRIPE_SECRET_KEY)
      assert.equal(clients[1].options.timeout, 10000)
      assert.equal(clients[1].options.maxNetworkRetries, 2)
    } else {
      assert.throws(getCourseStripe, /COURSE_STRIPE_SECRET_KEY is required/)
      assert.equal(clients.length, 1)
    }
    const checks = getCourseReadinessChecks({ ...env, COURSES_ENABLED: true, COURSE_LIVE_PAYMENTS_ENABLED: true })
    assert.equal(checks.find(c => c.key === 'COURSE_STRIPE_SECRET_KEY').ok, !!process.env.COURSE_STRIPE_SECRET_KEY)
    assert.equal(checks.find(c => c.key === 'COURSE_STRIPE_LIVE_KEY').ok, process.env.COURSE_STRIPE_SECRET_KEY.startsWith('sk_live_'))
  `], {
    env: { ...process.env, DATABASE_URL: 'postgres://fixture@127.0.0.1/unused', STRIPE_SECRET_KEY: 'sk_live_main_fixture', COURSE_STRIPE_SECRET_KEY: courseKey },
    stdout: 'pipe', stderr: 'pipe',
  })
  assert.equal(result.exitCode, 0, result.stderr.toString())
}
console.log('PASS: separate main-app/course Stripe credentials, cached clients and missing/live-key guards')
