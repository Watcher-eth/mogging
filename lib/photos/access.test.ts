import { expect, test } from 'bun:test'
import { canReadPhoto, ownsPhoto } from './access'
const photo = { userId: 'owner', anonymousActorId: null, isPublic: false }
const guest = { userId: null, anonymousActorId: null }
test('private mobile-created reports are available only to their owner', () => {
  expect(canReadPhoto(photo, { ...guest, userId: 'owner' })).toBe(true)
  expect(canReadPhoto(photo, { ...guest, userId: 'someone-else' })).toBe(false)
  expect(canReadPhoto(photo, guest)).toBe(false)
})
test('explicitly public reports can be viewed but not managed by visitors', () => {
  expect(canReadPhoto({ ...photo, isPublic: true }, guest)).toBe(true)
  expect(ownsPhoto(photo, guest)).toBe(false)
  expect(canReadPhoto(photo, guest)).toBe(false)
})
test('missing ownership is never treated as a matching anonymous owner', () => {
  expect(canReadPhoto({ ...photo, userId: null }, guest)).toBe(false)
  expect(canReadPhoto({ ...photo, userId: null, anonymousActorId: 'actor' }, { ...guest, anonymousActorId: 'actor' })).toBe(true)
  expect(ownsPhoto({ ...photo, anonymousActorId: 'actor' }, { ...guest, anonymousActorId: 'actor' })).toBe(false)
})
