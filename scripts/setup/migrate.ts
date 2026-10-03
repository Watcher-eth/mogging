import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { env } from '../../lib/env'

// Track each Drizzle migration independently so a scoped run cannot skip older work.
const folder = resolve(import.meta.dir, '../../drizzle')
const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[]
}
const args = process.argv.slice(2)
const only = args[0] === '--only' && args.length === 2 ? args[1] : undefined
if (args.length && (!only || !journal.entries.some(entry => entry.tag === only))) {
  throw new Error('Usage: bun run db:migrate [--only <migration tag>]')
}
const migrations = readMigrationFiles({ migrationsFolder: folder })
const client = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 10 })
try {
  const applied = await client.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended('mogging-schema-migrations', 0))`
    await tx`create schema if not exists drizzle`
    await tx`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
    const records = await tx<{ hash: string; created_at: string }[]>`select hash, created_at from drizzle.__drizzle_migrations`
    const completed = new Set(records.map(record => record.hash))
    const timestamps = new Set(records.map(record => Number(record.created_at)))
    const applied: string[] = []
    for (const [index, migration] of migrations.entries()) {
      const tag = journal.entries[index].tag
      if (only && tag !== only) continue
      if (completed.has(migration.hash)) continue
      if (timestamps.has(migration.folderMillis)) {
        throw new Error(`Recorded migration differs from its SQL file: ${tag}`)
      }
      for (const statement of migration.sql) {
        if (statement.trim()) await tx.unsafe(statement)
      }
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`
      applied.push(tag)
    }
    return applied
  })
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations in scope')
} catch (error) {
  // PostgreSQL errors can include connection details; report only the safe code.
  console.error('Migration transaction rolled back:', error instanceof Error && !('code' in error) ? error.message : (error as { code?: string }).code || 'database error')
  process.exitCode = 1
} finally {
  await client.end()
}
