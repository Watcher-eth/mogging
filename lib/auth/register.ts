import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { hashPassword } from './password'

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
})

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('A user with this email already exists')
  }
}

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email.toLowerCase()),
    columns: { id: true },
  })

  if (existing) {
    throw new EmailAlreadyExistsError()
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name || null,
      passwordHash: await hashPassword(input.password),
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })

  return user
}
