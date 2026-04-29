import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

const globalForDb = globalThis as typeof globalThis & {
  postgresClient?: postgres.Sql
}

const client =
  globalForDb.postgresClient ??
  postgres(env.DATABASE_URL, {
    max: 10,
    prepare: false,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.postgresClient = client
}

export const db = drizzle(client, { schema })
export { schema }

