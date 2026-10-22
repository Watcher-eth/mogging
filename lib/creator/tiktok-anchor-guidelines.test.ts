import { expect, mock, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CreatorSocialAccount } from '@/components/creator/types'
let socialAccounts: Partial<CreatorSocialAccount>[] = []
mock.module('swr', () => ({ default: () => ({ data: { socialAccounts } }) }))
const { TikTokAnchorGuidelines } = await import(
  '@/components/creator/content-guidelines'
)
const render = () => renderToStaticMarkup(createElement(TikTokAnchorGuidelines))
test('anchor guidelines stay hidden for Instagram, unknown counts, and TikTok below 1K', () => {
  for (const account of [
    { platform: 'instagram', followers: { source: 'public', count: 50000 } },
    { platform: 'tiktok', followers: null },
    { platform: 'tiktok', followers: { source: 'public', count: 999 } },
    {
      platform: 'tiktok',
      followers: { source: 'self_reported', range: 'under_1k' },
    },
  ]) {
    socialAccounts = [account as CreatorSocialAccount]
    expect(render()).toBe('')
  }
})
test('paused anchor requirements are hidden even for eligible TikTok accounts', () => {
  socialAccounts = [
    {
      platform: 'tiktok',
      handle: 'eligible',
      followers: {
        source: 'public',
        count: 1000,
        checkedAt: '2026-10-20T00:00:00Z',
      },
    },
    {
      platform: 'tiktok',
      handle: 'small',
      followers: {
        source: 'self_reported',
        range: 'under_1k',
        checkedAt: '2026-10-20T00:00:00Z',
      },
    },
    {
      platform: 'instagram',
      handle: 'instagram',
      followers: {
        source: 'public',
        count: 50000,
        checkedAt: '2026-10-20T00:00:00Z',
      },
    },
  ]
  expect(render()).toBe('')
})
