import { z } from 'zod'
import { creatorSocialAccountSchema } from './validation'

export const CREATOR_INVITE_PROGRESS = 66

export function isCreatorAvatarUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'byteoversea.com', 'ibytedtos.com', 'muscdn.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch { return false }
}

export const creatorInviteSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  handle: z.string(),
  profileUrl: z.string().trim().url().max(2048),
  avatarUrl: z.union([z.literal(''), z.string().trim().max(2048).refine(isCreatorAvatarUrl, 'Use a TikTok CDN profile-photo URL')]).optional(),
  evidenceUrl: z.string().trim().url().max(2048).refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
        (url.hostname === 'discord.com' && /^\/channels\/(?:@me|\d+)\/\d+\/\d+$/.test(url.pathname)) ||
        (url.hostname === 'cdn.discordapp.com' && /^\/attachments\/\d+\/\d+\/[^/]+\.(?:mov|mp4|webm)$/i.test(url.pathname))
      )
    } catch { return false }
  }, 'Enter the Discord message or recording link containing the reviewed analytics'),
  verificationConfirmed: z.literal(true),
}).transform((value, ctx) => {
  const account = creatorSocialAccountSchema.safeParse({ platform: 'tiktok', handle: value.handle, profileUrl: value.profileUrl })
  if (!account.success) {
    for (const issue of account.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    return z.NEVER
  }
  return { ...value, handle: account.data.handle, profileUrl: `https://www.tiktok.com/@${account.data.handle}` }
})

export const creatorInviteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
export type CreatorInviteInput = z.infer<typeof creatorInviteSchema>
export type CreatorInvitePreview = { displayName: string; handle: string; avatarUrl: string | null; state: 'ready' | 'claimed' | 'unavailable' }
