import { expect, mock, test } from 'bun:test'
let viewer: string | null = null
const photo = { id: 'photo', userId: 'owner', anonymousActorId: null, isPublic: false, imageUrl: '/model.png', imageHash: 'hash' }
const analysis = { id: 'analysis', photo, status: 'complete', metrics: { report: { summary: 'Saved mobile report' } } }
mock.module('@/lib/auth/mobile-session', () => ({ getRequestUserId: async () => viewer }))
mock.module('@/lib/db', async () => {
  const schema = await import('../db/schema')
  return { schema, db: {
    query: { analyses: { findFirst: async () => analysis } },
    update: () => ({ set: (values: { isPublic: boolean }) => ({ where: () => ({ returning: async () => {
      if (viewer !== photo.userId) return []
      photo.isPublic = values.isPublic
      return [{ id: photo.id, isPublic: photo.isPublic }]
    } }) }) }),
  } }
})
const { default: read } = await import('../../pages/api/analysis/[id]')
const { default: publish } = await import('../../pages/api/photos/privacy')
async function call(handler: any, method: string, body?: unknown) {
  const result = { status: 0, body: null as any, headers: {} as Record<string, string> }
  const res = { setHeader: (key: string, value: string) => { result.headers[key] = value }, status: (status: number) => { result.status = status; return res }, json: (body: unknown) => { result.body = body; return res } }
  await handler({ method, query: { id: analysis.id }, headers: {}, body }, res)
  return result
}
test('publication is owner-authorized, reversible, and controls full report access', async () => {
  viewer = null
  expect((await call(read, 'GET')).status).toBe(404)
  expect((await call(publish, 'POST', { photoId: photo.id, isPublic: true })).status).toBe(401)
  viewer = 'stranger'
  expect((await call(publish, 'POST', { photoId: photo.id, isPublic: true })).status).toBe(404)
  viewer = 'owner'
  const own = await call(read, 'GET')
  expect(own.body.data.analysis.id).toBe('analysis')
  expect(own.body.data.canManage).toBe(true)
  expect((await call(publish, 'POST', { photoId: photo.id, isPublic: true })).body.data.photo.isPublic).toBe(true)
  viewer = null
  const shared = await call(read, 'GET')
  expect(shared.status).toBe(200)
  expect(shared.body.data.analysis.metrics.report.summary).toBe('Saved mobile report')
  expect(shared.body.data.canManage).toBe(false)
  expect(shared.headers['Cache-Control']).toBe('private, no-store')
  viewer = 'owner'
  expect((await call(publish, 'POST', { photoId: photo.id, isPublic: false })).body.data.photo.isPublic).toBe(false)
  viewer = null
  expect((await call(read, 'GET')).status).toBe(404)
})
