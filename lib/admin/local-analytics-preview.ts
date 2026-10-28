import type { IncomingHttpHeaders } from 'node:http'

export function isLocalAnalyticsPreview(mode: string | undefined, headers: IncomingHttpHeaders, remoteAddress: string | undefined) {
  if (mode !== 'development') return false
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '')) return false
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(headers.host ?? '')) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  return true
}
