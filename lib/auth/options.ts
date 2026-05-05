import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import FacebookProvider from 'next-auth/providers/facebook'
import GoogleProvider from 'next-auth/providers/google'
import TwitterProvider from 'next-auth/providers/twitter'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { verifyPassword } from './password'
import { TikTokProvider } from './tiktok-provider'

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const metaClientId = env.META_CLIENT_ID || env.FACEBOOK_CLIENT_ID
const metaClientSecret = env.META_CLIENT_SECRET || env.FACEBOOK_CLIENT_SECRET
const xClientId = env.X_CLIENT_ID || env.TWITTER_CLIENT_ID
const xClientSecret = env.X_CLIENT_SECRET || env.TWITTER_CLIENT_SECRET
const tiktokClientKey = env.TIKTOK_CLIENT_KEY
const tiktokClientSecret = env.TIKTOK_CLIENT_SECRET

const providers: NextAuthOptions['providers'] = [
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
  ...(metaClientId && metaClientSecret
    ? [
        FacebookProvider({
          clientId: metaClientId,
          clientSecret: metaClientSecret,
          authorization: {
            params: {
              scope: 'public_profile,email',
            },
          },
          profile(profile) {
            const id = String(profile.id)
            return {
              id,
              name: profile.name ?? null,
              email: profile.email ?? `${id}@facebook.local`,
              image: profile.picture?.data?.url ?? null,
            }
          },
        }),
      ]
    : []),
  ...(xClientId && xClientSecret
    ? [
        TwitterProvider({
          clientId: xClientId,
          clientSecret: xClientSecret,
          version: '2.0',
          profile(profile) {
            const data = ('data' in profile ? profile.data : profile) as {
              email?: string | null
              id: string
              name?: string | null
              profile_image_url?: string | null
              username?: string | null
            }
            const id = String(data.id)
            return {
              id,
              name: data.name ?? data.username ?? null,
              email: data.email ?? `${id}@x.local`,
              image: data.profile_image_url ?? null,
            }
          },
        }),
      ]
    : []),
  ...(tiktokClientKey && tiktokClientSecret
    ? [
        TikTokProvider({
          clientId: tiktokClientKey,
          clientSecret: tiktokClientSecret,
        }),
      ]
    : []),
  CredentialsProvider({
    id: 'credentials',
    name: 'Email and password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const parsed = credentialSchema.safeParse(credentials)
      if (!parsed.success) return null

      const user = await db.query.users.findFirst({
        where: eq(schema.users.email, parsed.data.email.toLowerCase()),
      })

      if (!user?.passwordHash) return null

      const isValid = await verifyPassword(parsed.data.password, user.passwordHash)
      if (!isValid) return null

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      }
    },
  }),
]

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  secret: env.NEXTAUTH_SECRET,
}
