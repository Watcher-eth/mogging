import { monitorBackend } from '@/lib/reliability/monitor'
import NextAuth from 'next-auth'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { NextApiRequest, NextApiResponse } from 'next'
import { authOptions } from '@/lib/auth/options'
import { creditReferralSignup, REFERRAL_COOKIE } from '@/lib/referrals/service'

function handler(req: NextApiRequest, res: NextApiResponse) {
  return NextAuth(req, res, {
    ...authOptions,
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
  })
}

export default monitorBackend('auth/[...nextauth]',handler)
