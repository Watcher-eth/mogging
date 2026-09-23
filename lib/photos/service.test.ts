import { describe, expect, test } from 'bun:test'
import { createPhotoRecordSchema } from './service'
import { photos } from '@/lib/db/schema'

const upload = { imageUrl: '/test.jpg', imageHash: 'a'.repeat(64) }

describe('photo publication consent', () => {
  test('user uploads stay private without explicit consent, including unknown gender', () => {
    const photo = createPhotoRecordSchema.parse(upload)
    expect(photo.source).toBe('user')
    expect(photo.isPublic).toBe(false)
    expect(photo.gender).toBe('other')
  })

  test('an explicit publication choice is preserved for curated imports', () => {
    expect(createPhotoRecordSchema.parse({ ...upload, source: 'seeded', isPublic: true }).isPublic).toBe(true)
    expect(createPhotoRecordSchema.parse({ ...upload, isPublic: false }).isPublic).toBe(false)
  })

  test('the database default also requires opt-in', () => {
    expect(photos.isPublic.default).toBe(false)
  })
})
