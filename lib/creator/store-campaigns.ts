import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'

const rowSchema = z.object({
  campaign: z.string().regex(/^c-[a-f0-9]{24}$/),
  day: z.iso.date(), territory: z.string().regex(/^[A-Z]{2,3}$/),
  downloads: z.number().int().nonnegative().max(2_000_000_000).nullable(),
  sales: z.string().regex(/^-?\d{1,12}(\.\d{1,6})?$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
}).refine(row => row.sales == null || row.currency != null, 'Sales require a currency')

// Aggregate exports stay separate from individual purchase credit. Blank/suppressed means unknown.
export function parseStoreCampaignCsv(csv: string) {
  const rows: string[][] = [], delimiter = csv.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ','
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < csv.length; i++) {
    const character = csv[i]
    if (character === '"') {
      if (quoted && csv[i+1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (character === delimiter || character === '\n')) {
      row.push(cell.replace(/\r$/, '').trim()); cell = ''
      if (character === '\n') { if (row.some(Boolean)) rows.push(row); row = [] }
    } else cell += character
  }
  if (quoted) throw new ApiError(400, 'CSV has an unclosed quoted field')
  row.push(cell.replace(/\r$/, '').trim()); if (row.some(Boolean)) rows.push(row)
  const header = rows.shift()?.map(value => value.replace(/^\uFEFF/, '').toLowerCase().replace(/[ _-]/g, '')) || []
  const index = (names: string[]) => header.findIndex(name => names.includes(name))
  const fields = { day: index(['date', 'day']), campaign: index(['campaign', 'campaigntoken']), territory: index(['territory']), downloads: index(['downloads','firsttimedownloads']), sales: index(['sales']), currency: index(['currency']) }
  if (fields.day < 0 || fields.campaign < 0 || rows.length > 10000) throw new ApiError(400, 'Use date,campaign,territory,downloads,sales,currency headers with at most 10,000 rows')
  const known = (value: string | undefined) => value && !['-', '—', 'null', 'suppressed', 'n/a'].includes(value.toLowerCase()) ? value : null
  return rows.map((row, index) => {
    const value = (name: keyof typeof fields) => fields[name] < 0 ? null : known(row[fields[name]])
    const downloads = value('downloads')
    const parsed = rowSchema.safeParse({ day: value('day'), campaign: value('campaign'), territory: value('territory')?.toUpperCase() || 'ALL',
      downloads: downloads == null ? null : /^\d+$/.test(downloads) ? Number(downloads) : NaN, sales: value('sales'), currency: value('currency')?.toUpperCase() || null })
    if (!parsed.success) throw new ApiError(400, `Invalid campaign data on row ${index+2}. Use ISO dates, our c- campaign token, and plain numeric amounts.`)
    return parsed.data
  })
}

export async function importStoreCampaignCsv(csv: string) {
  const rows = parseStoreCampaignCsv(csv)
  const links = await db.query.creatorTrackingLinks.findMany({ columns: { id: true } })
  const byCampaign = new Map(links.map(link => [`c-${link.id.replaceAll('-', '').slice(0,24)}`, link.id]))
  for (const row of rows) if (!byCampaign.has(row.campaign)) throw new ApiError(400, `Unknown creator campaign ${row.campaign}`)
  const sourceHash = createHash('sha256').update(csv).digest('hex')
  const keys = new Set<string>()
  const values = rows.map(row => {
    const currency = row.currency || 'UNK', key = `${row.campaign}:${row.day}:${row.territory}:${currency}`
    if (keys.has(key)) throw new ApiError(400, 'Duplicate campaign/date/territory/currency rows in this export')
    keys.add(key)
    return { ...row, currency, trackingLinkId: byCampaign.get(row.campaign)!, sourceHash, importedAt: new Date() }
  })
  await db.transaction(async tx => {
    for (let offset = 0; offset < values.length; offset += 200) {
      await tx.insert(schema.creatorStoreCampaignMetrics).values(values.slice(offset, offset+200)).onConflictDoUpdate({
        target: [schema.creatorStoreCampaignMetrics.campaign, schema.creatorStoreCampaignMetrics.day, schema.creatorStoreCampaignMetrics.territory, schema.creatorStoreCampaignMetrics.currency],
        set: { downloads: sql`excluded.downloads`, sales: sql`excluded.sales`, sourceHash, importedAt: new Date() },
      })
    }
  })
  return { rows: rows.length, sourceHash }
}
