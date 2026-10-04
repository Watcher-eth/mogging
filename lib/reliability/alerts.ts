import { randomUUID } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN}) : null

export function reliabilityAlertStatus() {
  return { configured: Boolean(process.env.RELIABILITY_ALERT_EMAIL && env.RESEND_API_KEY || process.env.RELIABILITY_DISCORD_WEBHOOK_URL), deduplication: Boolean(redis) }
}

export async function sendReliabilityAlert(feature: string, code: string, trace: string) {
  const email = process.env.RELIABILITY_ALERT_EMAIL
  const webhook = process.env.RELIABILITY_DISCORD_WEBHOOK_URL
  if (!email && !webhook) return 'unconfigured'
  // A shared cooldown prevents every failing request from notifying independently.
  // Without Redis, keep alerts visibly disabled rather than creating an email storm.
  if (!redis) return 'missing_deduplication'
  const key = `reliability:alert:${feature}:${code}`
  const lease = randomUUID()
  if (!await redis.set(key,lease,{nx:true,ex:900})) return 'suppressed'
  try {
    const message = `Mogging backend failure\nFeature: ${feature}\nCode: ${code}\nTrace: ${trace}\nTime: ${new Date().toISOString()}\nReview: https://mogging.com/admin/analytics/reliability\nSimilar failures are grouped for 15 minutes.`
    let response: Response
    if (webhook) {
      const url = new URL(webhook)
      if (url.protocol !== 'https:' || !['discord.com','discordapp.com'].includes(url.hostname) || !url.pathname.startsWith('/api/webhooks/')) throw new Error('Invalid Discord alert destination')
      response = await fetch(url,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify({content:message,allowed_mentions:{parse:[]}})})
    } else {
      if (!env.RESEND_API_KEY || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Alert email is not configured')
      response = await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`reliability-${trace}`},body:JSON.stringify({from:env.PAYMENTS_EMAIL_FROM,to:[email],subject:`Mogging: ${feature} · ${code}`,text:message})})
    }
    if (!response.ok) throw new Error(`Alert delivery failed (${response.status})`)
    return 'sent'
  } catch (error) {
    await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",[key],[lease]).catch(()=>{})
    throw error
  }
}
