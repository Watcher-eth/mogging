import type { GetServerSideProps } from 'next'
import { createReferralTicket, referralCookie, REFERRAL_COOKIE, readReferralTicket } from '@/lib/referrals/service'

export const getServerSideProps: GetServerSideProps = async ({ params, req, res }) => {
  const code = typeof params?.referral === 'string' ? params.referral : ''
  const ticket = await createReferralTicket(code)
  if (!ticket) return { notFound: true }
  if (!readReferralTicket(req.cookies[REFERRAL_COOKIE])) res.setHeader('Set-Cookie', referralCookie(ticket))
  res.setHeader('Cache-Control', 'private, no-store')
  return { redirect: { destination: '/auth/register', permanent: false } }
}
export default function ReferralRedirect() { return null }
