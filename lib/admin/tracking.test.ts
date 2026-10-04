import { expect, test } from 'bun:test'
import { analyticsEventNames } from '../analytics/contract'
import { trackingDefinitions, trackingRows } from './tracking'

test('every supported event has exactly one reporting owner', () => {
  const assigned = trackingDefinitions.map(row => row.event)
  expect([...assigned].sort()).toEqual([...analyticsEventNames].sort())
  expect(new Set(assigned).size).toBe(assigned.length)
})
test('empty tracking reports preserve the full catalog without inventing durations', () => {
  const rows = trackingRows([])
  expect(rows).toHaveLength(analyticsEventNames.length)
  expect(rows.every(row => row.events === 0 && row.status === 'Awaiting data' && row.median_ms === null)).toBe(true)
})
test('section reports preserve observations and only display their assigned milestones', () => {
  const rows = trackingRows([{event:'purchase_failed',events:3,actors:2,median_ms:1000}], 'Purchases')
  expect(rows.find(row => row.event === 'purchase_failed')).toMatchObject({events:3,actors:2,median_ms:1000,status:'Observed'})
  expect(rows.some(row => row.event === 'account_authenticated')).toBe(false)
  expect(rows.find(row => row.event === 'purchase_restored')?.status).toBe('Awaiting data')
})
