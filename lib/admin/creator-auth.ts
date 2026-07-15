import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { ApiError } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'

const COOKIE_NAME = 'mogging_creator_admin'
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000

type AdminTokenPayload = {
  email: string
  expiresAt: number
}

export function isCreatorAdminConfigured() {
  return Boolean(getAdminEmails().size && env.CREATOR_ADMIN_PASSWORD)
}

export function isCreatorAdminEmail(email: string | null | undefined) {
  return Boolean(email && getAdminEmails().has(email.trim().toLowerCase()))
}

export function verifyCreatorAdminPassword(password: string) {
  if (!env.CREATOR_ADMIN_PASSWORD) return false
  const expected = createHash('sha256').update(env.CREATOR_ADMIN_PASSWORD).digest()
  const received = createHash('sha256').update(password).digest()
  return timingSafeEqual(expected, received)
}

export async function requireCreatorAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  options: { requireUnlock?: boolean } = {}
) {
  const session = await getAuthSession(req, res)
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email) throw new ApiError(401, 'Authentication required')
  if (!isCreatorAdminEmail(email)) throw new ApiError(403, 'Admin access required')
  if (!isCreatorAdminConfigured()) {
    throw new ApiError(503, 'Creator admin access is not configured')
  }

  if (options.requireUnlock !== false && !verifyAdminToken(req.cookies[COOKIE_NAME], email)) {
    throw new ApiError(401, 'Admin password required')
  }

  return { email, session: session as Session }
}

export function hasCreatorAdminUnlock(req: NextApiRequest, email: string) {
  return verifyAdminToken(req.cookies[COOKIE_NAME], email)
}

export function setCreatorAdminUnlock(res: NextApiResponse, email: string) {
  const payload: AdminTokenPayload = { email, expiresAt: Date.now() + ADMIN_SESSION_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${encoded}.${sign(encoded)}`
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_MS / 1000}${secure}`)
}

export function clearCreatorAdminUnlock(res: NextApiResponse) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
}

function getAdminEmails() {
  return new Set(
    (env.CREATOR_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )
}

function verifyAdminToken(token: string | undefined, email: string) {
  if (!token) return false
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return false

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminTokenPayload
    return payload.email === email && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now()
  } catch {
    return false
  }
}

function sign(value: string) {
  const secret = env.NEXTAUTH_SECRET || env.CREATOR_ADMIN_PASSWORD || ''
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
