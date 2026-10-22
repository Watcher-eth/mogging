// Local-only PostgreSQL coverage for account ownership, concurrent signup and session persistence.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '../../lib/db/schema'

const address = process.env.GOOGLE_TEST_DATABASE_URL
if (!address || !['127.0.0.1', 'localhost'].includes(new URL(address).hostname)) throw new Error('Set GOOGLE_TEST_DATABASE_URL to disposable local PostgreSQL')
const admin = postgres(address, { max: 1, onnotice() {} })
const namespace = `google_test_${randomUUID().replaceAll('-', '')}`
await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
const scoped = new URL(address)
scoped.searchParams.set('options', `-c search_path=${namespace} -c timezone=UTC`)
process.env.DATABASE_URL = scoped.toString()
const client = postgres(scoped.toString(), { max: 1 })
try {
  for (const table of [schema.users, schema.accounts, schema.sessions, schema.mobileGuests]) {
    const config = getTableConfig(table)
    // Use the real column inventory. Enum values are irrelevant to these identity fixtures.
    const columns = config.columns.map(column => `"${column.name}" ${column.getSQLType() === 'gender' ? 'text' : column.getSQLType()}`)
    await client.unsafe(`CREATE TABLE "${config.name}" (${columns.join(',')})`)
  }
  await client.unsafe(`ALTER TABLE users ADD PRIMARY KEY(id); CREATE UNIQUE INDEX ON users(email);
    ALTER TABLE accounts ADD PRIMARY KEY(provider,provider_account_id);
    ALTER TABLE sessions ADD PRIMARY KEY(session_token)`)
  const { googleMobileUser } = await import('../../lib/auth/google-mobile')
  const { createMobileSessionForUser, getRequestUserId } = await import('../../lib/auth/mobile-session')
  const identity = { subject: 'google-subject', email: 'buyer@example.test', name: 'Buyer' }
  await assert.rejects(googleMobileUser(identity, true), /No existing Mogging account/)
  const ids = await Promise.all(Array.from({ length: 8 }, () => googleMobileUser(identity, false)))
  assert.equal(new Set(ids).size, 1, 'concurrent verified signup has one account owner')
  assert.equal(Number((await client`SELECT count(*) FROM users`)[0].count), 1)
  assert.equal(Number((await client`SELECT count(*) FROM accounts`)[0].count), 1)
  assert.equal(await googleMobileUser(identity, true), ids[0])
  const session = await createMobileSessionForUser(ids[0])
  assert.equal(await getRequestUserId({ headers: { authorization: `Bearer ${session.sessionToken}` } } as any, {} as any), ids[0])
  await client`UPDATE sessions SET expires = now() - interval '1 second'`
  assert.equal(await getRequestUserId({ headers: { authorization: `Bearer ${session.sessionToken}` } } as any, {} as any), null)
  await client`INSERT INTO users(id,email) VALUES ('password-buyer','password@example.test')`
  await assert.rejects(googleMobileUser({ ...identity, subject: 'different-google-subject', email: 'password@example.test' }, false), /another sign-in method/)
  assert.equal(Number((await client`SELECT count(*) FROM accounts`)[0].count), 1, 'Google never silently links an existing other identity')
  console.log('PASS: real PostgreSQL concurrent Google signup, returning-account gate, account ownership, persisted bearer session and expiry')
} finally {
  await (globalThis as typeof globalThis & { postgresClient?: postgres.Sql }).postgresClient?.end()
  await client.end()
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
