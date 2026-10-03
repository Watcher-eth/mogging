import { createHmac } from 'node:crypto'

// Bunny's HS256 format signs the path, expiry, and sorted decoded query parameters.
export function signCdnUrl(value: string, key: string, expires: number) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.b-cdn.net')) throw new Error('Unexpected video CDN host')
  url.searchParams.delete('token'); url.searchParams.delete('expires')
  url.searchParams.sort()
  const parameters = [...url.searchParams].map(([name, value]) => `${name}=${value}`).join('&')
  const token = createHmac('sha256', key).update(`${decodeURIComponent(url.pathname)}${expires}${parameters}`).digest('base64url')
  url.searchParams.set('token', `HS256-${token}`)
  url.searchParams.set('expires', String(expires))
  return url.toString()
}
