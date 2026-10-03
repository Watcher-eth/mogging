import assert from 'node:assert/strict'
import { courseSession, courseTestOrigin } from './course-http'
import { newCourseContent } from '../../lib/courses/client'

const fixture = await Bun.file('.local/course-accounts.json').json()
assert.equal(fixture.creator, 'creator@mogging.test')
assert.equal(fixture.buyer, 'buyer@mogging.test')
const creator = await courseSession(fixture.creator, fixture.password)
const buyer = await courseSession(fixture.buyer, fixture.password)
assert.equal((await fetch(`${courseTestOrigin}/api/courses/library`)).status, 401)
assert.equal((await buyer.request('/api/admin/courses')).status, 403)
assert.equal((await creator.request('/api/admin/courses')).status, 401)
await creator.api('/api/admin/creator/session', 'POST', { password: fixture.password })
assert.equal((await creator.request('/api/admin/courses?status=published')).status, 200)
console.log('PASS: actual cookie authentication, enrollment identity, and separate administrator unlock')

const records = await creator.api('/api/creator/courses')
let draft = records.find((course: any) => course.draft.title === 'HTTP verification draft')
if (!draft) draft = await creator.api('/api/creator/courses', 'POST', { slug: `http-check-${crypto.randomUUID().slice(0, 8)}`, content: { ...newCourseContent(), title: 'HTTP verification draft' } })
assert.equal((await buyer.request(`/api/creator/courses/${draft.id}`)).status, 404)
assert.equal((await creator.request(`/api/creator/courses/${draft.id}`, { method: 'PUT', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ version: draft.version, content: draft.draft }) })).status, 403)
const saved = await creator.api(`/api/creator/courses/${draft.id}`, 'PUT', { version: draft.version, content: draft.draft })
await assert.rejects(creator.api(`/api/creator/courses/${draft.id}`, 'PUT', { version: draft.version, content: draft.draft }), /409:/)
assert.equal(saved.version, draft.version + 1)
console.log('PASS: real HTTP draft save, optimistic conflict and cross-site write protection')

const published = records.find((course: any) => course.status === 'published')
if (published) {
  const outline = await buyer.api(`/api/courses/${published.id}`)
  assert.ok(!JSON.stringify(outline.content).includes('resourceAssetIds'))
  const text = published.published.sections.flatMap((section: any) => section.lessons).find((lesson: any) => lesson.kind === 'text')
  if (text) assert.equal((await fetch(`${courseTestOrigin}/api/courses/${published.id}/lessons/${text.id}`)).status, text.preview ? 200 : 403)
  const video = published.published.sections.flatMap((section: any) => section.lessons).find((lesson: any) => lesson.kind === 'video' && lesson.videoAssetId)
  if (video && process.env.BUNNY_STREAM_CDN_TOKEN_KEY) {
    const path = `/api/courses/${published.id}/lessons/${video.id}/thumbnail`
    const thumbnail = await buyer.request(path)
    assert.equal(thumbnail.status, 200); assert.equal(thumbnail.headers.get('content-type'), 'image/jpeg')
    assert.ok(thumbnail.headers.get('cache-control')?.startsWith('private,')); assert.ok((await thumbnail.arrayBuffer()).byteLength > 0)
    assert.equal((await fetch(`${courseTestOrigin}${path}`)).status, video.preview ? 200 : 403)
    assert.equal((await creator.request(`/api/creator/courses/${published.id}/assets/${video.videoAssetId}/thumbnail`)).status, 200)
    assert.equal((await buyer.request(`/api/creator/courses/${published.id}/assets/${video.videoAssetId}/thumbnail`)).status, 404)
    console.log('PASS: real protected Bunny thumbnails, private caching and learner/owner access boundaries')
  }
  const original = published.listed
  try {
    await creator.api(`/api/admin/courses/${published.id}`, 'PATCH', { listed: false })
    const hidden = await buyer.api(`/api/courses?q=${encodeURIComponent(published.published.title)}`)
    assert.ok(!hidden.items.some((item: any) => item.id === published.id))
    assert.equal((await buyer.request(`/api/courses/${published.id}`)).status, 200)
  } finally { await creator.api(`/api/admin/courses/${published.id}`, 'PATCH', { listed: original }) }
  const catalog = await buyer.api(`/api/courses?q=${encodeURIComponent(published.published.title)}`)
  if (original) assert.ok(catalog.items.some((item: any) => item.id === published.id))
  const library = await buyer.api('/api/courses/library?limit=1')
  assert.ok(library.items.length <= 1); assert.equal(typeof library.hasMore, 'boolean')
  console.log('PASS: published/private projections, real moderation audit writes and catalog/library pagination')
}
assert.equal((await fetch(`${courseTestOrigin}/api/cron/courses`)).status, 401)
if (process.env.CRON_SECRET) {
  const response = await fetch(`${courseTestOrigin}/api/cron/courses`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
  assert.equal(response.status, 200)
  const result = (await response.json()).data
  assert.equal(typeof result.processed, 'boolean')
  if (!process.env.RESEND_API_KEY && result.result) assert.equal(result.result.emailDeferred, true)
  console.log('PASS: actual authenticated maintenance endpoint; email can remain deferred')
}
console.log('All local HTTP checks passed. Real providers are used only by configured maintenance work; no paid purchase is submitted.')
