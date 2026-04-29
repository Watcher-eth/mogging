import type { NextApiRequest, NextApiResponse } from 'next'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { ApiError } from './http'

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

export async function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
) {
  if (redis) {
    return enforceRedisRateLimit(req, res, options)
  }

  return enforceMemoryRateLimit(req, res, options)
}

export function getRateLimitBackend() {
  return redis ? 'upstash' : 'memory'
}

function enforceMemoryRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
) {
  const now = Date.now()
  const actor = getClientKey(req)
  const key = `${options.key}:${actor}`
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    setRateLimitHeaders(res, options.limit, options.limit - 1, now + options.windowMs)
    return
  }

  bucket.count += 1
  const remaining = Math.max(options.limit - bucket.count, 0)
  setRateLimitHeaders(res, options.limit, remaining, bucket.resetAt)

  if (bucket.count > options.limit) {
    throw new ApiError(429, 'Rate limit exceeded', 'rate_limited')
  }
}

async function enforceRedisRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  options: RateLimitOptions
) {
  const now = Date.now()
  const actor = getClientKey(req)
  const windowSeconds = Math.ceil(options.windowMs / 1000)
  const bucket = Math.floor(now / options.windowMs)
  const key = `rate_limit:${options.key}:${bucket}:${actor}`
  const count = await redis!.incr(key)

  if (count === 1) {
    await redis!.expire(key, windowSeconds)
  }

  const resetAt = (bucket + 1) * options.windowMs
  const remaining = Math.max(options.limit - count, 0)
  setRateLimitHeaders(res, options.limit, remaining, resetAt)

  if (count > options.limit) {
    throw new ApiError(429, 'Rate limit exceeded', 'rate_limited')
  }
}

function getClientKey(req: NextApiRequest) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim() || 'unknown'
  if (Array.isArray(forwardedFor)) return forwardedFor[0] || 'unknown'

  return req.socket.remoteAddress || 'unknown'
}

function setRateLimitHeaders(
  res: NextApiResponse,
  limit: number,
  remaining: number,
  resetAt: number
) {
  res.setHeader('RateLimit-Limit', String(limit))
  res.setHeader('RateLimit-Remaining', String(remaining))
  res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
}
