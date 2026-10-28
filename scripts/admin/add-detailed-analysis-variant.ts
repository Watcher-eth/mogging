import { isDeepStrictEqual } from 'node:util'
import { inArray, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { detailedAnalysisVariantTerms } from '../../lib/creator/detailed-analysis-variant'
import { canSeeCampaign } from '../../lib/creator/campaign-access'

const sourceId = 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'
const variantId = 'd4c7c3af-9ba7-43ba-bf14-c66c7d9d4d11'
const creators = [
  { id: 'a4ebf114-15a8-42b2-ac61-134690ef1db0', name: 'Jannis Müpller' },
  { id: 'e4806c64-ff43-4641-857e-fead8462fc7e', name: 'zukai method' },
  { id: '9b24ff22-f3f9-42a1-a273-6e0fab0403b9', name: 'ascendic international' },
]
const apply = process.argv.includes('--apply')
try {
  const report = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('creator-detailed-analysis-variant', 0))`)
    const campaigns = await tx.select().from(schema.creatorSprints).orderBy(schema.creatorSprints.id).for('update')
    const source = campaigns.find(row => row.id === sourceId)
    if (!source || source.status !== 'published' || source.endsAt <= new Date() || !source.terms.formats.some(format => format.id === 'launch-detailed-analysis-v1')) throw new Error('Expected live detailed analysis campaign missing or ended')
    const profiles = await tx.query.creatorProfiles.findMany({ where: inArray(schema.creatorProfiles.id, creators.map(creator => creator.id)) })
    if (creators.some(creator => !profiles.some(profile => profile.id === creator.id && profile.displayName === creator.name))) throw new Error('Creator identities changed; review before applying')
    const terms = detailedAnalysisVariantTerms(source.terms, source.id)
    const existing = campaigns.find(row => row.id === variantId)
    if (existing) {
      if (!isDeepStrictEqual(existing.terms, terms) || creators.some(creator => !canSeeCampaign(existing.audience, creator.id) || !canSeeCampaign(source.audience, creator.id))) throw new Error('Existing variant or audience differs; review in admin')
      return { alreadyApplied: true, variantId }
    }
    if (source.audience.mode !== 'all') throw new Error('Source already has custom visibility; review before applying')
    const creatorIds = creators.map(creator => creator.id)
    const values = { budgetPoolId: source.budgetPoolId ?? source.id, id: variantId, name: 'Mogging Detailed Analysis MGC', description: source.description, status: source.status, budgetCents: source.budgetCents, startsAt: source.startsAt, endsAt: source.endsAt, terms, audience: { mode: 'selected' as const, creatorIds } }
    if (apply) {
      await tx.insert(schema.creatorSprints).values(values)
      const after = await tx.query.creatorSprints.findMany({ orderBy: schema.creatorSprints.id })
      for (const previous of campaigns) {
        const current = after.find(row => row.id === previous.id)!
        if (!isDeepStrictEqual(current, previous)) throw new Error('An existing campaign changed; rolling back')
      }
    }
    return { applied: apply, variantId, name: values.name, creators: creators.map(creator => creator.name), milestones: terms.milestones, contentBudgetCents: values.budgetCents, bonusBudgetCents: terms.bonusBudgetCents, existingCampaignTermsUnchanged: true, existingSubmissionsAndPaymentsUnchanged: true }
  })
  console.log(JSON.stringify(report, null, 2))
} finally { await db.$client.end() }
