import { sql } from 'drizzle-orm'
import { db } from '../../lib/db'

try {
  await db.execute(sql`select 1`)
  console.log('ok\tdatabase connection')
} catch (error) {
  console.error('failed\tdatabase connection')
  if (error instanceof Error) {
    console.error(error.message)
  }
  process.exit(1)
}
