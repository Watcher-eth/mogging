import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AdminSubmission } from './creator-types'
import { CreatorFixedRateNotice } from './creator-fixed-rate-notice'

const now = Date.now()
const agreement = { id: 'agreement', amountCents: 1000, minimumTier1Percent: 22.5, startsAt: new Date(now-86400000).toISOString(), endsAt: new Date(now+86400000).toISOString() }

test('saved fixed-rate submissions stay clearly marked after the agreement expires', () => {
  const expired = {...agreement,startsAt:'2020-01-01T00:00:00Z',endsAt:'2020-01-11T00:00:00Z'}
  const submission = {sprintTerms:{retainer:expired}} as AdminSubmission
  const html = renderToStaticMarkup(<CreatorFixedRateNotice submission={submission} />)
  expect(html).toContain('Fixed rate · $10 per video')
  expect(html).toContain('22.5%+ Tier 1 audience required')
  expect(html).toContain('No minimum views')
  expect(html).toContain('fixed rate remains saved for this submission')
})
test('an active creator agreement does not relabel an older submission as a fixed-rate payout', () => {
  const html = renderToStaticMarkup(<CreatorFixedRateNotice agreement={agreement} submission={{sprintTerms:null} as AdminSubmission} />)
  expect(html).toContain('Fixed-rate creator')
  expect(html).toContain('This submission uses its saved campaign rates.')
  expect(html).toContain('Current retainer: $10 per approved video')
  expect(html).not.toContain('Fixed rate · $10 per video')
  expect(renderToStaticMarkup(<CreatorFixedRateNotice />)).toBe('')
})
