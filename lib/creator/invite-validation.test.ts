import { expect, test } from 'bun:test'
import { creatorInviteSchema, isCreatorAvatarUrl } from './invite-validation'

const input = { displayName: 'Alex Creator', handle: '@Alex.Creator', profileUrl: 'https://www.tiktok.com/@Alex.Creator', evidenceUrl: 'https://discord.com/channels/123/456/789', verificationConfirmed: true }

test('normalizes matching TikTok profiles', () => {
  const invite = creatorInviteSchema.parse(input)
  expect(invite.handle).toBe('alex.creator')
  expect(invite.profileUrl).toBe('https://www.tiktok.com/@alex.creator')
})

test('accepts analytics evidence shared in a Discord direct message', () => {
  expect(creatorInviteSchema.safeParse({ ...input, evidenceUrl: 'https://discord.com/channels/@me/1555046510406934528/1555265856517316688' }).success).toBe(true)
})

test('verification requires reviewed evidence and an explicit confirmation', () => {
  for (const change of [{ verificationConfirmed: false }, { evidenceUrl: '' }, { evidenceUrl: 'https://discord.com.evil.test/channels/123/456/789' }, { evidenceUrl: 'https://discord.com/channels/123/456' }, { profileUrl: 'https://www.tiktok.com/@someone.else' }, { profileUrl: 'https://example.com/@Alex.Creator' }]) {
    expect(creatorInviteSchema.safeParse({ ...input, ...change }).success).toBe(false)
  }
})

test('avatars cannot fetch arbitrary URLs or impersonate allowed hosts', () => {
  expect(isCreatorAvatarUrl('https://p16.tiktokcdn.com/avatar.jpeg')).toBe(true)
  for (const url of ['http://p16.tiktokcdn.com/a', 'https://tiktokcdn.com.evil.test/a', 'https://127.0.0.1/a', 'https://user:pass@p16.tiktokcdn.com/a', 'https://p16.tiktokcdn.com:444/a']) expect(isCreatorAvatarUrl(url)).toBe(false)
})
