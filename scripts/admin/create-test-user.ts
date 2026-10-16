import { db, schema } from '../../lib/db'
import { eq } from 'drizzle-orm'
import { EmailAlreadyExistsError, registerUser } from '../../lib/auth/register'

const email = process.argv[2]
const password = process.argv[3]
const name = process.argv[4] || 'Test User'

if (!email || !password) {
  console.error('Usage: bun run user:create <email> <password> [name]')
  process.exit(1)
}

try {
  const user = await registerUser({ email, password, name })
  await db.update(schema.users).set({ analyticsInternal: true }).where(eq(schema.users.id, user.id))
  console.log(JSON.stringify({ user }, null, 2))
} catch (error) {
  if (error instanceof EmailAlreadyExistsError) {
    console.error(error.message)
    process.exit(1)
  }

  throw error
}
