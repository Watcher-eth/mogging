import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { createSupportAllowanceStore } from './allowance-ledger'

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }) : null

export const { readSupportAllowance, reserveSupportMessage } = createSupportAllowanceStore(redis, process.env.NODE_ENV === 'production')
