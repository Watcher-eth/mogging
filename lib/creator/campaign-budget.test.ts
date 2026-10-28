import { expect, test } from 'bun:test'
import { campaignBudgetState, canReserveSubmission, requestedIncrementCents } from './campaign-budget-state'

test('$50 left accepts $40, then blocks $20 instead of overbooking', () => {
  let pendingCents = 0
  const remaining = () => campaignBudgetState({ budgetCents: 5000, usedCents: 0, pendingCents }).availableCents
  expect(canReserveSubmission(remaining(), 4000)).toBe(true)
  pendingCents += 4000
  expect(remaining()).toBe(1000)
  expect(canReserveSubmission(remaining(), 2000)).toBe(false)
  expect(canReserveSubmission(remaining(), 1000)).toBe(true)
  pendingCents += 1000
  expect(campaignBudgetState({budgetCents:5000,usedCents:0,pendingCents}).locked).toBe(true)
})
test('warning starts at exactly 20% of content funds, independent of bonus funds', () => {
  expect(campaignBudgetState({budgetCents:10000,usedCents:7999}).low).toBe(false)
  expect(campaignBudgetState({budgetCents:10000,usedCents:7000,pendingCents:1000}).low).toBe(true)
  expect(campaignBudgetState({budgetCents:10000,usedCents:7000,pendingCents:3000})).toMatchObject({low:true,locked:true,availableCents:0})
})
test('rereviews reserve only additional earnings and may update without additional funds', () => {
  expect(requestedIncrementCents(6500,3000)).toBe(3500)
  expect(requestedIncrementCents(3000,6500)).toBe(0)
  expect(canReserveSubmission(0,0,true)).toBe(true)
  expect(canReserveSubmission(0,0)).toBe(false)
  expect(canReserveSubmission(0,100,true)).toBe(false)
})
