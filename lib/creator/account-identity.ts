import { z } from 'zod'
import { creatorSocialAccountSchema } from './validation'
import { followerRangeSchema } from './tiktok-anchor'
export const creatorConnectAccountSchema = z
  .object({
    platform: z.enum(['tiktok', 'instagram']),
    identity: z.string().trim().min(1).max(2048),
    followerRange: followerRangeSchema.optional(),
  })
  .transform((value, ctx) => {
    let handle = value.identity
    let profileUrl: string | undefined
    if (/^(https?:\/\/)?(www\.)?(tiktok|instagram)\.com\//i.test(handle)) {
      try {
        const url = new URL(
          handle.startsWith('http') ? handle : `https://${handle}`,
        )
        handle = url.pathname.replace(/^\/@?/, '').replace(/\/$/, '')
        profileUrl = `${url.origin}${url.pathname}`
      } catch {
        handle = ''
      }
    }
    const parsed = creatorSocialAccountSchema.safeParse({
      platform: value.platform,
      handle,
      profileUrl,
      followerRange: value.platform === 'tiktok' ? value.followerRange : undefined,
    })
    if (!/[a-z0-9]/i.test(handle)) {
      ctx.addIssue({
        code: 'custom',
        path: ['identity'],
        message: 'Enter a valid account handle',
      })
      return z.NEVER
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: ['identity'],
          message: issue.message,
        })
      return z.NEVER
    }
    return parsed.data
  })
