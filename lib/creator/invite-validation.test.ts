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

test('accepts reviewed Discord recording attachments', () => {
  expect(creatorInviteSchema.safeParse({ ...input, displayName: '𝔢𝔪𝔥', evidenceUrl: 'https://cdn.discordapp.com/attachments/1554306376925192333/1554927433319321600/ScreenRecording.mov?ex=6abffc05&is=6abeaa85&hm=signature' }).success).toBe(true)
  for (const evidenceUrl of ['https://cdn.discordapp.com.evil.test/attachments/123/456/video.mov', 'https://cdn.discordapp.com/attachments/123/456/file.html', 'https://cdn.discordapp.com/attachments/123/video.mov']) {
    expect(creatorInviteSchema.safeParse({ ...input, evidenceUrl }).success).toBe(false)
  }
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
