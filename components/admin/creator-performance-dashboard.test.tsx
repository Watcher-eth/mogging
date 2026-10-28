import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { buildCreatorPerformance, type PerformanceInput } from '@/lib/admin/creator-performance'
import CreatorPerformanceDashboard from './creator-performance-dashboard'

function snapshot(): AnalyticsDashboard {
  const source: PerformanceInput = {
    creators: [],
    submissions: [
      { id: 'new', creatorProfileId: 'new-creator', creatorName: 'New Creator', platform: 'tiktok', createdAt: '2026-10-20T18:00:00Z', sprintId: 'sprint', status: 'approved', approvedAmountCents: 1000, viewCountThreshold: 20000, adminViewCountThreshold: 20000, adminUsAudiencePercent: 30 },
      { id: 'old', creatorProfileId: 'old-creator', creatorName: 'Old Creator', platform: 'instagram', createdAt: '2026-09-01T18:00:00Z', sprintId: 'sprint', status: 'approved', approvedAmountCents: 5000, viewCountThreshold: 50000, adminViewCountThreshold: 50000, adminUsAudiencePercent: 30 },
    ],
    payments: [{ id: 'cash', creatorProfileId: 'old-creator', submissionId: 'old', amountCents: 3000, currency: 'USD', status: 'paid', paidAt: '2026-10-21T18:00:00Z' }],
  }
  const now = new Date('2026-10-21T20:00:00Z')
  return { generatedAt: now.toISOString(), filters: { days: '7', platform: 'all', section: 'CreatorPerformance' }, creatorPerformance: {
    reports: { all: buildCreatorPerformance(source, { days: 7, platform: 'all', now }), tiktok: buildCreatorPerformance(source, { days: 7, platform: 'tiktok', now }), instagram: buildCreatorPerformance(source, { days: 7, platform: 'instagram', now }) },
    latestSubmission: '2026-10-20T18:00:00', latestSubmissionUpdate: '2026-10-21T18:00:00', latestPaymentUpdate: '2026-10-21T18:30:00',
  } } as AnalyticsDashboard
}

test('performance separates submission-period costs, payment-date cash and current lifetime balances', () => {
  const html = renderToStaticMarkup(<CreatorPerformanceDashboard data={snapshot()} />)
  expect(html).toContain('>20,000</p>')
  expect(html).toContain('>$10.00</p>')
  expect(html).toContain('>$30.00</p>')
  expect(html).toContain('>$60.00</p>')
  expect(html).toContain('>$0.50</p>')
  expect(html).toContain('Outstanding earned payouts')
  expect(html).toContain('not views gained on each calendar day')
  expect(html).not.toContain('Views, spend, and revenue')
  expect(html).not.toContain('App revenue (all channels)')
  expect(html).not.toContain('All-time creator performance')
})

test('source times, exclusions and the preview attribution destination stay explicit', () => {
  const html = renderToStaticMarkup(<CreatorPerformanceDashboard data={snapshot()} attributionHref="/admin/__product-overview-preview?page=creator-attribution" />)
  expect(html).toContain('11:30 AM PDT')
  expect(html).toContain('matheo.psl, bejapsl and Valerie')
  expect(html).toContain('Drafts are excluded')
  expect(html).toContain('/admin/__product-overview-preview?page=creator-attribution')
  expect(html).toContain('before social-platform and experiment exclusions')
})

test('missing snapshots are unavailable rather than fabricated zero costs', () => {
  const data = snapshot()
  data.creatorPerformance = undefined
  const html = renderToStaticMarkup(<CreatorPerformanceDashboard data={data} />)
  expect(html).toContain('could not be established')
  expect(html).not.toContain('$0.00')
})
