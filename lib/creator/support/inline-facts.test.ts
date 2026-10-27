import { expect, test } from 'bun:test'
import { inlineFactParts } from './inline-facts'

test('keeps exact answer text while identifying mixed analytics in one sentence', () => {
  const text = 'You had 9.3K downloads, US$491.53 in revenue, 169 subscriptions, and 19% of downloads in the last 365 days.'
  const parts = inlineFactParts(text)
  expect(parts.map(p => p.text).join('')).toBe(text)
  expect(parts.filter(p => p.kind).map(p => [p.text, p.kind])).toEqual([['9.3K', 'downloads'], ['US$491.53', 'revenue'], ['169', 'conversions'], ['19%', 'percentage']])
})

test('distinguishes adjacent submission counts and verified review data', () => {
  const text = '0 pending and 1 in review; 2 approved and 3 paid; 1 rejected. Verified 125,000 views at 22.5% Tier 1 audience earned $45.50. A $10 bonus is separate.'
  expect(inlineFactParts(text).filter(p => p.kind).map(p => [p.text, p.kind])).toEqual([['0', 'review'], ['1', 'review'], ['2', 'approved'], ['3', 'paid'], ['1', 'rejected'], ['125,000', 'views'], ['22.5%', 'audience'], ['$45.50', 'money'], ['$10', 'bonus']])
})

test('leaves dates, durations, list numbering, internal IDs, and creative timing alone', () => {
  const text = 'Approved on 2026-10-25. Look at the last 7 days. Tier 1 audience matters. Post sample-post-4. 1. Explain a feature. Use a 2–3 second CTA in the first 10 seconds.'
  expect(inlineFactParts(text)).toEqual([{ text }])
})

test('handles metric-first grammar, checklist counts, and untrusted text without rewriting it', () => {
  const text = 'Downloads: 510. Revenue: $1,138.86. 18 of 20 saved checks met. <script>alert(1)</script>'
  const parts = inlineFactParts(text)
  expect(parts.map(p => p.text).join('')).toBe(text)
  expect(parts.filter(p => p.kind).map(p => [p.text, p.kind])).toEqual([['510', 'downloads'], ['$1,138.86', 'revenue'], ['18', 'checks'], ['20', 'checks']])
})

test('highlighted phrases pair values with metrics and cap each paragraph at two distinct metrics', async () => {
 const {highlightedFactParts}=await import('./inline-facts')
 const text='You recorded 276 link presses, 77 downloads, 17 conversions, and $169.83 in attributed revenue.'
 const parts=highlightedFactParts(text)
 expect(parts.map(p=>p.text).join('')).toBe(text)
 expect(parts.filter(p=>p.kind).map(p=>p.text)).toEqual(['17 conversions','$169.83 in attributed revenue'])
})
test('highlighting does not decorate unexplained amounts or repeat the same metric', async () => {
 const {highlightedFactParts}=await import('./inline-facts')
 const text='The video led with 5 conversions, of which 4 were direct and $40.75, and 1 conversion was estimated at $10.19.'
 const parts=highlightedFactParts(text)
 expect(parts.filter(p=>p.kind).map(p=>p.text)).toEqual(['5 conversions'])
 expect(parts.map(p=>p.text).join('')).toBe(text)
})
test('metric-first amounts and verified audience stay readable without duplicate or overlapping spans', async () => {
 const {highlightedFactParts}=await import('./inline-facts')
 const text='Attributed revenue: $45.50. Verified 125,000 views at 22.5% Tier 1 audience.'
 const parts=highlightedFactParts(text)
 expect(parts.filter(p=>p.kind)).toHaveLength(2)
 expect(parts.filter(p=>p.kind).map(p=>p.text)).toEqual(['Attributed revenue: $45.50','125,000 views'])
 expect(parts.map(p=>p.text).join('')).toBe(text)
})
