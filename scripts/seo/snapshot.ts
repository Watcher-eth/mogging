import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '../../lib/db'
import { analyticsFilters, analyticsQuery, type AnalyticsDashboard } from '../../lib/admin/analytics'
import { landingExperiments } from '../../lib/analytics/landing'

// Reuse the authenticated dashboard's reporting policy and verified billing facts.
// Every database operation runs in a read-only, bounded transaction.
const args = new Map(process.argv.slice(2).map(value => {
  const [name, ...rest] = value.split('=')
  return [name, rest.join('=')]
}))
const days = analyticsFilters.parse({ days: args.get('--days') || '7' }).days
const end = new Date(args.get('--end') || `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
if (!Number.isFinite(end.getTime()) || end.getTime() > Date.now()) throw new Error('Choose a valid, non-future end timestamp')
const output = args.get('--output')
if (!output) throw new Error('Supply --output=/absolute/local/snapshot.json')
const duration = Number(days) * 86_400_000
const fields = {
  Acquisition: ['summary', 'acquisitionSummary', 'landingSummary', 'landingSources', 'acquisition', 'daily'],
  Revenue: ['revenueFinancials', 'revenueSources', 'revenueActivity', 'billingReporting'],
  Experiments: ['landingExperiments', 'landingExperimentDaily', 'landingHandoffs'],
} as const

async function report(section: keyof typeof fields, at: Date, reportDays = days) {
  const window = { start: new Date(at.getTime() - Number(reportDays) * 86_400_000).toISOString(), endExclusive: at.toISOString() }
  try {
    const data = await db.transaction(async tx => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '12s'`)
      await tx.execute(sql`set local jit = off`)
      const [row] = await tx.execute(analyticsQuery({ days: reportDays, platform: 'all', section }, at))
      return row.data as AnalyticsDashboard
    })
    return { status: 'available', window, data: Object.fromEntries(fields[section].map(field => [field, data[field] ?? null])) }
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } }
    const code = cause.cause?.code ?? cause.code
    return { status: 'unavailable', window, data: null,
      code: code && /^[A-Z0-9]{5}$/.test(code) ? code : null,
      reason: 'Read-only report failed; check database access/schema and server logs privately. Missing is not zero.' }
  }
}

async function window(at: Date) {
  const reports: Record<string, unknown> = {}
  for (const section of ['Acquisition', 'Revenue'] as const) reports[section] = await report(section, at)
  return { start: new Date(at.getTime() - duration).toISOString(), endExclusive: at.toISOString(), reports }
}

const snapshot = {
  capturedAt: new Date().toISOString(), days: Number(days),
  windows: { current: await window(end), previous: await window(new Date(end.getTime() - duration)) },
  experimentCohort: await report('Experiments', end, '90'),
  primaryObjective: 'Completed positive-amount provider-verified purchases; new subscriptions, credits bought, renewals, refunds and delivered analyses remain separate measures.',
  definitions: {
    financials: 'Existing verified billing report, production/customer exclusions unchanged; amounts separated by currency. Positive transactions can include renewals and are not new-customer counts.',
    experiments: 'Existing homepage assignment cohorts and seven-day follow-up. The running homepage v3 test retains its original App Store-interest primary metric. Paid outcomes are diagnostics; future tests preregister paid outcomes.',
    attribution: 'Source/browser milestones do not establish verified source-to-payment attribution. No individual Search Console query-to-purchase join or web-to-install identity join is claimed.',
    windows: 'Explicit half-open UTC timestamp bounds; existing dashboard daily buckets use America/Los_Angeles. Do not add daily distinct counts to recreate period distinct counts.',
    freshness: 'Excludes the current UTC day by default. This is a capture baseline, not certification of complete events or final billing/refund maturity.',
  },
  experimentDefinitions: landingExperiments,
}
await mkdir(dirname(resolve(output)), { recursive: true })
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`)
const available = snapshot.experimentCohort.status === 'available' && Object.values(snapshot.windows).every(value => Object.values(value.reports).every(report => (report as { status: string }).status === 'available'))
console.log(JSON.stringify({ output: resolve(output), status: available ? 'available' : 'partial_or_unavailable', current: { start: snapshot.windows.current.start, endExclusive: snapshot.windows.current.endExclusive } }))
process.exit(available ? 0 : 1)
