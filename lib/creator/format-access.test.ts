import { describe, expect, test } from 'bun:test'
import { getAvailableCreatorSubmissionFormats } from './format-access'

const cruxId = '05a9b642-86c3-4426-8a8c-722de711e08d'
const formatIds = (profile: Parameters<typeof getAvailableCreatorSubmissionFormats>[0]) =>
  getAvailableCreatorSubmissionFormats(profile).map((format) => format.id)

describe('creator format access', () => {
  test('verified Crux can use both formats', () => {
    expect(formatIds({ userId: cruxId, authStatus: 'verified' })).toEqual(['general-creator-video-v1', 'custom-video-v1'])
  })

  test('other creators and missing profiles only receive the general format', () => {
    for (const profile of [undefined, null, { userId: 'another-user', authStatus: 'verified' }, { userId: 'crux', authStatus: 'verified' }]) {
      expect(formatIds(profile)).toEqual(['general-creator-video-v1'])
    }
  })

  test('pending or suspended Crux cannot use the custom format', () => {
    for (const authStatus of ['pending', 'suspended']) {
      expect(formatIds({ userId: cruxId, authStatus })).toEqual(['general-creator-video-v1'])
    }
  })
})
