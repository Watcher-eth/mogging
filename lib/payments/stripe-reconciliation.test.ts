import { expect, test } from 'bun:test'
import { runStripeRecovery, type StripeRecoveryState } from './stripe-recovery'

function harness(initial: Partial<StripeRecoveryState> = {}) {
  let elapsed = 0
  const state: StripeRecoveryState = { incremental: null, audit: null, coveredUntil: 1000000 - 300, auditedAt: 1000000 - 3600, ...initial }
  const saved: StripeRecoveryState[] = [], handled: string[] = [], queries: any[] = []
  const pages = [{ id: 'new' }, { id: 'already-processed' }, { id: 'older' }]
  const run = () => runStripeRecovery({ state, now: 1000000, clock: () => elapsed, budgetMs: 50,
    list: async pass => { queries.push({ ...pass }); return { data: pages.slice(pass.cursor ? pages.findIndex(e => e.id === pass.cursor) + 1 : 0), has_more: false } },
    processed: async () => new Set(['already-processed']),
    process: async event => { handled.push(event.id); elapsed += 30 },
    save: async value => { saved.push(structuredClone(value)) },
  })
  return { state, saved, handled, queries, run, reset: () => { elapsed = 0 } }
}

test('regular pass uses checkpoint overlap and skips already processed events', async () => {
  const h = harness()
  const result = await h.run()
  expect(h.queries[0]).toEqual({ since: 1000000 - 300 - 3600, until: 1000000, cursor: null })
  expect(h.handled).toEqual(['new', 'older'])
  expect(result.recovered).toBe(2)
  expect(h.state.coveredUntil).toBe(1000000)
})

test('budget exhaustion saves the last successful cursor and resumes a fixed snapshot', async () => {
  let clock = 0
  const state: StripeRecoveryState = { incremental: null, audit: null, coveredUntil: null, auditedAt: 1000000 }
  const handled: string[] = [], snapshots: any[] = []
  const options = {
    state, now: 1000000, clock: () => clock, budgetMs: 50,
    list: async (pass: any) => { snapshots.push({ ...pass }); return { data: (pass.cursor ? ['two'] : ['one','two']).map(id => ({ id })), has_more: false } },
    processed: async () => new Set<string>(), process: async (event: any) => { handled.push(event.id); clock += 60 },
    save: async () => {},
  }
  expect((await runStripeRecovery(options)).partial).toBe(true)
  expect(state.incremental?.cursor).toBe('one')
  expect(state.coveredUntil).toBeNull()
  clock = 0
  expect((await runStripeRecovery({ ...options, now: 1000300 })).partial).toBe(false)
  expect(handled).toEqual(['one', 'two'])
  expect(snapshots[1]).toMatchObject({ until: 1000000, cursor: 'one' })
  expect(state.coveredUntil).toBe(1000000)
})

test('failed work never advances beyond that event, but earlier successes remain durable', async () => {
  const state: StripeRecoveryState = { incremental: null, audit: null, coveredUntil: null, auditedAt: null }
  let persisted: StripeRecoveryState | null = null
  await expect(runStripeRecovery({ state, now: 1000000,
    list: async () => ({ data: [{id:'good'},{id:'failed'}], has_more:false }), processed: async () => new Set<string>(),
    process: async event => { if (event.id === 'failed') throw Error('provider failure') },
    save: async value => { persisted = structuredClone(value) },
  })).rejects.toThrow('provider failure')
  expect((persisted as StripeRecoveryState | null)?.incremental?.cursor).toBe('good')
  expect(state.coveredUntil).toBeNull()
})

test('daily audit completes separately and an empty continuation cannot silently skip events', async () => {
  const h = harness({ auditedAt: null })
  await h.run(); h.reset(); await h.run()
  expect(h.queries.some(q => q.since === 1000000 - 7 * 86400)).toBe(true)
  expect(h.state.auditedAt).toBe(1000000)
  await expect(runStripeRecovery({ state: {incremental:null,audit:null,coveredUntil:null,auditedAt:null}, now:1000000,
    list: async () => ({data:[],has_more:true}), processed: async () => new Set<string>(), process: async () => {}, save: async () => {},
  })).rejects.toThrow('empty continuation')
})
