import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'
import { env } from '@/lib/env'

const COOKIE_NAME = 'mogging_invite_admin'
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000

type InviteAdminTokenPayload = {
  expiresAt: number
}

export function isInviteAdminConfigured() {
  return Boolean(getInviteAdminCode())
}

export function verifyInviteAdminCode(code: string) {
  const expectedCode = getInviteAdminCode()
  if (!expectedCode) return false
  const expected = createHash('sha256').update(expectedCode).digest()
  const received = createHash('sha256').update(code).digest()
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function requireInviteAdmin(req: NextApiRequest) {
  if (!isInviteAdminConfigured()) throw new ApiError(503, 'Invite admin access is not configured')
  if (!verifyInviteAdminToken(req.cookies[COOKIE_NAME])) throw new ApiError(401, 'Admin code required')
}

export function hasInviteAdminUnlock(req: NextApiRequest) {
  return verifyInviteAdminToken(req.cookies[COOKIE_NAME])
}

export function setInviteAdminUnlock(res: NextApiResponse) {
  const payload: InviteAdminTokenPayload = { expiresAt: Date.now() + ADMIN_SESSION_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${encoded}.${sign(encoded)}`
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_MS / 1000}${secure}`)
}

export function clearInviteAdminUnlock(res: NextApiResponse) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
}

function getInviteAdminCode() {
  return env.INVITE_ADMIN_CODE || env.CREATOR_ADMIN_PASSWORD || ''
}

function verifyInviteAdminToken(token: string | undefined) {
  if (!token) return false
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return false

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as InviteAdminTokenPayload
    return Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now()
  } catch {
    return false
  }
}

function sign(value: string) {
  const secret = env.NEXTAUTH_SECRET || getInviteAdminCode()
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
