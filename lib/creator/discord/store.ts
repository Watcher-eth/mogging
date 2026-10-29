import { Redis } from '@upstash/redis'
import { ApiError } from '@/lib/api/http'

let client: Redis | undefined
export function discordStore() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new ApiError(503, 'Discord support is temporarily unavailable')
  return client ??= new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
}
