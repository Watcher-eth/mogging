import NextAuth from 'next-auth'
import type { NextApiRequest, NextApiResponse } from 'next'
import { authOptions } from '@/lib/auth/options'
import { creditReferralSignup, REFERRAL_COOKIE } from '@/lib/referrals/service'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return NextAuth(req, res, {
    ...authOptions,
    events: {
      ...authOptions.events,
      async signIn({ user }) { await creditReferralSignup(user.id, req.cookies[REFERRAL_COOKIE]) },
    },
  })
}
