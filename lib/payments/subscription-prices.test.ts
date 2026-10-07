import { describe, expect, test } from 'bun:test'
import { formatStripePrice, preferredCurrency, priceAmounts } from './subscription-prices'

describe('provider currency amounts', () => {
  test('formats EUR and CHF without treating minor units as whole currency', () => {
    expect(formatStripePrice(999, 'eur', 'de')).toBe('9,99 €')
    expect(formatStripePrice(999, 'chf', 'de-CH')).toContain('9.99')
    expect(formatStripePrice(999, 'mxn', 'es-MX')).toContain('9.99')
  })
  test('handles zero-decimal and Stripe special currencies', () => {
    expect(formatStripePrice(999, 'jpy', 'en')).toBe('¥999')
    expect(formatStripePrice(1000, 'clp', 'es-CL')).toContain('1.000')
    expect(formatStripePrice(100000, 'ugx', 'en')).toContain('1,000')
    expect(formatStripePrice(100000, 'isk', 'en')).toContain('1,000')
  })
  test('selects market currencies independent of language', () => {
    expect(preferredCurrency('DE')).toBe('eur')
    expect(preferredCurrency('AT')).toBe('eur')
    expect(preferredCurrency('CH')).toBe('chf')
    expect(preferredCurrency('MX')).toBe('mxn')
    expect(preferredCurrency('CA')).toBe('cad')
    expect(preferredCurrency('SN')).toBe('xof')
    expect(preferredCurrency(null)).toBeUndefined()
  })
  test('uses only configured fixed amounts, preserving zero and excluding null prices', () => {
    expect(priceAmounts({currency: 'usd', unit_amount: 999, currency_options: {eur: {unit_amount: 1099}, chf: {unit_amount: null}, jpy: {unit_amount: 0}}})).toEqual({usd:999,eur:1099,jpy:0})
  })
})
