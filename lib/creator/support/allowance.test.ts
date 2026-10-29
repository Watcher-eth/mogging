import { describe, test, expect } from 'bun:test'
import { createSupportAllowanceStore, unlimitedSupportKey } from './allowance-ledger'
import { supportDay } from './allowance'
import { relevantRequirementIds } from './requirement-focus'

describe('four creator messages per UTC day', () => {
  test('admits exactly four simultaneous requests, isolated by authenticated creator', async () => {
    const store = createSupportAllowanceStore(null)
    const now = Date.parse('2026-10-26T23:59:59Z')
    const reservations = await Promise.all(Array.from({ length: 10 }, () => store.reserveSupportMessage('creator-a', now)))
    expect(reservations.filter(r => r.accepted)).toHaveLength(4)
    expect((await store.readSupportAllowance('creator-a', now)).remaining).toBe(0)
    expect((await store.readSupportAllowance('creator-b', now)).remaining).toBe(4)
    expect((await store.readSupportAllowance('creator-a', now + 1000)).remaining).toBe(4)
    expect(supportDay(now).resetsAt).toBe(now + 1000)
  })
  test('failed requests refund once, and cannot refund into the next day', async () => {
    const store = createSupportAllowanceStore(null)
    const now = Date.parse('2026-10-26T23:59:59Z')
    const a = await store.reserveSupportMessage('creator-a', now)
    await store.reserveSupportMessage('creator-a', now)
    await a.refund(); await a.refund()
    expect((await store.readSupportAllowance('creator-a', now)).remaining).toBe(3)
    const b = await store.reserveSupportMessage('creator-a', now)
    await store.reserveSupportMessage('creator-a', now + 1000)
    await b.refund()
    expect((await store.readSupportAllowance('creator-a', now + 1000)).remaining).toBe(3)
  })
  test('production never falls back to an instance-local quota', async () => {
    const store = createSupportAllowanceStore(null, true)
    await expect(store.reserveSupportMessage('creator')).rejects.toThrow('temporarily unavailable')
    await expect(store.readSupportAllowance('creator')).rejects.toThrow('temporarily unavailable')
  })
})

test('a server-managed unlimited entitlement bypasses only its authenticated creator’s daily cap and is revocable', async () => {
  const now = Date.parse('2026-10-29T22:00:00Z')
  const values = new Map<string, unknown>()
  let writes = 0
  const redis = {
    get: async (key: string) => values.get(key) ?? null,
    eval: async (_script: string, keys: string[], args: number[]) => {
      writes++
      const count = Number(values.get(keys[0]) ?? 0)
      if (count >= args[0]) return -1
      values.set(keys[0], count + 1)
      return count + 1
    },
  } as unknown as NonNullable<Parameters<typeof createSupportAllowanceStore>[0]>
  const store = createSupportAllowanceStore(redis, true)
  const exhausted = `creator-support:daily:v1:2026-10-29:creator-owner`
  values.set(exhausted, 4)
  values.set(unlimitedSupportKey('creator-owner'), true)
  const turns = await Promise.all(Array.from({ length: 12 }, () => store.reserveSupportMessage('creator-owner', now)))
  expect(turns.every(turn => turn.accepted && turn.allowance.unlimited)).toBe(true)
  for (const turn of turns) await turn.refund()
  expect(writes).toBe(0)
  expect(values.get(exhausted)).toBe(4)
  expect(await store.readSupportAllowance('creator-owner', now)).toMatchObject({ unlimited: true, limit: null, remaining: null })
  const ordinary = await Promise.all(Array.from({ length: 5 }, () => store.reserveSupportMessage('another-creator', now)))
  expect(ordinary.filter(turn => turn.accepted)).toHaveLength(4)
  expect((await store.readSupportAllowance('mvpmogs', now)).unlimited).toBeUndefined()
  values.delete(unlimitedSupportKey('creator-owner'))
  expect((await store.readSupportAllowance('creator-owner', now)).remaining).toBe(0)
  expect((await store.reserveSupportMessage('creator-owner', now)).accepted).toBe(false)
})

test('requirements focus selects relevant concepts without emphasizing a general request', () => {
  const rows = [
    { id: 'cta', title: 'Early CTA', detail: 'Within the first 10 seconds' },
    { id: 'recording', title: 'Analytics recording', detail: 'Use a second device' },
    { id: 'public', title: 'Public and original' },
    { id: 'hook', title: 'Opening hook', detail: 'Introduce the story in the first few seconds' },
  ]
  expect(relevantRequirementIds('When should the CTA appear?', rows)).toEqual(['cta'])
  expect(relevantRequirementIds('How do I record analytics with another device?', rows)).toEqual(['recording'])
  expect(relevantRequirementIds('Show content requirements', rows)).toEqual([])
})
