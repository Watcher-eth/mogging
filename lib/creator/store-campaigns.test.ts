import { expect, test } from 'bun:test'
import { parseStoreCampaignCsv } from './store-campaigns'
const campaign = `c-${'a'.repeat(24)}`

test('aggregate campaign exports retain suppressed values as unknown', () => {
  const [row] = parseStoreCampaignCsv(`date,campaign,territory,downloads,sales,currency\n2026-10-21,${campaign},US,suppressed,,`)
  expect(row.downloads).toBeNull()
  expect(row.sales).toBeNull()
  expect(row.currency).toBeNull()
})
test('campaign exports accept TSV and preserve each currency and territory', () => {
  const rows = parseStoreCampaignCsv(`Date\tCampaign\tTerritory\tFirst-Time Downloads\tSales\tCurrency\n2026-10-21\t${campaign}\tUS\t5\t9.99\tUSD\n2026-10-21\t${campaign}\tFR\t6\t8.49\tEUR`)
  expect(rows.map(row => [row.territory,row.currency,row.sales])).toEqual([['US','USD','9.99'],['FR','EUR','8.49']])
})
test('quoted CSV fields are parsed without evaluating input', () => {
  expect(parseStoreCampaignCsv(`date,campaign,territory,downloads,sales,currency\n"2026-10-21","${campaign}","US","5","9.99","USD"`)[0].downloads).toBe(5)
  expect(() => parseStoreCampaignCsv(`date,campaign\n"2026-10-21,${campaign}`)).toThrow('unclosed')
})
test('malformed numeric values, unknown campaign formats and missing currency fail closed', () => {
  for (const row of [`2026-10-21,${campaign},US,=1+1,9.99,USD`, `2026-10-21,other,US,5,9.99,USD`, `2026-10-21,${campaign},US,5,9.99,`]) {
    expect(() => parseStoreCampaignCsv(`date,campaign,territory,downloads,sales,currency\n${row}`)).toThrow('Invalid campaign data')
  }
})
