import { describe, expect, test } from 'bun:test'
import { creatorGuideTopic } from './guide-navigation'

describe('existing creator guide links', () => {
  test('routes old anchors to the remaining guide topics', () => {
    expect(creatorGuideTopic(undefined, '/creator/guide#video-requirements')).toBe('rules')
    expect(creatorGuideTopic(undefined, '/creator/guide#audience-tiers')).toBe('start')
    expect(creatorGuideTopic(undefined, '/creator/guide#referral-links')).toBe('referrals')
  })

  test('keeps remaining topics and safely handles retired or unknown topics', () => {
    for (const topic of ['video', 'improve', 'rules', 'referrals'] as const) {
      expect(creatorGuideTopic(topic, `/creator/guide?topic=${topic}`)).toBe(topic)
    }
    expect(creatorGuideTopic('examples', '/creator/guide?topic=examples')).toBe('video')
    expect(creatorGuideTopic('payout', '/creator/guide?topic=payout')).toBe('start')
    expect(creatorGuideTopic('account', '/creator/guide?topic=account')).toBe('start')
    expect(creatorGuideTopic('missing', '/creator/guide?topic=missing')).toBe('start')
  })
})
