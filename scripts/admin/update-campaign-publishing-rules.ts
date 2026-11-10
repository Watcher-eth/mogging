import { chmod } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { isAbsolute } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { withCampaignPublishingRules, CAMPAIGN_PUBLISHING_GRACE_ENDS_AT } from '../../lib/creator/campaign-publishing-policy'
import { sprintTermsSchema } from '../../lib/creator/sprints'

const apply = process.argv.includes('--apply')
const backup = process.argv.find(arg => arg.startsWith('--backup='))?.slice(9)
if (apply && (!backup || !isAbsolute(backup))) throw new Error('An absolute private --backup= path is required')

try {
  const report = await db.transaction(async tx => {
    await tx.execute(sql`lock table creator_sprints in share row exclusive mode`)
    const campaigns = await tx.query.creatorSprints.findMany()
    const updates = campaigns.filter(c => c.status !== 'ended').map(campaign => ({ campaign, terms: sprintTermsSchema.parse(withCampaignPublishingRules(campaign.terms)) }))
      .filter(({ campaign, terms }) => !isDeepStrictEqual(campaign.terms, terms))
    const result = { applied: apply, graceEndsAt: CAMPAIGN_PUBLISHING_GRACE_ENDS_AT, campaigns: updates.map(({ campaign }) => ({ id: campaign.id, name: campaign.name })), existingSubmissionsAndPaymentsUnchanged: true, campaignRatesUnchanged: true }
    if (!apply || !updates.length) return result
    if (await Bun.file(backup!).exists()) throw new Error('Backup path already exists; use a new private backup path')
    await Bun.write(backup!, JSON.stringify({ at: new Date().toISOString(), campaigns }, null, 2))
    await chmod(backup!, 0o600)
    for (const { campaign, terms } of updates) {
      if (!isDeepStrictEqual(campaign.terms.milestones, terms.milestones)) throw new Error('Campaign payout rates changed unexpectedly')
      await tx.update(schema.creatorSprints).set({ terms, updatedAt: new Date() }).where(eq(schema.creatorSprints.id, campaign.id))
    }
    return result
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await db.$client.end()
}
