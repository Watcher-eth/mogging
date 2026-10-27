import { describe, test, expect } from 'bun:test'
import { createSupportAllowanceStore } from './allowance-ledger'
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
