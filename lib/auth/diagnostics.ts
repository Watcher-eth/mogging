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
export const authLogger: NonNullable<NextAuthOptions['logger']> = {
  error(code, metadata) {
    const outcome = authErrorOutcome(metadata)
    const context = authDiagnosticContext.getStore()
    if (context) setBackendOutcome(context.res, outcome)
    const req = context?.req
    const state = typeof req?.query?.state === 'string' ? req.query.state : null
    console.error('auth:failure', { code: outcome.code, frameworkCode: code,
      stateCookiePresent: Boolean(req?.cookies['__Secure-next-auth.state'] || req?.cookies['next-auth.state']),
      pkceCookiePresent: Boolean(req?.cookies['__Secure-next-auth.pkce.code_verifier'] || req?.cookies['next-auth.pkce.code_verifier']),
      flow: state ? fingerprint(state) : null, trace: context?.res.getHeader('X-Mogging-Trace') })
  },
  warn(code) { console.warn('auth:warning', { code }) },
  debug(code, metadata) {
    const value = (metadata as { value?: unknown } | undefined)?.value
    if (code !== 'CREATE_STATE' || typeof value !== 'string') return
    console.info('auth:state-created', { flow: fingerprint(value), maxAgeSeconds: 900,
      trace: authDiagnosticContext.getStore()?.res.getHeader('X-Mogging-Trace') })
  },
}
