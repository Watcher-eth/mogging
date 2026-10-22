import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { ensureCreatorTrackingLink } from './attribution'
import { getOrCreateCreatorProfile } from './service'
import { creatorPostPlatform, creatorPostUrlSchema } from './validation'
import { resolveCreatorPostLink, rethrowCreatorPostConflict } from './post-identity'
import { publishingTikTokHandle } from './tiktok-anchor'
import { captionContainsCreatorCode, creatorCaption } from './post-guidance'
import { sprintFormat, sprintPhase } from './sprints'

export const registerPostSchema = z.object({ sprintId: z.string().uuid(), socialAccountId: z.string().uuid(), formatId: z.string().min(1).max(80) })
export const publishRegisteredPostSchema = z.object({
  id: z.string().uuid(), postUrl: creatorPostUrlSchema, caption: z.string().trim().min(1).max(2200),
  postedAt: z.iso.datetime().refine(value => Date.parse(value) <= Date.now() + 300_000, 'Posting time cannot be in the future'),
})

export async function registerCreatorPost(userId: string, input: z.infer<typeof registerPostSchema>) {
  const profile = await getOrCreateCreatorProfile(userId)
  if (profile.authStatus === 'suspended') throw new ApiError(403, 'Your creator account is suspended')
  const [account, sprint] = await Promise.all([
    db.query.creatorSocialAccounts.findFirst({ where: and(eq(schema.creatorSocialAccounts.id, input.socialAccountId), eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)) }),
    db.query.creatorSprints.findFirst({ where: eq(schema.creatorSprints.id, input.sprintId) }),
  ])
  if (!account || account.status !== 'approved') throw new ApiError(400, 'Choose an approved social account')
  if (!sprint || sprintPhase({ ...sprint, startsAt: sprint.startsAt.toISOString(), endsAt: sprint.endsAt.toISOString() }) !== 'active') throw new ApiError(409, 'Choose an active campaign')
  const format = sprintFormat(sprint.terms, input.formatId)
  if (!format || !sprint.terms.platforms.includes(account.platform)) throw new ApiError(400, 'Choose a campaign format for this platform')
  const link = await ensureCreatorTrackingLink(account.id)
  if (!link) throw new ApiError(400, 'Set up this account’s creator link first')
  return db.transaction(async tx => {
    const [post] = await tx.insert(schema.creatorSubmissions).values({
      creatorProfileId: profile.id, socialAccountId: account.id, sprintId: sprint.id, sprintTerms: sprint.terms,
      formatId: format.id, title: format.name, platform: account.platform === 'tiktok' ? 'TikTok' : 'Instagram Reels', isDraft: true,
    }).returning()
    const code = `p-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    await tx.insert(schema.creatorTrackingLinkAliases).values({ slug: code, trackingLinkId: link.id, submissionId: post.id })
    return { ...post, code, publicUrl: `https://www.mogging.com/r/${code}`, suggestedCaption: creatorCaption(code) }
  })
}

export async function publishRegisteredPost(userId: string, input: z.infer<typeof publishRegisteredPostSchema>) {
  const profile = await getOrCreateCreatorProfile(userId)
  if (profile.authStatus === 'suspended') throw new ApiError(403, 'Your creator account is suspended')
  const post = await db.query.creatorSubmissions.findFirst({ where: and(eq(schema.creatorSubmissions.id, input.id), eq(schema.creatorSubmissions.creatorProfileId, profile.id)) })
  if (!post?.isDraft || !post.socialAccountId) throw new ApiError(409, 'This registered post has already been submitted')
  const code = await db.query.creatorTrackingLinkAliases.findFirst({ where: eq(schema.creatorTrackingLinkAliases.submissionId, post.id) })
  if (code && !captionContainsCreatorCode(input.caption, code.slug)) throw new ApiError(400, `Include this post’s code ${code.slug} in its published caption so viewers can credit the correct video.`)
  const account = await db.query.creatorSocialAccounts.findFirst({ where: eq(schema.creatorSocialAccounts.id, post.socialAccountId) })
  if (!account || creatorPostPlatform(input.postUrl) !== account.platform) throw new ApiError(400, 'Choose the post published by this social account')
  const canonical = await resolveCreatorPostLink(input.postUrl)
  if (account.platform === 'tiktok' && publishingTikTokHandle(canonical.url) !== account.handle?.toLowerCase()) throw new ApiError(400, 'This TikTok post belongs to another account')
  const [updated] = await db.update(schema.creatorSubmissions).set({ postUrl: canonical.url, postKey: canonical.key,
    caption: input.caption, postedAt: new Date(input.postedAt), updatedAt: new Date() })
    .where(and(eq(schema.creatorSubmissions.id, post.id), eq(schema.creatorSubmissions.isDraft, true))).returning().catch(rethrowCreatorPostConflict)
  if (!updated) throw new ApiError(409, 'This post changed. Refresh and try again.')
  return updated
}
