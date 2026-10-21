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
test('guidelines identify only eligible TikTok accounts and require joining plus every subsequent anchor', () => {
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
  const html = render()
  expect(html).toContain('@eligible')
  expect(html).not.toContain('@small')
  expect(html).not.toContain('@instagram')
  expect(html).toContain('before your next submission')
  expect(html).toContain('mandatory for every new submission')
  expect(html).toContain('Branded content')
})
