import { expect, test } from 'bun:test'
import { coursePagesEnabled } from './pages'
import { env, getCourseReadinessChecks } from '@/lib/env'

test('production course pages require both hosting and the explicit launch gate', () => {
  const config = { NODE_ENV: 'production' as const, COURSES_ENABLED: false, COURSE_PUBLIC_LAUNCH_ENABLED: false }
  expect(coursePagesEnabled(config)).toBe(false)
  expect(coursePagesEnabled({ ...config, COURSE_PUBLIC_LAUNCH_ENABLED: true })).toBe(false)
  expect(coursePagesEnabled({ ...config, COURSES_ENABLED: true })).toBe(false)
  expect(coursePagesEnabled({ ...config, COURSES_ENABLED: true, COURSE_PUBLIC_LAUNCH_ENABLED: true })).toBe(true)
  expect(coursePagesEnabled({ ...config, NODE_ENV: 'development', COURSES_ENABLED: true })).toBe(true)
})

test('live launch readiness rejects sandbox keys, shared photo buckets and deferred email', () => {
  const config = { ...env, COURSES_ENABLED: true, COURSE_LIVE_PAYMENTS_ENABLED: true, COURSE_STRIPE_SECRET_KEY: 'sk_test_fixture', R2_BUCKET_NAME: 'photos', COURSE_R2_BUCKET_NAME: 'photos', RESEND_API_KEY: undefined }
  const checks = getCourseReadinessChecks(config)
  for (const key of ['COURSE_STRIPE_LIVE_KEY', 'COURSE_BUCKET_ISOLATION', 'COURSE_EMAIL']) {
    expect(checks.find(check => check.key === key)).toMatchObject({ ok: false, required: true })
  }
  const ready = getCourseReadinessChecks({ ...config, COURSE_STRIPE_SECRET_KEY: 'sk_live_fixture', COURSE_R2_BUCKET_NAME: 'course-resources', RESEND_API_KEY: 'fixture', PAYMENTS_EMAIL_FROM: 'courses@mogging.test' })
  for (const key of ['COURSE_STRIPE_LIVE_KEY', 'COURSE_BUCKET_ISOLATION', 'COURSE_EMAIL']) expect(ready.find(check => check.key === key)?.ok).toBe(true)
  expect(getCourseReadinessChecks({ ...config, COURSES_ENABLED: false }).find(check => check.key === 'COURSE_LAUNCH_GATE')?.ok).toBe(false)
})

test('course hosting requires OAuth and Bunny webhook verification credentials', () => {
  const checks = getCourseReadinessChecks({ ...env, COURSES_ENABLED: true, STRIPE_CONNECT_CLIENT_ID: undefined, BUNNY_STREAM_READ_ONLY_KEY: undefined })
  for (const key of ['STRIPE_CONNECT_CLIENT_ID', 'BUNNY_STREAM_READ_ONLY_KEY']) expect(checks.find(check => check.key === key)).toMatchObject({ ok: false, required: true })
})
