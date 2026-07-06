import type { NextApiRequest, NextApiResponse } from 'next'

const COOKIE_NAME = 'mogging_anonymous_actor'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function getOrSetAnonymousActorId(req: NextApiRequest, res: NextApiResponse) {
  const existing = getAnonymousActorId(req)
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing

  const id = crypto.randomUUID()
  res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, id))
  return id
}

export function getAnonymousActorId(req: NextApiRequest) {
  const existing = readCookie(req.headers.cookie || '', COOKIE_NAME)
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing
  return null
}

export function clearAnonymousActorCookie(res: NextApiResponse) {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE_NAME, '', 0))
}

function readCookie(header: string, name: string) {
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

function serializeCookie(name: string, value: string, maxAge = MAX_AGE_SECONDS) {
  return [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}
