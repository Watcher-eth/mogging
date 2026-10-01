import { describe, expect, test } from 'bun:test'
import { creatorGuideTopic } from './guide-navigation'

describe('existing creator guide links', () => {
  test('routes old anchors to the article that contains the information', () => {
    expect(creatorGuideTopic(undefined, '/creator/guide#video-requirements')).toBe('rules')
    expect(creatorGuideTopic(undefined, '/creator/guide#audience-tiers')).toBe('payout')
    expect(creatorGuideTopic(undefined, '/creator/guide#referral-links')).toBe('referrals')
  })

  test('keeps existing topic URLs and safely handles unknown topics', () => {
    for (const topic of ['video', 'examples', 'payout', 'account'] as const) {
      expect(creatorGuideTopic(topic, `/creator/guide?topic=${topic}`)).toBe(topic)
    }
    expect(creatorGuideTopic('missing', '/creator/guide?topic=missing')).toBe('start')
  })
})
