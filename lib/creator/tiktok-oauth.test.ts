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

test('setup destination is signed into OAuth state without accepting an arbitrary return URL', () => {
  const { state, cookieValue } = createCreatorTikTokState('user', 'setup')
  expect(readCreatorTikTokState(cookieValue, state, 'user')?.destination).toBe('setup')
  const [encoded, signature] = cookieValue.split('.')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  payload.destination = 'accounts'
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`
  expect(readCreatorTikTokState(tampered, state, 'user')).toBeNull()
  const accountState = createCreatorTikTokState('user')
  expect(readCreatorTikTokState(accountState.cookieValue, accountState.state, 'user')?.destination).toBe('accounts')
})
