import assert from 'node:assert/strict'
import test from 'node:test'
import { env } from '@/lib/env'
import { deleteStoredImages, storedImageKeyFromUrl } from './images'

test('deletion resolves only Mogging content-addressed image URLs', () => {
  const key = `${'a'.repeat(64)}.jpg`
  const base = (env.R2_PUBLIC_BASE_URL || env.IMAGE_PUBLIC_BASE_URL || '/uploads').replace(/\/$/, '')
  assert.equal(storedImageKeyFromUrl(`${base}/${key}`), key)
  assert.equal(storedImageKeyFromUrl(`https://untrusted.example/${key}`), null)
  assert.equal(storedImageKeyFromUrl(`${base}/../${key}`), null)
  assert.equal(storedImageKeyFromUrl(`${base}/${key}?redirect=other`), null)
  assert.equal(storedImageKeyFromUrl(null), null)
})

test('deletion rejects paths and non-image objects before touching storage', async () => {
  for (const key of ['../private-file', '/absolute-file', 'creators/video.mp4', `${'a'.repeat(64)}.jpg/other`]) {
    await assert.rejects(deleteStoredImages([key]), /Invalid image storage key/)
  }
})
