import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from '@/lib/api/http'
import { webStarterIntro } from './web-analysis-plans'

export const starterIntroCookie = (flowId: string) => `mogging_starter_intro_${flowId}`

function signature(flowId: string, deadline: number, secret: string) {
  return createHmac('sha256', secret).update(`mogging:starter-intro:${flowId}:${deadline}`).digest('base64url')
}

export function issueStarterIntro(flowId: string, secret: string, now = Date.now()) {
  const deadline = now + webStarterIntro.durationMs
  return { deadline, value: `${deadline}.${signature(flowId, deadline, secret)}` }
}

export function readStarterIntro(flowId: string, value: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!secret || !value) return null
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match) return null
  const deadline = Number(match[1])
  if (deadline > now + webStarterIntro.durationMs) return null
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(flowId, deadline, secret))) ? deadline : null
}

export function requireActiveStarterIntro(deadline: number | null, now = Date.now()) {
  if (deadline === null || deadline <= now) throw new ApiError(409, 'This first-month offer has expired.')
  return deadline
}
