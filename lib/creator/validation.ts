import { z } from 'zod'
import { isCreatorViewThreshold } from './payouts'

export function creatorPostPlatform(value: string): 'tiktok' | 'instagram' | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(url.hostname) && /^\/@[\w.]+\/video\/\d+\/?$/.test(url.pathname)) return 'tiktok'
    if (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) && /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) return 'tiktok'
    if (['www.tiktok.com', 'tiktok.com'].includes(url.hostname) && /^\/t\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) return 'tiktok'
    if (['www.instagram.com', 'instagram.com'].includes(url.hostname) && /^\/(reel|reels|p)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return 'instagram'
    return null
  } catch { return null }
}

export const creatorPostUrlSchema = z.string().trim().max(2048).refine(
  (value) => creatorPostPlatform(value) !== null,
  'Enter a published TikTok or Instagram post link beginning with https://'
)

export const creatorProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    socialHandle: z.string().trim().max(120).optional().nullable(),
    paymentOption: z.enum(['paypal', 'crypto']),
    paypalEmail: z.string().trim().email().optional().nullable(),
    cryptoNetwork: z.string().trim().max(40).optional().nullable(),
    cryptoWalletAddress: z.string().trim().max(180).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentOption === 'paypal' && !value.paypalEmail) {
      ctx.addIssue({ code: 'custom', path: ['paypalEmail'], message: 'PayPal email is required' })
    }
    if (value.paymentOption === 'crypto' && value.cryptoWalletAddress) {
      const network = value.cryptoNetwork?.toLowerCase()
      const address = value.cryptoWalletAddress
      const valid = network === 'base' || network === 'ethereum'
        ? /^0x[0-9a-fA-F]{40}$/.test(address)
        : network === 'usdc on solana'
          ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
          : /^[a-zA-Z0-9:_-]{14,180}$/.test(address)
      if (!valid) ctx.addIssue({ code: 'custom', path: ['cryptoWalletAddress'], message: 'Enter a valid wallet address for the selected network' })
    }
    if (value.paymentOption === 'crypto' && (!value.cryptoNetwork || !value.cryptoWalletAddress)) {
      ctx.addIssue({ code: 'custom', path: ['cryptoWalletAddress'], message: 'Network and wallet address are required' })
    }
  })

export const creatorSubmissionSchema = z.object({
  formatId: z.string().trim().min(1).max(80),
  requirementsConfirmed: z.literal(true),
  socialAccountId: z.string().uuid().optional().nullable(),
  postUrl: creatorPostUrlSchema,
  analyticsScreenshotUrl: z.string().min(1),
  analyticsStorageKey: z.string().min(1),
  analyticsContentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  analyticsSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  viewCountThreshold: z.number().refine(isCreatorViewThreshold, 'Choose an available view threshold'),
  usAudiencePercent: z.number().min(22.5).max(40).multipleOf(2.5).optional().nullable(),
})

export const creatorAnalyticsEvidenceSchema = z.object({
  analyticsVideoUrl: z.string().min(1),
  analyticsStorageKey: z.string().min(1),
  analyticsContentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  analyticsSizeBytes: z.number().int().positive().max(250 * 1024 * 1024),
  analyticsPast28DaysConfirmed: z.literal(true),
})

export const creatorSocialAccountSchema = z.object({
  platform: z.enum(['tiktok', 'instagram']),
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .pipe(z.string().min(1).max(32))
    .refine((value) => /^[a-z0-9._]+$/.test(value), 'Enter a valid username'),
  profileUrl: z.union([z.literal(''), z.string().trim().url().max(2048)]).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.platform === 'instagram' && value.handle.length > 30) ctx.addIssue({ code: 'custom', path: ['handle'], message: 'Instagram usernames must be 30 characters or fewer' })
  if (!value.profileUrl) return
  let url: URL
  try { url = new URL(value.profileUrl) } catch { return }
  const hosts = value.platform === 'instagram' ? ['instagram.com', 'www.instagram.com'] : ['tiktok.com', 'www.tiktok.com']
  const expectedPath = `/${value.platform === 'tiktok' ? '@' : ''}${value.handle}`
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname) || url.pathname.replace(/\/$/, '').toLowerCase() !== expectedPath) {
    ctx.addIssue({ code: 'custom', path: ['profileUrl'], message: 'Enter the HTTPS profile link matching this platform and username' })
  }
})

export const creatorAccountAnalyticsSubmissionSchema = creatorAnalyticsEvidenceSchema.extend({
  accountId: z.string().uuid(),
})

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>
export type CreatorSubmissionInput = z.infer<typeof creatorSubmissionSchema>
export type CreatorSocialAccountInput = z.infer<typeof creatorSocialAccountSchema>
export type CreatorAnalyticsEvidenceInput = z.infer<typeof creatorAnalyticsEvidenceSchema>

