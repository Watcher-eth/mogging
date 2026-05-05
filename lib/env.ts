import { z } from 'zod'

const booleanEnv = z
  .preprocess((value) => {
    if (value === undefined || value === '') return false
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
    return value
  }, z.boolean())
  .default(false)

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    AUTH_REQUIRED: booleanEnv,
    PAID_ANALYSIS_REQUIRED: booleanEnv,
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    META_CLIENT_ID: z.string().optional(),
    META_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_CLIENT_ID: z.string().optional(),
    FACEBOOK_CLIENT_SECRET: z.string().optional(),
    X_CLIENT_ID: z.string().optional(),
    X_CLIENT_SECRET: z.string().optional(),
    TWITTER_CLIENT_ID: z.string().optional(),
    TWITTER_CLIENT_SECRET: z.string().optional(),
    TIKTOK_CLIENT_KEY: z.string().optional(),
    TIKTOK_CLIENT_SECRET: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    IMAGE_STORAGE_DIR: z.string().min(1).optional(),
    IMAGE_PUBLIC_BASE_URL: z.string().min(1).optional(),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET_NAME: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
    MOONSHOT_API_KEY: z.string().min(1).optional(),
    MOONSHOT_BASE_URL: z.string().url().default('https://api.moonshot.ai/v1'),
    KIMI_ANALYSIS_MODEL: z.string().min(1).default('kimi-k2.5'),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_ANALYSIS_PRICE_CENTS: z.coerce.number().int().min(50).default(499),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.NEXTAUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['NEXTAUTH_SECRET'],
        message: 'NEXTAUTH_SECRET is required in production',
      })
    }

    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_ID'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.META_CLIENT_ID) !== Boolean(env.META_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['META_CLIENT_ID'],
        message: 'META_CLIENT_ID and META_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.FACEBOOK_CLIENT_ID) !== Boolean(env.FACEBOOK_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['FACEBOOK_CLIENT_ID'],
        message: 'FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.X_CLIENT_ID) !== Boolean(env.X_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['X_CLIENT_ID'],
        message: 'X_CLIENT_ID and X_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.TWITTER_CLIENT_ID) !== Boolean(env.TWITTER_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TWITTER_CLIENT_ID'],
        message: 'TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.TIKTOK_CLIENT_KEY) !== Boolean(env.TIKTOK_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TIKTOK_CLIENT_KEY'],
        message: 'TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be configured together',
      })
    }

    if (Boolean(env.UPSTASH_REDIS_REST_URL) !== Boolean(env.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['UPSTASH_REDIS_REST_URL'],
        message: 'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together',
      })
    }

    const r2Values = [
      env.R2_ACCOUNT_ID,
      env.R2_BUCKET_NAME,
      env.R2_ACCESS_KEY_ID,
      env.R2_SECRET_ACCESS_KEY,
      env.R2_PUBLIC_BASE_URL,
    ]
    const hasAnyR2 = r2Values.some(Boolean)
    const hasAllR2 = r2Values.every(Boolean)

    if (hasAnyR2 && !hasAllR2) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_ACCOUNT_ID'],
        message: 'All R2 environment variables must be configured together',
      })
    }
  })

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_REQUIRED: process.env.AUTH_REQUIRED,
  PAID_ANALYSIS_REQUIRED: process.env.PAID_ANALYSIS_REQUIRED,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  META_CLIENT_ID: process.env.META_CLIENT_ID,
  META_CLIENT_SECRET: process.env.META_CLIENT_SECRET,
  FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
  X_CLIENT_ID: process.env.X_CLIENT_ID,
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
  TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR,
  IMAGE_PUBLIC_BASE_URL: process.env.IMAGE_PUBLIC_BASE_URL,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
  MOONSHOT_BASE_URL: process.env.MOONSHOT_BASE_URL,
  KIMI_ANALYSIS_MODEL: process.env.KIMI_ANALYSIS_MODEL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_ANALYSIS_PRICE_CENTS: process.env.STRIPE_ANALYSIS_PRICE_CENTS,
})

export type RuntimeReadinessCheck = {
  key: string
  ok: boolean
  required: boolean
  message?: string
}

export function getRuntimeReadiness() {
  const checks: RuntimeReadinessCheck[] = [
    {
      key: 'DATABASE_URL',
      ok: Boolean(env.DATABASE_URL),
      required: true,
    },
    {
      key: 'NEXTAUTH_SECRET',
      ok: Boolean(env.NEXTAUTH_SECRET),
      required: env.NODE_ENV === 'production',
      message: env.NODE_ENV === 'production' ? 'Required in production' : 'Recommended outside local development',
    },
    {
      key: 'NEXTAUTH_URL',
      ok: Boolean(env.NEXTAUTH_URL),
      required: env.NODE_ENV === 'production',
      message: env.NODE_ENV === 'production' ? 'Required for production auth callbacks' : 'Recommended for auth callback consistency',
    },
    {
      key: 'GOOGLE_OAUTH',
      ok: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      required: false,
      message: 'Required only when Google login is enabled',
    },
    {
      key: 'META_OAUTH',
      ok: Boolean(
        (env.META_CLIENT_ID && env.META_CLIENT_SECRET) ||
          (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET)
      ),
      required: false,
      message: 'Required only when Meta login is enabled',
    },
    {
      key: 'X_OAUTH',
      ok: Boolean(
        (env.X_CLIENT_ID && env.X_CLIENT_SECRET) ||
          (env.TWITTER_CLIENT_ID && env.TWITTER_CLIENT_SECRET)
      ),
      required: false,
      message: 'Required only when X login is enabled',
    },
    {
      key: 'TIKTOK_OAUTH',
      ok: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
      required: false,
      message: 'Required only when TikTok login is enabled',
    },
    {
      key: 'MOONSHOT_API_KEY',
      ok: Boolean(env.MOONSHOT_API_KEY),
      required: true,
      message: 'Required for production image analysis',
    },
    {
      key: 'KIMI_ANALYSIS_MODEL',
      ok: Boolean(env.KIMI_ANALYSIS_MODEL),
      required: true,
    },
    {
      key: 'IMAGE_STORAGE',
      ok: Boolean(isR2Configured() || env.IMAGE_STORAGE_DIR || env.IMAGE_PUBLIC_BASE_URL),
      required: env.NODE_ENV === 'production',
      message: env.NODE_ENV === 'production'
        ? 'Configure R2 for production image storage'
        : 'Defaults to local public/uploads in development',
    },
    {
      key: 'UPSTASH_REDIS',
      ok: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
      required: env.NODE_ENV === 'production',
      message: env.NODE_ENV === 'production'
        ? 'Required for durable production rate limiting'
        : 'Falls back to in-memory rate limiting locally',
    },
    {
      key: 'STRIPE_SECRET_KEY',
      ok: Boolean(env.STRIPE_SECRET_KEY),
      required: env.PAID_ANALYSIS_REQUIRED,
      message: env.PAID_ANALYSIS_REQUIRED
        ? 'Required when paid analysis is enabled'
        : 'Required only when paid analysis is enabled',
    },
  ]

  return {
    ok: checks.every((check) => check.ok || !check.required),
    checks,
  }
}

export function isR2Configured() {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_BUCKET_NAME &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_PUBLIC_BASE_URL
  )
}
