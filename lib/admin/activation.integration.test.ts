import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

const url = process.env.GUEST_TEST_DATABASE_URL
const enabled = Boolean(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname))
const ids: string[] = []
let db: typeof import('@/lib/db').db, schema: typeof import('@/lib/db').schema
let eq: typeof import('drizzle-orm').eq, inArray: typeof import('drizzle-orm').inArray

describe.skipIf(!enabled)('customer outcomes (isolated PostgreSQL)', () => {
  beforeAll(async () => {
    const local = new URL(url!); local.searchParams.set('options', '-c timezone=UTC')
    process.env.DATABASE_URL = local.toString()
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
    const database = await import('@/lib/db'); db = database.db; schema = database.schema
    ;({ eq, inArray } = await import('drizzle-orm'))
  })
  afterAll(async () => {
    if (!ids.length) return
    await db.delete(schema.scanReservations).where(inArray(schema.scanReservations.userId, ids))
    await db.delete(schema.paymentEntitlements).where(inArray(schema.paymentEntitlements.userId, ids))
    await db.delete(schema.analyticsEvents).where(inArray(schema.analyticsEvents.accountId, ids))
    await db.delete(schema.subscriptionEvents).where(inArray(schema.subscriptionEvents.accountId, ids))
    await db.delete(schema.users).where(inArray(schema.users.id, ids))
  })
  async function user(internal = false) {
    const id = randomUUID(); ids.push(id)
    await db.insert(schema.users).values({ id, email: `${id}@test.invalid`, analyticsInternal: internal })
    return id
  }
  const day = (value: number) => new Date(Date.UTC(2035, 0, value))
  async function paid(id: string, at: Date, environment = 'production') {
    await db.insert(schema.subscriptionEvents).values({ accountId: id, provider: 'revenuecat', providerEventId: randomUUID(), providerType: 'INITIAL_PURCHASE', environment, eventName: 'subscription_started', amount: '9.99', currency: 'USD', occurredAt: at })
  }
  async function event(id: string, eventName: string, at: Date, properties: Record<string, unknown> = {}) {
    await db.insert(schema.analyticsEvents).values({ eventId: randomUUID(), accountId: id, eventName, platform: 'ios', environment: 'production', occurredAt: at, properties })
  }
  async function scans(id: string, reports: [string, number][]) {
    const [credit] = await db.insert(schema.paymentEntitlements).values({ userId: id, mobileInstallId: 'local-outcomes', stripeCheckoutSessionId: randomUUID(), product: 'evaluation', creditBalance: 0, source: 'test' }).returning()
    for (const [reportId, when] of reports) await db.insert(schema.scanReservations).values({ id: randomUUID(), userId: id, entitlementId: credit.id, requestHash: randomUUID(), status: 'complete', result: { analysis: { id: reportId, status: 'complete' } }, createdAt: day(when) })
  }

  test('paid cohorts exclude sandbox/internal history, dedupe renewals and report IDs, and separate incomplete follow-up', async () => {
    const active = await user(), reused = await user(), fresh = await user(), internal = await user(true), sandbox = await user(), older = await user()
    for (const id of [active, reused, internal]) await paid(id, day(10))
    await paid(sandbox, day(10), 'sandbox'); await paid(fresh, day(30))
    await paid(older, new Date('2034-01-01T00:00:00Z')); await paid(older, day(12))
    await paid(active, day(15)) // another provider event must not create another customer
    const report = randomUUID(), secondReport = randomUUID()
    await scans(active, [[report, 11], [report, 12], [secondReport, 14]])
    await scans(reused, [[randomUUID(), 11]].flatMap(([id, n]) => [[id, n], [id, 14]]) as [string, number][])
    await event(active, 'purchase_activated', day(10))
    // The first generated report was never received; a later successful retry
    // still establishes that this paying customer received and viewed a report.
    await event(active, 'evaluation_completed', day(14), { report_id: secondReport })
    await event(active, 'report_viewed', day(15), { report_id: secondReport })
    await event(active, 'protocol_task_completed', day(12))
    await event(reused, 'report_viewed', day(12), { report_id: 'unrelated-sample' })
    const { analyticsQuery } = await import('./analytics')
    const [result] = await db.execute(analyticsQuery({ days: '30', platform: 'all' }, day(31)))
    const data = result.data as any
    const delivery = data.paidDelivery.find((row: any) => row.window_days === 7)
    expect(delivery).toMatchObject({ payers: 3, eligible: 2, pending: 1, report_generated: 2, report_received: 1, report_viewed: 1 })
    const usage = data.membershipActivation.find((row: any) => row.window_days === 14)
    expect(usage).toMatchObject({ subscribers: 3, eligible: 2, pending: 1, first_protocol_action: 1, returned_for_second_scan: 1 })
  })

  test('queued guest events can follow only their proven claim; unrelated accounts cannot be reassigned', async () => {
    const target = await user(), guest = await user(), unrelated = await user()
    await db.insert(schema.mobileGuests).values({ userId: guest, claimedByUserId: target })
    const { createMobileSessionForUser } = await import('@/lib/auth/mobile-session')
    const session = await createMobileSessionForUser(target)
    const events = [target, guest, unrelated].map(accountId => ({ eventId: randomUUID(), accountId, eventName: 'report_viewed', mobileInstallId: 'outcomes-local-device', platform: 'ios', environment: 'test', occurredAt: new Date().toISOString(), properties: { report_id: randomUUID() } }))
    const { handler } = await import('@/pages/api/analytics/events')
    let status = 0
    const res: any = { setHeader() {}, status(value: number) { status = value; return this }, json() {} }
    await handler({ method: 'POST', headers: { authorization: `Bearer ${session.sessionToken}` }, socket: { remoteAddress: '127.0.0.1' }, body: { events } } as any, res)
    expect(status).toBe(202)
    const rows = await db.query.analyticsEvents.findMany({ where: inArray(schema.analyticsEvents.eventId, events.map(e => e.eventId)) })
    expect(rows.find(row => row.eventId === events[0].eventId)?.accountId).toBe(target)
    expect(rows.find(row => row.eventId === events[1].eventId)?.accountId).toBe(target)
    expect(rows.find(row => row.eventId === events[2].eventId)?.accountId).toBeNull()
    await db.delete(schema.analyticsEvents).where(inArray(schema.analyticsEvents.eventId, events.map(e => e.eventId)))
  })
  test('all-time earnings retain every currency and compare exact 24-hour windows without sandbox/internal revenue', async () => {
    const { analyticsQuery } = await import('./analytics')
    const [before] = await db.execute(analyticsQuery({ days: '1', platform: 'all' }, day(31)))
    const baseline = before.data as any
    const prior = (currency: string, key: string, period = false) => Number((period ? baseline.revenue : baseline.revenueTotals).find((r: any) => r.currency === currency)?.[key] ?? 0)
    const customer = await user(), internal = await user(true)
    const receipt = async (accountId: string, currency: string, amount: string | null, at: Date, environment = 'production') => {
      await db.insert(schema.subscriptionEvents).values({ accountId, provider: 'stripe', providerEventId: randomUUID(), providerType: 'invoice.paid', environment, eventName: amount?.startsWith('-') ? 'subscription_refunded' : 'invoice_paid', amount, currency, occurredAt: at })
    }
    await receipt(customer, 'USD', '10', new Date('2034-01-01T00:00:00Z'))
    await receipt(customer, 'USD', '10', day(29))
    await receipt(customer, 'USD', '5', day(30))
    await receipt(customer, 'USD', '-2', day(30))
    await receipt(customer, 'EUR', '3', day(30))
    await receipt(customer, 'GBP', null, day(30))
    await receipt(customer, 'USD', '100', day(30), 'sandbox')
    await receipt(internal, 'USD', '100', day(30))
    await receipt(customer, 'CAD', '100', day(31)) // snapshot excludes its upper boundary
    const [result] = await db.execute(analyticsQuery({ days: '1', platform: 'all' }, day(31)))
    const data = result.data as any
    const usd = data.revenueTotals.find((r: any) => r.currency === 'USD')
    const eur = data.revenueTotals.find((r: any) => r.currency === 'EUR')
    const gbp = data.revenueTotals.find((r: any) => r.currency === 'GBP')
    expect(Number(usd.net) - prior('USD', 'net')).toBe(23)
    expect(Number(usd.last_24h) - prior('USD', 'last_24h')).toBe(3)
    expect(Number(usd.previous_24h) - prior('USD', 'previous_24h')).toBe(10)
    expect(Number(eur.net) - prior('EUR', 'net')).toBe(3)
    expect(Number(eur.previous_24h) - prior('EUR', 'previous_24h')).toBe(0)
    expect(gbp.net).toBeNull()
    expect(Number(gbp.recent_missing_amount_events) - prior('GBP', 'recent_missing_amount_events')).toBe(1)
    expect(data.revenueTotals.some((r: any) => r.currency === 'CAD')).toBe(false)
    expect(Number(data.revenue.find((r: any) => r.currency === 'USD').net) - prior('USD', 'net', true)).toBe(3)
  })

  test('subscription and scan counters dedupe billing, reconstruct 24h status, and retain cancellation access until expiry', async () => {
    const { analyticsQuery } = await import('./analytics')
    const snapshot = async () => { const [row] = await db.execute(analyticsQuery({ days: '1', platform: 'all' }, day(31))); return (row.data as any).revenueActivity as any[] }
    const baseline = await snapshot()
    const customer = await user(), internal = await user(true), prefix = randomUUID()
    const bill = async (name: string, eventName: string, when: number, options: { expiry?: number; grace?: number; amount?: string | null; provider?: string; product?: string; transaction?: string; account?: string; environment?: string } = {}) => {
      await db.insert(schema.subscriptionEvents).values({ accountId: options.account ?? customer, provider: options.provider ?? 'revenuecat', providerEventId: randomUUID(), providerType: 'LOCAL_FIXTURE', environment: options.environment ?? 'production', eventName, subscriptionId: `${prefix}-${name}`, transactionId: options.transaction ?? randomUUID(), productId: options.product ?? 'mogging.pro.monthly', amount: options.amount === undefined ? '9.99' : options.amount, currency: 'USD', occurredAt: day(when), properties: { ...(options.expiry ? { expiration_at_ms: day(options.expiry).getTime() } : {}), ...(options.grace ? { grace_period_expiration_at_ms: day(options.grace).getTime() } : {}) } })
    }
    await bill('active','subscription_started',20,{expiry:40})
    await bill('active','subscription_renewed',30,{expiry:40})
    await bill('canceling','subscription_started',29,{expiry:40})
    await bill('canceling','cancellation_scheduled',30,{expiry:40,amount:'0'})
    await bill('natural-expiry','subscription_started',28,{expiry:30})
    await bill('ended','subscription_started',20,{expiry:40})
    await bill('ended','cancellation_scheduled',29,{expiry:40,amount:'0'})
    await bill('ended','subscription_expired',30,{expiry:30,amount:'0'})
    await bill('reactivated','subscription_started',20,{expiry:40})
    await bill('reactivated','cancellation_scheduled',29,{expiry:40,amount:'0'})
    await bill('reactivated','subscription_reactivated',30,{expiry:40,amount:'0'})
    await bill('unknown','subscription_started',30)
    await bill('grace','subscription_started',28,{expiry:30})
    await bill('grace','billing_issue_started',30,{expiry:30,grace:40,amount:'0'})
    await bill('refunded','subscription_started',28,{expiry:40})
    await bill('refunded','subscription_refunded',30,{expiry:40,amount:'-9.99'})
    await bill('trial','trial_started',30,{expiry:40,amount:'0'})
    await bill('stripe','subscription_started',30,{provider:'stripe',expiry:40,amount:null})
    await bill('stripe','invoice_paid',30,{provider:'stripe',amount:'5'})
    await bill('hidden-internal','subscription_started',30,{expiry:40,account:internal})
    await bill('hidden-sandbox','subscription_started',30,{expiry:40,environment:'sandbox'})
    await bill('pack','one_time_purchase',30,{product:'mogging.evaluation.pack3',transaction:`${prefix}-pack`})
    await bill('pack','one_time_purchase',30,{product:'mogging.evaluation.pack3',transaction:`${prefix}-pack`})
    await bill('single','one_time_purchase',29,{product:'evaluation'})
    await bill('image','one_time_purchase',30,{product:'extra_potential_image'})
    await bill('pack','subscription_refunded',30,{product:'mogging.evaluation.pack3',amount:'-9.99'})
    const rows = await snapshot()
    const delta = (metric: string, field: string) => Number(rows.find(r => r.metric === metric)[field]) - Number(baseline.find(r => r.metric === metric)[field])
    expect(delta('new_subscriptions','total')).toBe(9)
    expect(delta('new_subscriptions','last_24h')).toBe(2)
    expect(delta('new_subscriptions','previous_24h')).toBe(1)
    expect(delta('scans_bought','total')).toBe(4)
    expect(delta('scans_bought','last_24h')).toBe(3)
    expect(delta('scans_bought','previous_24h')).toBe(1)
    expect(delta('active_subscriptions','total')).toBe(6)
    expect(delta('active_subscriptions','previous_24h')).toBe(5)
    expect(delta('active_subscriptions','unknown_status')).toBe(1)
    expect(delta('active_subscriptions','previous_unknown_status')).toBe(0)
    expect(delta('canceled_subscriptions','total')).toBe(4)
    expect(delta('canceled_subscriptions','previous_24h')).toBe(4)
  })

})
