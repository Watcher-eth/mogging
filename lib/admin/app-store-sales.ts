import { sign } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { ADMIN_REPORTING_TIME_ZONE } from './reporting-time'

export async function getAppStoreSales() {
  const { ASC_REPORT_KEY_ID: keyId, ASC_REPORT_ISSUER_ID: issuer, ASC_REPORT_PRIVATE_KEY: key,
    ASC_REPORT_VENDOR_NUMBER: vendor, ASC_REPORT_APP_SKU: sku } = process.env
  if (!keyId || !issuer || !key || !vendor || !sku) return { status: 'unconfigured' as const }

  const date = new Date(Date.now() - 48 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { timeZone: ADMIN_REPORTING_TIME_ZONE })
  try {
    const now = Math.floor(Date.now() / 1000)
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const payload = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })}`
    const signature = sign('sha256', Buffer.from(payload), { key: key.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }).toString('base64url')
    const query = new URLSearchParams({
      'filter[vendorNumber]': vendor,
      'filter[reportType]': 'SALES',
      'filter[reportSubType]': 'SUMMARY',
      'filter[frequency]': 'DAILY',
      'filter[reportDate]': date,
    })
    const response = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${query}`, {
      headers: { Authorization: `Bearer ${payload}.${signature}`, Accept: 'application/a-gzip' },
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return { status: 'unavailable' as const, date, httpStatus: response.status }
    const buffer = Buffer.from(await response.arrayBuffer())
    const [header, ...records] = gunzipSync(buffer, { maxOutputLength: 16 * 1024 * 1024 }).toString('utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
    const columns = header.split('\t')
    const parent = columns.indexOf('Parent Identifier')
    const units = columns.indexOf('Units')
    const rate = columns.indexOf('Developer Proceeds')
    const currency = columns.indexOf('Currency of Proceeds')
    if ([parent, units, rate, currency].includes(-1)) return { status: 'unavailable' as const, date }
    const totals = new Map<string, { currency: string; positiveUnits: number; estimatedProceeds: number }>()
    let adjustments = 0
    for (const record of records) {
      const values = record.split('\t')
      if (values[parent] !== sku) continue
      const quantity = Number(values[units]), proceeds = Number(values[rate]), code = values[currency]
      // Show purchase-side proceeds only. Partial refunds can have zero units.
      if (!values[units] || !values[rate] || !Number.isFinite(quantity) || !Number.isFinite(proceeds) || !/^[A-Z]{3}$/.test(code) || quantity <= 0 || proceeds < 0) {
        adjustments++
        continue
      }
      const total = totals.get(code) ?? { currency: code, positiveUnits: 0, estimatedProceeds: 0 }
      total.positiveUnits += quantity
      total.estimatedProceeds += quantity * proceeds
      totals.set(code, total)
    }
    return { status: 'ready' as const, date, adjustments, rows: [...totals.values()] }
  } catch {
    return { status: 'unavailable' as const, date }
  }
}
