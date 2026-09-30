import { expect, test } from 'bun:test'
import { createCreatorTikTokState, readCreatorTikTokState } from './tiktok-oauth'

test('OAuth starts without a username or recording and remains bound to the initiating user and state', () => {
  const { state, cookieValue } = createCreatorTikTokState('user')
  expect(readCreatorTikTokState(cookieValue, state, 'user')?.userId).toBe('user')
  expect(readCreatorTikTokState(cookieValue, state, 'other')).toBeNull()
  expect(readCreatorTikTokState(cookieValue, 'wrong', 'user')).toBeNull()
  expect(readCreatorTikTokState(`x${cookieValue}`, state, 'user')).toBeNull()
})

test('expired OAuth state is rejected', () => {
  const now = Date.now
  try {
    Date.now = () => 0
    const { state, cookieValue } = createCreatorTikTokState('user')
    Date.now = () => 11 * 60 * 1000
    expect(readCreatorTikTokState(cookieValue, state, 'user')).toBeNull()
  } finally { Date.now = now }
})
