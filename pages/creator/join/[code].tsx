import type { GetServerSideProps } from 'next'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { CREATOR_INVITER_COOKIE, CREATOR_INVITE_MAX_AGE, readCreatorInviter, signCreatorInviter, validCreatorReferralCode } from '@/lib/creator/creator-referral-cookie'

export default function CreatorReferralRedirect() { return null }

export const getServerSideProps: GetServerSideProps = async ({ params, req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const code = typeof params?.code === 'string' ? params.code : ''
  if (!validCreatorReferralCode(code)) return { notFound: true }
  const link = await db.query.creatorReferralLinks.findFirst({ where: eq(schema.creatorReferralLinks.code, code) })
  const inviter = link && await db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, link.creatorProfileId) })
  if (!inviter || inviter.authStatus === 'suspended') return { notFound: true }
  if (!readCreatorInviter(req.cookies[CREATOR_INVITER_COOKIE])) {
    res.setHeader('Set-Cookie', CREATOR_INVITER_COOKIE + '=' + signCreatorInviter(code) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + CREATOR_INVITE_MAX_AGE + (process.env.NODE_ENV === 'production' ? '; Secure' : ''))
  }
  return { redirect: { destination: '/creator', permanent: false } }
}
