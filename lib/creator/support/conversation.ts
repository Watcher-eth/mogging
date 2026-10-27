import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'

const memorySchema = z.object({ owner: z.string(), exp: z.number(), messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(900) })).max(6) })
export type SupportMemory = z.infer<typeof memorySchema>['messages']
function signature(payload: string, secret: string) { return createHmac('sha256', secret).update(payload).digest() }
export function readSupportConversation(token: string | undefined, owner: string, secret: string): SupportMemory {
  if (!token) return []
  try {
    const [payload, sig, extra] = token.split('.')
    if (!payload || !sig || extra) throw new Error('Invalid token')
    const expected = signature(payload, secret), received = Buffer.from(sig, 'base64url')
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid signature')
    const memory = memorySchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
    if (memory.owner !== owner || memory.exp < Date.now()) throw new Error('Expired conversation')
    return memory.messages
  } catch { throw new ApiError(400, 'This conversation expired. Start a new chat.') }
}
export function signSupportConversation(messages: SupportMemory, owner: string, secret: string) {
  const payload = Buffer.from(JSON.stringify({ owner, exp: Date.now() + 30 * 60_000, messages: messages.slice(-6).map(item => ({ role: item.role, content: item.content.slice(0, 900) })) })).toString('base64url')
  return `${payload}.${signature(payload, secret).toString('base64url')}`
}

/** Scope redirects must not pollute later model context with unrelated requests. */
export function nextSupportMemory(memory: SupportMemory, message: string, response: { text: string; engine: string; artifacts: import('./contracts').SupportArtifact[] }): SupportMemory {
  if (response.engine === 'instant' && response.artifacts.length === 0) return memory
  const references = response.artifacts.flatMap(a => {
    if (a.type === 'video-analytics') return [`Conversion analytics: ${a.report.window.label}`, ...(a.report.selection === 'video' ? a.report.videos.map(v => `Video ${v.id}: ${v.title.slice(0,60)}`) : [])]
    if (a.type === 'submission-detail') return [`Submission ${a.detail.submission.id}: ${a.detail.submission.title.slice(0, 60)}${a.detail.context ? `; campaign ${a.detail.context.campaign.id}` : ''}`]
    if (a.type === 'campaign-detail') return [`Campaign ${a.context.campaign.id}: ${a.context.campaign.name}`]
    if (a.type === 'campaign-examples') return [`Campaign ${a.campaign.id}: ${a.campaign.name}`]
    return []
  })
  const context = [...new Set(references)].slice(0, 2).join(' | ').slice(0, 300)
  return [...memory, { role: 'user', content: message }, { role: 'assistant', content: `${context ? `Portal references: ${context}\n` : ''}${response.text}`.slice(0, 900) }]
}
