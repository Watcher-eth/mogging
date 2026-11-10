import type { IncomingMessage } from 'node:http'

export type RequestLocation = {
  country: string | null
  state: string | null
}

export function getRequestLocation(req: Pick<IncomingMessage, 'headers'>): RequestLocation {
  const country = normalizeCode(firstHeader(req, [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-country-code',
  ]))
  const region = normalizeCode(firstHeader(req, [
    'x-vercel-ip-country-region',
    'x-vercel-ip-region',
    'x-region-code',
  ]))

  return {
    country,
    state: country === 'US' ? region : null,
  }
}

function firstHeader(req: Pick<IncomingMessage, 'headers'>, names: string[]) {
  for (const name of names) {
    const value = req.headers[name]
    const firstValue = Array.isArray(value) ? value[0] : value
    if (firstValue) return firstValue
  }

  return null
}

function normalizeCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null
}
