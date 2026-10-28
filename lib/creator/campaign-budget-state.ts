import type { CreatorSprint } from './sprints'

export function campaignBudgetState(sprint: Pick<CreatorSprint, 'budgetCents' | 'usedCents' | 'pendingCents'>) {
  const pendingCents = Math.max(0, sprint.pendingCents ?? 0)
  const allocatedCents = sprint.usedCents + pendingCents
  const availableCents = Math.max(0, sprint.budgetCents - allocatedCents)
  return { pendingCents, allocatedCents, availableCents, locked: availableCents === 0,
    low: sprint.budgetCents > 0 && availableCents <= sprint.budgetCents * 0.2 }
}

export function requestedIncrementCents(expectedCents: number, approvedCents = 0) {
  return Math.max(0, expectedCents - approvedCents)
}

export function canReserveSubmission(availableCents: number, requestedCents: number, rereview = false) {
  return Number.isSafeInteger(requestedCents) && requestedCents >= 0 &&
    (availableCents > 0 || (rereview && requestedCents === 0)) && requestedCents <= Math.max(0, availableCents)
}
