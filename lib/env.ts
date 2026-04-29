import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    IMAGE_STORAGE_DIR: z.string().min(1).optional(),
    IMAGE_PUBLIC_BASE_URL: z.string().min(1).optional(),
    MOONSHOT_API_KEY: z.string().min(1).optional(),
    MOONSHOT_BASE_URL: z.string().url().default('https://api.moonshot.ai/v1'),
    KIMI_ANALYSIS_MODEL: z.string().min(1).default('kimi-k2.5'),
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
  })

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  IMAGE_STORAGE_DIR: process.env.IMAGE_STORAGE_DIR,
  IMAGE_PUBLIC_BASE_URL: process.env.IMAGE_PUBLIC_BASE_URL,
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
  MOONSHOT_BASE_URL: process.env.MOONSHOT_BASE_URL,
  KIMI_ANALYSIS_MODEL: process.env.KIMI_ANALYSIS_MODEL,
})
