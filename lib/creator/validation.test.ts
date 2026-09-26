import { describe, expect, test } from 'bun:test'
import { creatorPostUrlSchema, creatorProfileSchema, creatorSocialAccountSchema, creatorSubmissionSchema } from './validation'

describe('creator input validation', () => {
  test('accepts supported published posts and short TikTok links', () => {
    for (const url of ['https://www.tiktok.com/@nate/video/123456789', 'https://vm.tiktok.com/Ab123/', 'https://www.tiktok.com/t/Ab123/?share=1', 'https://instagram.com/reel/ABC_123/', 'https://www.instagram.com/p/ABC-123/']) expect(creatorPostUrlSchema.safeParse(url).success).toBe(true)
  })
  test('rejects malformed, unsafe, unrelated, profile-only and spoofed links', () => {
    for (const url of ['garbage', 'javascript:alert(1)', 'http://www.tiktok.com/@nate/video/123', 'https://example.com/test', 'https://www.tiktok.com/@nate', 'https://tiktok.com.evil.com/@nate/video/123', 'https://evil@www.tiktok.com/@nate/video/123', 'https://instagram.com/reel/', 'https://www.tiktok.com:444/@nate/video/123']) expect(creatorPostUrlSchema.safeParse(url).success).toBe(false)
  })
  test('profile links must match platform and normalized username', () => {
    expect(creatorSocialAccountSchema.safeParse({platform:'instagram', handle:' @Nate ', profileUrl:'https://www.instagram.com/nate/'}).success).toBe(true)
    for (const profileUrl of ['https://example.com/nate', 'https://instagram.com/other', 'https://instagram.com/p/nate', 'http://instagram.com/nate']) expect(creatorSocialAccountSchema.safeParse({platform:'instagram', handle:'nate', profileUrl}).success).toBe(false)
    expect(creatorSocialAccountSchema.safeParse({platform:'instagram', handle:'@', profileUrl:null}).success).toBe(false)
  })
  test('requires real profile fields and network-appropriate address syntax', () => {
    expect(creatorProfileSchema.safeParse({displayName:'  ', paymentOption:'paypal', paypalEmail:'nate@example.com'}).success).toBe(false)
    expect(creatorProfileSchema.safeParse({displayName:'Nate', paymentOption:'paypal', paypalEmail:'bad'}).success).toBe(false)
    expect(creatorProfileSchema.safeParse({displayName:'Nate', paymentOption:'crypto', cryptoNetwork:'BASE', cryptoWalletAddress:'garbage'}).success).toBe(false)
    expect(creatorProfileSchema.safeParse({displayName:'Nate', paymentOption:'crypto', cryptoNetwork:'BASE', cryptoWalletAddress:'0x'+'a'.repeat(40)}).success).toBe(true)
  })
  test('rejects tampered thresholds, missing confirmation and invalid file metadata', () => {
    const input = {formatId:'general', requirementsConfirmed:true, postUrl:'https://www.tiktok.com/@nate/video/123', analyticsScreenshotUrl:'/test.png', analyticsStorageKey:'test', analyticsContentType:'image/png', analyticsSizeBytes:100, viewCountThreshold:40000, usAudiencePercent:40}
    expect(creatorSubmissionSchema.safeParse(input).success).toBe(true)
    for (const patch of [{viewCountThreshold:1}, {requirementsConfirmed:false}, {analyticsSizeBytes:0}, {analyticsSizeBytes:10485761}, {analyticsContentType:'text/html'}, {usAudiencePercent:99}]) expect(creatorSubmissionSchema.safeParse({...input,...patch}).success).toBe(false)
  })
})
