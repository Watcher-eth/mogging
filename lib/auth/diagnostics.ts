import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import type { NextAuthOptions } from 'next-auth'
import { authErrorOutcome } from '@/lib/reliability/outcome'
import { setBackendOutcome } from '@/lib/reliability/monitor'

// NextAuth v4 uses a global logger. A stable logger reads request-local context
// rather than closing over whichever request most recently configured NextAuth.
export const authDiagnosticContext = new AsyncLocalStorage<{ req: NextApiRequest; res: NextApiResponse }>()
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
function browserContext(req?: NextApiRequest) {
  const agent = typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : ''
  return {
    browser: /Edg(?:e|iOS|A)?\//.test(agent) ? 'edge' : /Firefox\/|FxiOS\//.test(agent) ? 'firefox'
      : /Chrome\/|CriOS\//.test(agent) ? 'chrome' : /Safari\//.test(agent) ? 'safari' : 'other',
    embeddedBrowser: /FBAN|FBAV|Instagram|TikTok|musical_ly|Bytedance|\bGSA\//i.test(agent),
  }
}
export const authLogger: NonNullable<NextAuthOptions['logger']> = {
  error(code, metadata) {
    const outcome = authErrorOutcome(metadata)
    const context = authDiagnosticContext.getStore()
    if (context) setBackendOutcome(context.res, outcome)
    const req = context?.req
    const state = typeof req?.query?.state === 'string' ? req.query.state : null
    const cookie = req?.headers?.cookie ?? ''
    console.error('auth:failure', { code: outcome.code, frameworkCode: code,
      ...browserContext(req),
      cookieHeaderPresent: Boolean(cookie),
      stateCookieInHeader: /(?:^|;\s*)(?:__Secure-)?next-auth\.state=/.test(cookie),
      pkceCookieInHeader: /(?:^|;\s*)(?:__Secure-)?next-auth\.pkce\.code_verifier=/.test(cookie),
      stateCookiePresent: Boolean(req?.cookies['__Secure-next-auth.state'] || req?.cookies['next-auth.state']),
      pkceCookiePresent: Boolean(req?.cookies['__Secure-next-auth.pkce.code_verifier'] || req?.cookies['next-auth.pkce.code_verifier']),
      flow: state ? fingerprint(state) : null, trace: context?.res.getHeader('X-Mogging-Trace') })
  },
  warn(code) { console.warn('auth:warning', { code }) },
  debug(code, metadata) {
    const value = (metadata as { value?: unknown } | undefined)?.value
    if (code !== 'CREATE_STATE' || typeof value !== 'string') return
    console.info('auth:state-created', { flow: fingerprint(value), maxAgeSeconds: 900,
      ...browserContext(authDiagnosticContext.getStore()?.req),
      trace: authDiagnosticContext.getStore()?.res.getHeader('X-Mogging-Trace') })
  },
}
