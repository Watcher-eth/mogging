import { isDeepStrictEqual } from 'node:util'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { compositionSchema, type VideoRecipe } from './video-composition'
import { creatorPostPlatform, creatorPostUrlSchema } from './validation'
import { launchCampaign } from './campaign-launch'
import { sprintPhase, sprintFormat } from './sprints'
import { requireSubmissionBudget } from './campaign-budget-service'
import { canSeeCampaign } from './campaign-access'
import { getCreatorProfile, verifyCreatorPublishedPost } from './service'
import { recordSubmissionUpdate } from './submission-updates'
import { rethrowCreatorPostConflict } from './post-identity'

export const studioGenerationSchema = z.object({
  id: z.string().uuid(), personId: z.string().trim().min(1).max(100), storyId: z.string().trim().min(1).max(160),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), composition: compositionSchema,
}).strict()
export const studioPostSchema = z.object({ generationId: z.string().uuid(), postUrl: creatorPostUrlSchema, socialAccountId: z.string().uuid(), requirementsConfirmed: z.literal(true) }).strict()
export const studioCampaignAllows = canSeeCampaign
export function studioCampaignKey(recipe: VideoRecipe) { return recipe === 'measurement-explainer' ? 'feature-comparison' : 'detailed-analysis' }

export async function requireVideoStudioAccess(userId: string) {
  const profile = await getCreatorProfile(userId)
  if (!profile?.videoStudioAccess || profile.authStatus === 'suspended') throw new ApiError(403, 'Creator Video Studio access is required')
  return profile
}

export async function listStudioGenerations(userId: string) {
  const profile = await requireVideoStudioAccess(userId)
  const generations = await db.query.creatorStudioGenerations.findMany({ where: eq(schema.creatorStudioGenerations.creatorProfileId, profile.id), orderBy: [desc(schema.creatorStudioGenerations.createdAt)], limit: 20 })
  const submissions = await db.select({ id: schema.creatorSubmissions.id, generationId: schema.creatorSubmissions.studioGenerationId }).from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.creatorProfileId, profile.id))
  return generations.filter(generation => !submissions.some(post => post.generationId === generation.id)).map(generation => ({ id: generation.id, title: generation.composition.title, campaignName: generation.sprintTerms.mgcSourceCampaignId ? 'Mogging Detailed Analysis MGC' : launchCampaign(generation.sprintTerms)?.name ?? 'Campaign', minimumViews: Math.min(...generation.sprintTerms.milestones.map(item => item.views)) }))
}

export async function registerStudioGeneration(userId: string, value: unknown) {
  const input = studioGenerationSchema.parse(value)
  const profile = await requireVideoStudioAccess(userId)
  const campaigns = await db.query.creatorSprints.findMany({ orderBy: [desc(schema.creatorSprints.createdAt)] })
  const campaign = campaigns.find(item => launchCampaign(item.terms)?.key === studioCampaignKey(input.composition.recipe) && (studioCampaignKey(input.composition.recipe) !== 'detailed-analysis' || Boolean(item.terms.mgcSourceCampaignId)) && studioCampaignAllows(item.audience, profile.id) && sprintPhase({ ...item, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() }) === 'active')
  if (!campaign) throw new ApiError(409, 'The assigned campaign is not currently accepting studio posts')
  const format = campaign.terms.formats.find(format => format.active)
  if (!format) throw new ApiError(409, 'The assigned campaign has no available format')
  await db.insert(schema.creatorStudioGenerations).values({ ...input, creatorProfileId: profile.id, sprintId: campaign.id, sprintTerms: campaign.terms, formatId: format.id }).onConflictDoNothing({ target: schema.creatorStudioGenerations.id })
  const saved = await db.query.creatorStudioGenerations.findFirst({ where: eq(schema.creatorStudioGenerations.id, input.id) })
  if (!saved || saved.creatorProfileId !== profile.id || saved.contentHash !== input.contentHash || saved.personId !== input.personId || saved.storyId !== input.storyId || !isDeepStrictEqual(saved.composition, JSON.parse(JSON.stringify(input.composition)))) throw new ApiError(409, 'This export identity has already been used')
  return { id: saved.id, title: saved.composition.title, campaignName: saved.sprintTerms.mgcSourceCampaignId ? 'Mogging Detailed Analysis MGC' : launchCampaign(saved.sprintTerms)?.name ?? campaign.name, minimumViews: Math.min(...saved.sprintTerms.milestones.map(item => item.views)) }
}

export async function submitStudioPost(userId: string, value: unknown) {
  const input = studioPostSchema.parse(value)
  const profile = await requireVideoStudioAccess(userId)
  const generation = await db.query.creatorStudioGenerations.findFirst({ where: and(eq(schema.creatorStudioGenerations.id, input.generationId), eq(schema.creatorStudioGenerations.creatorProfileId, profile.id)) })
  if (!generation) throw new ApiError(404, 'Studio export not found')
  const platform = creatorPostPlatform(input.postUrl)!
  if (!generation.sprintTerms.platforms.includes(platform)) throw new ApiError(400, 'This platform is not accepted by the assigned campaign')
  const { socialAccount, postLink } = await verifyCreatorPublishedPost(profile.id, input)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${postLink.key}, 0))`)
    const existing = await tx.query.creatorSubmissions.findFirst({ where: or(eq(schema.creatorSubmissions.postKey, postLink.key), eq(schema.creatorSubmissions.postUrl, input.postUrl)) })
    if (existing) {
      if (existing.creatorProfileId === profile.id && existing.studioGenerationId === generation.id) return existing
      throw new ApiError(409, 'This post has already been submitted')
    }
    const [campaign] = await tx.select().from(schema.creatorSprints).where(eq(schema.creatorSprints.id, generation.sprintId)).for('update')
    if (!campaign || sprintPhase({ ...campaign, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString() }) !== 'active') throw new ApiError(409, 'The assigned campaign is no longer accepting posts')
    if (!studioCampaignAllows(campaign.audience, profile.id)) throw new ApiError(403, 'This campaign is not assigned to your creator account')
    await requireSubmissionBudget(tx, campaign.id, 0)
    const format = sprintFormat(generation.sprintTerms, generation.formatId)
    if (!format) throw new ApiError(409, 'The saved campaign format is unavailable')
    const [submission] = await tx.insert(schema.creatorSubmissions).values({ creatorProfileId: profile.id, socialAccountId: socialAccount?.id, studioGenerationId: generation.id, sprintId: generation.sprintId, sprintTerms: generation.sprintTerms, formatId: generation.formatId, title: generation.composition.title, platform: platform === 'tiktok' ? 'TikTok' : 'Instagram Reels', postUrl: postLink.url, postKey: postLink.key, requirementsConfirmedAt: new Date(), isDraft: false, status: 'pending' }).returning()
    await recordSubmissionUpdate(tx, submission.id, 'submitted', 'Posted from Creator Video Studio. Analytics can be added at the first campaign milestone.')
    return submission
  }).catch(rethrowCreatorPostConflict)
}
