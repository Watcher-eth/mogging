import { chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { FACIAL_CAMPAIGN_DESCRIPTION, GENERATED_FACIAL_CAMPAIGN_ID, LEGACY_FACIAL_CAMPAIGN_ID, replacementFacialTerms, withAnchorRequirement } from '../../lib/creator/facial-campaign-update'

// Dry run by default. Apply only after owner approval of the local review screen.
const apply = process.argv.includes('--apply')
const backup = process.argv.find(arg => arg.startsWith('--backup='))?.slice(9)
if (apply && (!backup || resolve(backup) !== backup)) throw new Error('An absolute --backup= path is required')
try {
  const report = await db.transaction(async tx => {
    await tx.execute(sql`lock table creator_sprints in share row exclusive mode`)
    const campaigns = await tx.query.creatorSprints.findMany()
    const legacy = campaigns.find(c => c.id === LEGACY_FACIAL_CAMPAIGN_ID)
    const generated = campaigns.find(c => c.id === GENERATED_FACIAL_CAMPAIGN_ID)
    if (!legacy || !generated) throw new Error('Expected facial campaigns were not found')
    if (generated.terms.submitOnPublish) return { alreadyApplied: true }
    if (legacy.status !== 'published' || generated.status !== 'published' || generated.terms.mgcSourceCampaignId !== legacy.id) throw new Error('Campaigns changed; review before applying')
    const terms = replacementFacialTerms(generated.terms)
    const result = {
      applied: apply,
      retiredCampaignId: legacy.id,
      retainedCampaignId: generated.id,
      name: 'Detailed Facial Analysis',
      description: FACIAL_CAMPAIGN_DESCRIPTION,
      rates: terms.milestones,
      anchorRequiredFor: campaigns.filter(c => c.status !== 'ended' && c.id !== legacy.id).map(c => c.name),
      visibility: 'all creators, replacing the original campaign',
      sharedBudgetPreserved: true,
      existingSubmissionsAndPaymentsUnchanged: true,
    }
    if (!apply) return result
    await Bun.write(backup!, JSON.stringify({ at: new Date().toISOString(), campaigns }, null, 2))
    await chmod(backup!, 0o600)
    const now = new Date()
    // Retire from new submissions, retaining the budget owner and historical references.
    await tx.update(schema.creatorSprints).set({ status: 'ended', endsAt: now, updatedAt: now }).where(eq(schema.creatorSprints.id, legacy.id))
    await tx.update(schema.creatorSprints).set({ name: result.name, description: result.description, terms, audience: legacy.audience, updatedAt: now }).where(eq(schema.creatorSprints.id, generated.id))
    for (const campaign of campaigns) {
      if (campaign.status === 'ended' || [legacy.id, generated.id].includes(campaign.id)) continue
      await tx.update(schema.creatorSprints).set({ terms: withAnchorRequirement(campaign.terms), updatedAt: now }).where(eq(schema.creatorSprints.id, campaign.id))
    }
    return result
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await db.$client.end()
}
