import { authDiagnosticContext, authLogger } from '@/lib/auth/diagnostics'
import { monitorBackend } from '@/lib/reliability/monitor'
import NextAuth from 'next-auth'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { NextApiRequest, NextApiResponse } from 'next'
import { authOptions } from '@/lib/auth/options'
import { creditReferralSignup, REFERRAL_COOKIE } from '@/lib/referrals/service'
import { googleMobileCallback } from '@/lib/auth/google-mobile'
import { handleApiError } from '@/lib/api/http'

function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET' && req.query.nextauth?.[0] === 'callback' && req.query.nextauth?.[1] === 'google'
    && typeof req.query.state === 'string' && req.query.state.startsWith('mob1.')) {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    try { return res.redirect(302, googleMobileCallback(req.query)!) }
    catch (error) { return handleApiError(error, res) }
  }
  return authDiagnosticContext.run({ req, res }, () => NextAuth(req, res, {
    ...authOptions,
    pages: { ...authOptions.pages, error: '/auth/error',
      signIn: ['OAuthCallback', 'OAuthSignin', 'Callback'].includes(String(req.query?.error)) ? '/auth/error' : authOptions.pages?.signIn },
    logger: authLogger,
    callbacks: {
      ...authOptions.callbacks,
      async signIn({ user, account }) {
        const callback = req.cookies['__Secure-next-auth.callback-url'] || req.cookies['next-auth.callback-url']
        let existingOnly = false
        try {
          const url = new URL(callback || '')
          existingOnly = url.pathname === '/app/mobile-auth' && url.searchParams.get('existingOnly') === '1'
        } catch {}
        if (existingOnly && account?.provider === 'google') {
          const existing = user.email ? await db.query.users.findFirst({ where: eq(schema.users.email, user.email.toLowerCase()), columns: { id: true } }) : null
          if (!existing) return '/app/mobile-auth?error=account_not_found'
        }
        return true
      },
    },
    events: {
      ...authOptions.events,
      async signIn({ user }) { await creditReferralSignup(user.id, req.cookies[REFERRAL_COOKIE]) },
    },
  }))
}

export default monitorBackend('auth/[...nextauth]',handler)
