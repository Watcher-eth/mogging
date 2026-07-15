import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCreatorEconomics } from './creator-economics'

test('creator economics caps compensation at 35% of attributable 90-day contribution margin', () => {
  const result = calculateCreatorEconomics(
    { qualifiedViews: 1000, linkClicks: 100, installs: 20, firstTimePaidCustomers: 1 },
    [],
    { ninetyDayContributionMarginCents: 2000, compensationCapRate: 0.35, conversionBonusCapRate: 0.25 }
  )

  assert.equal(result.compensationCapCents, 700)
  assert.equal(result.sustainableRpmCents, 700)
  assert.equal(result.maxConversionBonusCents, 500)
})

test('creator economics excludes failed and cancelled payments from committed compensation', () => {
  const result = calculateCreatorEconomics(
    { qualifiedViews: 1000, linkClicks: 100, installs: 20, firstTimePaidCustomers: 2 },
    [
      { amountCents: 400, status: 'pending' },
      { amountCents: 300, status: 'paid' },
      { amountCents: 900, status: 'failed' },
    ],
    { ninetyDayContributionMarginCents: 2000, compensationCapRate: 0.35, conversionBonusCapRate: 0.25 }
  )

  assert.equal(result.committedCompensationCents, 700)
  assert.equal(result.paidCompensationCents, 300)
  assert.equal(result.isWithinCompensationCap, true)
})
