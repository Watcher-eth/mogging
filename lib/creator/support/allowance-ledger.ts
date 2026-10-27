import type { Redis } from '@upstash/redis'
import { ApiError } from '@/lib/api/http'
import { SUPPORT_DAILY_MESSAGES, supportAllowance, supportDay } from './allowance'

export function createSupportAllowanceStore(redis: Pick<Redis, 'get' | 'eval'> | null, production = false) {
  // Development only. Production must share a durable counter across instances.
  const memory = new Map<string, { count: number; resetsAt: number }>()
  const reserveScript = `local n = tonumber(redis.call('GET', KEYS[1]) or '0')
  if n >= tonumber(ARGV[1]) then return -1 end
  redis.call('SET', KEYS[1], n + 1, 'EX', ARGV[2])
  return n + 1`
  const refundScript = `local n = tonumber(redis.call('GET', KEYS[1]) or '0')
  if n > 0 then redis.call('DECR', KEYS[1]) end
  return 1`
  function counterKey(creatorId: string, now: number) { return `creator-support:daily:v1:${supportDay(now).day}:${creatorId}` }
  function requireStore() { if (!redis && production) throw new ApiError(503, 'Creator support is temporarily unavailable') }
  async function readSupportAllowance(creatorId: string, now = Date.now()) {
    requireStore()
    const key = counterKey(creatorId, now)
    const count = redis ? Number(await redis.get<number>(key) ?? 0) : memory.get(key)?.count ?? 0
    return supportAllowance(count, now)
  }
  async function reserveSupportMessage(creatorId: string, now = Date.now()) {
    requireStore()
    const key = counterKey(creatorId, now)
    const { resetsAt } = supportDay(now)
    let count: number
    if (redis) count = Number(await redis.eval(reserveScript, [key], [SUPPORT_DAILY_MESSAGES, Math.max(1, Math.ceil((resetsAt - now) / 1000))]))
    else {
      for (const [oldKey, value] of memory) if (value.resetsAt <= now) memory.delete(oldKey)
      const prior = memory.get(key)?.count ?? 0
      count = prior >= SUPPORT_DAILY_MESSAGES ? -1 : prior + 1
      if (count !== -1) memory.set(key, { count, resetsAt })
    }
    let refunded = false
    return { accepted: count !== -1, allowance: supportAllowance(count === -1 ? SUPPORT_DAILY_MESSAGES : count, now), async refund() {
      if (refunded || count === -1) return
      refunded = true
      if (redis) await redis.eval(refundScript, [key], [])
      else { const value = memory.get(key); if (value) value.count = Math.max(0, value.count - 1) }
    } }
  }

  return { readSupportAllowance, reserveSupportMessage }

}
