// Exercise normal NextAuth credentials and cookies against the isolated development app.
export const courseTestOrigin = process.env.COURSE_TEST_ORIGIN || 'http://127.0.0.1:3003'
if (!['http://127.0.0.1:3003', 'https://mogging-courses-staging.vercel.app'].includes(courseTestOrigin)) {
  throw new Error('Course HTTP tests require the isolated local or hosted staging app')
}

export async function courseSession(email: string, password: string) {
  const cookies = new Map<string, string>()
  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '))
    if (!headers.has('Origin')) headers.set('Origin', courseTestOrigin)
    const response = await fetch(courseTestOrigin + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30000), headers })
    for (const cookie of response.headers.getSetCookie()) { const part = cookie.split(';')[0], at = part.indexOf('='); cookies.set(part.slice(0, at), part.slice(at + 1)) }
    return response
  }
  const csrf = await (await request('/api/auth/csrf')).json()
  const login = await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: 'true' }) })
  if (login.status >= 400 || !(cookies.has('next-auth.session-token') || cookies.has('__Secure-next-auth.session-token'))) throw new Error('Course test sign-in failed')
  const api = async <T = any>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const response = await request(path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!response.ok) throw new Error(`${response.status}: ${result.error?.message || 'Request failed'}`)
    return result.data
  }
  return { api, request }
}
