// Real provider checks against the isolated local app; never run against production.
import assert from 'node:assert/strict'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../../lib/env'
import { storeImageDataUrl } from '../../lib/storage/images'
import { newCourseContent, type CourseRecord, type CourseAsset } from '../../lib/courses/client'
import { courseSession, courseTestOrigin } from './course-http'

assert.equal(env.COURSE_R2_BUCKET_NAME, 'mogging-course-resources')
assert.ok(env.R2_BUCKET_NAME && env.R2_BUCKET_NAME !== env.COURSE_R2_BUCKET_NAME)
const fixture = await Bun.file('.local/course-accounts.json').json()
assert.equal(fixture.creator, 'creator@mogging.test')
assert.equal(fixture.buyer, 'buyer@mogging.test')
const creator = await courseSession(fixture.creator, fixture.password)
const buyer = await courseSession(fixture.buyer, fixture.password)
await creator.api('/api/admin/creator/session', 'POST', { password: fixture.password })
const client = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! } })
const content = newCourseContent()
content.title = 'R2 attachment verification'
content.summary = 'Private attachment integration fixture.'
content.description = 'A synthetic course for testing private downloads.'
content.refundPolicy = 'Free local test fixture.'
const lesson = content.sections[0].lessons[0]
lesson.title = 'Attachment checks'
lesson.body = '# Test attachments\n\nOnly synthetic files are used in this course.'
let course = await creator.api<CourseRecord>('/api/creator/courses', 'POST', { slug: `r2-check-${crypto.randomUUID().slice(0, 8)}`, content })
await Bun.write('.local/course-r2-fixture.json', JSON.stringify({ courseId: course.id, lessonId: lesson.id }))
const base = `/api/creator/courses/${course.id}`
const bytes = Buffer.from('Mogging private attachment integration check.\n')
const input = { kind: 'resource', title: 'integration-check.txt', contentType: 'text/plain', sizeBytes: bytes.length }
type Ticket = { assetId: string; url: string; headers: Record<string, string> }
const ticket = await creator.api<Ticket>(`${base}/uploads`, 'POST', input)
const key = `courses/${course.id}/${ticket.assetId}`
const preflight = await fetch(ticket.url, { method: 'OPTIONS', headers: { Origin: courseTestOrigin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } })
assert.ok(preflight.ok, `R2 preflight failed (${preflight.status})`)
assert.equal(preflight.headers.get('access-control-allow-origin'), courseTestOrigin)
assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('PUT'))
const untrusted = await fetch(ticket.url, { method: 'OPTIONS', headers: { Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } })
assert.notEqual(untrusted.headers.get('access-control-allow-origin'), 'https://attacker.example')
const resumed = await creator.api<Ticket>(`${base}/assets/${ticket.assetId}/resume`, 'POST', input)
assert.equal(resumed.assetId, ticket.assetId)
const upload = await fetch(resumed.url, { method: 'PUT', headers: { ...resumed.headers, Origin: courseTestOrigin }, body: bytes })
assert.equal(upload.status, 200, `R2 upload failed (${upload.status})`)
assert.equal(upload.headers.get('access-control-allow-origin'), courseTestOrigin)
const ready = await creator.api<CourseAsset>(`${base}/assets/${ticket.assetId}/complete`, 'POST', {})
assert.equal(ready.state, 'ready')
assert.equal(ready.sizeBytes, bytes.length)
console.log('PASS: real upload, browser CORS, untrusted-origin exclusion, resumed reservation and provider HEAD verification')

lesson.resourceAssetIds = [ticket.assetId]
course = await creator.api<CourseRecord>(base, 'PUT', { version: course.version, content })
await assert.rejects(creator.api(`${base}/assets/${ticket.assetId}`, 'DELETE'), /409:/)
await creator.api(`${base}/submit`, 'POST', { version: course.version })
await creator.api(`/api/admin/courses/${course.id}/review`, 'POST', { version: course.version, decision: 'approve', note: 'Synthetic R2 verification fixture' })
const path = `/api/courses/${course.id}/lessons/${lesson.id}/assets/${ticket.assetId}`
assert.equal((await fetch(courseTestOrigin + path)).status, 403)
assert.equal((await buyer.request(path)).status, 403)
await buyer.api(`/api/courses/${course.id}/checkout`, 'POST', {})
const download = await buyer.api<{ url: string }>(path)
const response = await fetch(download.url)
assert.equal(response.status, 200)
assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
assert.equal(response.headers.get('content-type'), 'application/octet-stream')
assert.ok(response.headers.get('content-disposition')?.startsWith('attachment;'))
assert.equal((await buyer.request(path + '?draft=true')).status, 403)
const unsigned = new URL(download.url); unsigned.search = ''
assert.ok([400, 403].includes((await fetch(unsigned)).status))
const tampered = new URL(download.url); tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64))
assert.equal((await fetch(tampered)).status, 403)
const expired = await getSignedUrl(client, new GetObjectCommand({ Bucket: env.COURSE_R2_BUCKET_NAME, Key: key }), { expiresIn: 1, signingDate: new Date(Date.now() - 60_000) })
assert.equal((await fetch(expired)).status, 403)
const crossCourse = `/api/courses/fc8563d2-67dd-4bcf-8cf9-44c4bf930066/lessons/276eec62-2467-4e17-ae39-f6c52571bd9d/assets/${ticket.assetId}`
assert.equal((await buyer.request(crossCourse)).status, 404)
console.log('PASS: enrolled download matches bytes; anonymous, unenrolled, draft, cross-course, unsigned, tampered and expired access rejected')

lesson.resourceAssetIds = []
course = await creator.api<CourseRecord>(base, 'PUT', { version: course.version, content })
await assert.rejects(creator.api(`${base}/assets/${ticket.assetId}`, 'DELETE'), /409:/)
await creator.api(`${base}/submit`, 'POST', { version: course.version })
await creator.api(`/api/admin/courses/${course.id}/review`, 'POST', { version: course.version, decision: 'approve', note: 'Remove synthetic attachment' })
await creator.api(`${base}/assets/${ticket.assetId}`, 'DELETE')
await assert.rejects(client.send(new HeadObjectCommand({ Bucket: env.COURSE_R2_BUCKET_NAME, Key: key })), (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
console.log('PASS: draft and published references prevent deletion; detached attachment is deleted from R2')

const mismatch = await creator.api<Ticket>(`${base}/uploads`, 'POST', { ...input, sizeBytes: bytes.length + 1 })
assert.equal((await fetch(mismatch.url, { method: 'PUT', headers: mismatch.headers, body: bytes })).status, 403)
await client.send(new PutObjectCommand({ Bucket: env.COURSE_R2_BUCKET_NAME, Key: `courses/${course.id}/${mismatch.assetId}`, Body: bytes, ContentType: input.contentType }))
await assert.rejects(creator.api(`${base}/assets/${mismatch.assetId}/complete`, 'POST', {}), /400:/)
const assets = await creator.api<CourseAsset[]>(`${base}/assets`)
assert.equal(assets.find(asset => asset.id === mismatch.assetId)?.state, 'failed')
await creator.api(`${base}/assets/${mismatch.assetId}`, 'DELETE')
console.log('PASS: mismatched attachment metadata is rejected and cleaned up')

// A unique valid PNG prevents collision with any existing user's content-addressed photo.
const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO5kAAAAASUVORK5CYII=', 'base64'), Buffer.from(crypto.randomUUID())])
const image = await storeImageDataUrl(`data:image/png;base64,${png.toString('base64')}`)
try {
  const head = await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: image.imageStorageKey }))
  assert.equal(head.ContentLength, png.length)
  assert.equal(head.ContentType, 'image/png')
  const photo = await fetch(image.imageUrl)
  assert.equal(photo.status, 200)
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png)
} finally { await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: image.imageStorageKey })) }
console.log('PASS: existing photo storage helper still uploads and serves the correct bytes; synthetic photo removed')
console.log('R2 checks passed. The synthetic course remains available for browser upload verification; no real user assets were modified.')
