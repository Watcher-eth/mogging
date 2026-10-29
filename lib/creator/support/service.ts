import { ApiError } from '@/lib/api/http'
import { createSupportDataSource } from './data'
import { runSupportAgent } from './agent'
import { readSupportAllowance, reserveSupportMessage } from './allowance-store'
import { nextSupportMemory, readSupportConversation, signSupportConversation } from './conversation'
import type { SupportRequest, SupportResponse } from './contracts'
import type { SupportAllowance } from './allowance'

export class SupportDailyLimit extends ApiError {
  constructor(public readonly allowance: SupportAllowance) {
    super(429, 'You’ve used your 4 messages for today. Your allowance resets at midnight UTC.')
  }
}

/** Both transports use the authenticated app user ID, never a client-supplied creator ID. */
export async function executeCreatorSupport(userId: string, input: SupportRequest, options: { signal?: AbortSignal; conversationOwner?: string; deliver?: (result: SupportResponse) => Promise<void> } = {}) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new ApiError(503, 'Creator support is not configured')
  const owner = options.conversationOwner ?? userId
  const memory = readSupportConversation(input.conversation, owner, secret)
  const source = await createSupportDataSource(userId)
  const reservation = await reserveSupportMessage(userId)
  if (!reservation.accepted) throw new SupportDailyLimit(reservation.allowance)
  try {
    const result = await runSupportAgent({ input, memory, source, sampleData: false, apiKey: process.env.OPENROUTER_API_KEY, signal: options.signal ?? AbortSignal.timeout(45_000) })
    if (result.engine === 'unavailable') await reservation.refund()
    result.conversation = signSupportConversation(nextSupportMemory(memory, input.message, result), owner, secret)
    result.allowance = await readSupportAllowance(userId)
    await options.deliver?.(result)
    return result
  } catch (error) {
    await reservation.refund()
    throw error
  }
}
