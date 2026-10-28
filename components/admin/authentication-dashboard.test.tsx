import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { AuthenticationDashboard } from './authentication-dashboard'

function snapshot(): AnalyticsDashboard {
  return { generatedAt: '2026-10-27T22:00:00Z', filters: { days: '30', platform: 'ios', section: 'Authentication' }, daily: [], authentication: {
    summary: [{ starts: 20, successes: 30, authenticated_devices: 12, failures: 4, setup_failures: 2, cancellations: 3, starts_with_attempt: 10, latest_event: '2026-10-27T21:30:00', latest_receipt: '2026-10-27T21:31:00' }],
    providers: [{ provider: 'apple', starts: 20, successes: 30, failures: 4, cancellations: 3, setup_failures: 2 }],
    failures: [], support: [{ event_name: 'reports_sync_failed', events: 2, devices: 1 }], links: [{ accounts: 9, links: 15 }],
  } } as unknown as AnalyticsDashboard
}

test('independent authentication outcomes never become a conversion rate or new-customer count', () => {
  const html = renderToStaticMarkup(<AuthenticationDashboard data={snapshot()} days={30} />)
  for (const value of ['20','30','4','2']) expect(html).toContain(`>${value}</p>`)
  expect(html).toContain('12 distinct devices or browsers')
  expect(html).toContain('3 sign-in cancellations recorded')
  expect(html).toContain('50.0% of sign-in start events include an attempt identifier')
  expect(html).not.toContain('150.0%')
  expect(html).toContain('not a conversion funnel')
  expect(html).toContain('separate from sign-in errors')
})

test('identity links and support activity remain separate with source, scope and freshness limits', () => {
  const html = renderToStaticMarkup(<AuthenticationDashboard data={snapshot()} days={30} />)
  expect(html).toContain('>9</p>')
  expect(html).toContain('>15</p>')
  expect(html).toContain('selected platform and period')
  expect(html).toContain('sandbox provenance cannot be independently verified')
  expect(html).toContain('Report synchronization errors')
  expect(html).toContain('2:31 PM PDT')
  expect(html).toContain('60-second cache')
})

test('missing snapshots and no observed starts do not fabricate a zero success rate', () => {
  const data = snapshot()
  data.authentication!.summary[0].starts = 0
  expect(renderToStaticMarkup(<AuthenticationDashboard data={data} days={1} />)).toContain('No sign-in starts were recorded')
  data.authentication = null
  const html = renderToStaticMarkup(<AuthenticationDashboard data={data} days={30} />)
  expect(html).toContain('Unavailable data is not shown as zero')
  expect(html).not.toContain('>0</p>')
})
