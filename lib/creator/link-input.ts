import { z } from 'zod'
import { creatorPostUrlSchema } from './validation'

// Explicit creator entry accepts the same public links and @handles we publish.
// Never fetch arbitrary URLs or accept personal invite paths as creator codes.
export function normalizeCreatorCode(value: string): string | null {
  let code = value.trim().replace(/^@/, '')
  if (/^(?:www\.)?mogging\.com\//i.test(code)) code = `https://${code}`
  if (code.includes('://')) {
    try {
      const url = new URL(code)
      if (url.username || url.password || url.port) return null
      if (url.protocol === 'https:' && ['mogging.com', 'www.mogging.com'].includes(url.hostname)) {
        code = /^\/r\/([a-z0-9._-]+)\/?$/i.exec(url.pathname)?.[1] ?? ''
      } else if (url.protocol === 'mogging:' && url.hostname === 'r') {
        code = /^\/([a-z0-9._-]+)\/?$/i.exec(url.pathname)?.[1] ?? ''
      } else return null
    } catch { return null }
  }
  return /^[a-z0-9._-]{1,200}$/i.test(code) ? code.toLowerCase() : null
}
const source = z.enum(['native_link', 'creator_code']).default('creator_code')
export const creatorLinkInputSchema = z.union([
  z.object({ source, slug: z.string().max(2048).transform(normalizeCreatorCode).pipe(z.string()) }),
  z.object({ source, postUrl: creatorPostUrlSchema }),
])
