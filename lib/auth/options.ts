import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { verifyPassword } from './password'

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const providers: NextAuthOptions['providers'] = [
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
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
    signIn: '/auth/login',
    error: '/auth/login',
  },
  secret: env.NEXTAUTH_SECRET,
}
