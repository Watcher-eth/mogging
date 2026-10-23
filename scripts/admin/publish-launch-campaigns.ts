import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { CAMPAIGN_LAUNCH_AT, LAUNCH_CAMPAIGNS, LAUNCH_CONTENT_BUDGET_CENTS, launchCampaignTerms } from '../../lib/creator/campaign-launch'

if (!process.argv.includes('--apply')) throw new Error('Pass --apply to publish the three scheduled launch campaigns')
const startsAt = new Date(CAMPAIGN_LAUNCH_AT)
if (Date.now() >= startsAt.getTime()) throw new Error('Launch time has passed; refuse to publish directly into Active')
const endsAt = new Date(startsAt.getTime() + 30 * 86_400_000)
const fingerprint = (rows: unknown) => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
try {
  const report = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('creator-launch-2026-10-23', 0))`)
    const before = await tx.query.creatorSprints.findMany({ orderBy: schema.creatorSprints.id })
    const launchFormats = new Set(LAUNCH_CAMPAIGNS.map(campaign => `launch-${campaign.key}-v1`))
    const legacy = before.filter(row => !row.terms.formats.some(format => launchFormats.has(format.id)))
    const published = []
    for (const campaign of LAUNCH_CAMPAIGNS) {
      const matches = before.filter(row => row.terms.formats.some(format => format.id === `launch-${campaign.key}-v1`))
      if (matches.length > 1) throw new Error(`Duplicate launch campaign: ${campaign.key}`)
      const existing = matches[0]
      const values = { name: campaign.name, description: campaign.description, status: 'published' as const, budgetCents: LAUNCH_CONTENT_BUDGET_CENTS, terms: launchCampaignTerms(campaign), startsAt, endsAt }
      if (existing && existing.status !== 'draft') {
        if (existing.status !== 'published' || existing.startsAt.getTime() !== startsAt.getTime() || existing.budgetCents !== values.budgetCents || !isDeepStrictEqual(existing.terms, values.terms)) throw new Error(`Existing published launch terms differ: ${campaign.key}`)
        published.push(existing)
      } else {
        const [row] = existing
          ? await tx.update(schema.creatorSprints).set({ ...values, updatedAt: new Date() }).where(eq(schema.creatorSprints.id, existing.id)).returning()
          : await tx.insert(schema.creatorSprints).values(values).returning()
        published.push(row)
      }
    }
    const after = await tx.query.creatorSprints.findMany({ orderBy: schema.creatorSprints.id })
    const unchanged = after.filter(row => legacy.some(previous => previous.id === row.id))
    if (fingerprint(legacy) !== fingerprint(unchanged)) throw new Error('Existing campaigns changed; rolling back')
    return { legacyCampaignsUnchanged: legacy.length, legacyFingerprint: fingerprint(legacy), campaigns: published.map(row => ({ id: row.id, name: row.name, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt, contentBudgetCents: row.budgetCents, bonusBudgetCents: row.terms.bonusBudgetCents })) }
  })
  console.log(JSON.stringify(report, null, 2))
} finally { await db.$client.end() }
