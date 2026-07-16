import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { env } from '@/lib/env'

export const CREATOR_TIKTOK_STATE_COOKIE = 'mogging_creator_tiktok_oauth'
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60

type OAuthStatePayload = {
  state: string
  userId: string
  expiresAt: number
}

export function createCreatorTikTokState(userId: string) {
  const state = randomBytes(32).toString('base64url')
  const payload: OAuthStatePayload = {
    state,
    userId,
    expiresAt: Date.now() + OAUTH_STATE_MAX_AGE_SECONDS * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { state, cookieValue: `${encoded}.${sign(encoded)}` }
}

export function readCreatorTikTokState(cookieValue: string | undefined, state: string, userId: string) {
  if (!cookieValue || !state) return null
  const [encoded, signature] = cookieValue.split('.')
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload
    return payload.state === state && payload.userId === userId && payload.expiresAt > Date.now()
      ? payload
      : null
  } catch {
    return null
  }
}

export function setCreatorTikTokStateCookie(res: NextApiResponse, value: string) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${CREATOR_TIKTOK_STATE_COOKIE}=${value}; Path=/api/creator/oauth/tiktok; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secure}`)
}

export function clearCreatorTikTokStateCookie(res: NextApiResponse) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${CREATOR_TIKTOK_STATE_COOKIE}=; Path=/api/creator/oauth/tiktok; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

export function getCreatorTikTokRedirectUri(req: NextApiRequest) {
  return new URL('/api/creator/oauth/tiktok/callback', getRequestOrigin(req)).toString()
}

export function getCreatorAccountsUrl(req: NextApiRequest, result?: string) {
  const url = new URL('/creator/accounts', getRequestOrigin(req))
  if (result) url.searchParams.set('tiktok', result)
  return url.toString()
}

function getRequestOrigin(req: NextApiRequest) {
  if (env.NODE_ENV === 'production') {
    const configured = env.NEXT_PUBLIC_SITE_URL || env.NEXTAUTH_URL
    if (!configured) throw new Error('A public site URL is required for TikTok OAuth')
    return configured
  }
  const forwardedProtocol = firstHeader(req.headers['x-forwarded-proto'])
  const forwardedHost = firstHeader(req.headers['x-forwarded-host'])
  const host = forwardedHost || req.headers.host
  if (!host) throw new Error('Request host is missing')
  return `${forwardedProtocol || 'http'}://${host}`
}

function firstHeader(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value?.split(',')[0]
  return first?.trim()
}

function sign(value: string) {
  const secret = env.NEXTAUTH_SECRET || env.TIKTOK_CLIENT_SECRET || ''
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
