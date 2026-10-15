// Disposable localhost database and temporary image files only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, access, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import postgres from 'postgres'

const address = process.env.DELETION_TEST_DATABASE_URL
if (!address || !['127.0.0.1', 'localhost'].includes(new URL(address).hostname)) {
  throw new Error('Set DELETION_TEST_DATABASE_URL to a disposable localhost PostgreSQL database')
}
const namespace = `deletion_test_${randomUUID().replaceAll('-', '')}`
const admin = postgres(address, { max: 1 })
const scoped = new URL(address)
scoped.searchParams.set('options', `-c search_path=${namespace}`)
process.env.DATABASE_URL = scoped.toString()
for (const key of Object.keys(process.env)) if (key.startsWith('R2_') || key === 'COURSE_R2_BUCKET_NAME') delete process.env[key]
const imageRoot = await mkdtemp(path.join(os.tmpdir(), 'mogging-deletion-test-'))
process.env.IMAGE_STORAGE_DIR = imageRoot
process.env.IMAGE_PUBLIC_BASE_URL = '/deletion-test-images'
const image = (letter: string) => `${letter.repeat(64)}.png`
const url = (key: string) => `/deletion-test-images/${key}`
const exists = (key: string) => access(path.join(imageRoot, key)).then(() => true, () => false)

try {
  await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
  const sql = postgres(scoped.toString(), { max: 1 })
  try {
    await sql.unsafe(`
      CREATE TABLE users (id text PRIMARY KEY, image text);
      CREATE TABLE photos (id text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, anonymous_actor_id text, image_url text, image_storage_key text);
      CREATE TABLE creator_onboarding_invites (id text PRIMARY KEY, claimed_by_user_id text REFERENCES users(id), revoked_at timestamp);
      CREATE TABLE analyses (id text PRIMARY KEY, photo_id text REFERENCES photos(id) ON DELETE CASCADE);
      CREATE TABLE analysis_shares (analysis_id text REFERENCES analyses(id) ON DELETE CASCADE);
      CREATE TABLE comparisons (anonymous_actor_id text, winner_photo_id text, loser_photo_id text);
      CREATE TABLE payment_entitlements (anonymous_actor_id text);
      CREATE TABLE photo_sets (anonymous_actor_id text);
      CREATE TABLE person_groups (anonymous_actor_id text);
      CREATE TABLE anonymous_profiles (anonymous_actor_id text PRIMARY KEY);
    `)
    const { deleteUserProfile, deleteAnonymousProfile } = await import('../../lib/users/service')
    const own = image('a'), shared = image('b'), avatar = image('c'), anonymous = image('d')
    for (const key of [own, shared, avatar, anonymous]) await writeFile(path.join(imageRoot, key), 'disposable image fixture')
    await sql`INSERT INTO users (id, image) VALUES ('owner', ${url(avatar)}), ('other', ${url(shared)})`
    await sql`INSERT INTO creator_onboarding_invites (id, claimed_by_user_id) VALUES ('invite', 'owner')`
    await sql`INSERT INTO photos VALUES ('own', 'owner', NULL, ${url(own)}, ${own}), ('shared', 'owner', NULL, ${url(shared)}, ${shared})`
    await deleteUserProfile('owner')
    assert.equal((await sql`SELECT id FROM users WHERE id='owner'`).length, 0)
    assert.equal((await sql`SELECT id FROM photos WHERE user_id='owner'`).length, 0)
    assert.equal((await sql`SELECT claimed_by_user_id FROM creator_onboarding_invites`)[0].claimed_by_user_id, null)
    assert.notEqual((await sql`SELECT revoked_at FROM creator_onboarding_invites`)[0].revoked_at, null, 'A deleted account must not make its creator invite reusable')
    assert.equal(await exists(own), false)
    assert.equal(await exists(avatar), false)
    assert.equal(await exists(shared), true, 'Another profile still uses this content-addressed image')
    await deleteUserProfile('other')
    assert.equal(await exists(shared), false, 'The final reference removes the object')

    await sql`INSERT INTO users (id) VALUES ('retry-owner')`
    await sql`INSERT INTO creator_onboarding_invites (id, claimed_by_user_id) VALUES ('retry-invite', 'retry-owner')`
    await sql`INSERT INTO photos VALUES ('unsafe', 'retry-owner', NULL, '/unmanaged', '../outside')`
    await assert.rejects(deleteUserProfile('retry-owner'), /Invalid image storage key/)
    assert.equal((await sql`SELECT id FROM users WHERE id='retry-owner'`).length, 1)
    assert.equal((await sql`SELECT id FROM photos WHERE id='unsafe'`).length, 1)
    assert.equal((await sql`SELECT claimed_by_user_id FROM creator_onboarding_invites WHERE id='retry-invite'`)[0].claimed_by_user_id, 'retry-owner')

    const blocked = image('e')
    await mkdir(path.join(imageRoot, blocked))
    await sql`INSERT INTO users (id) VALUES ('io-owner')`
    await sql`INSERT INTO photos VALUES ('blocked', 'io-owner', NULL, ${url(blocked)}, ${blocked})`
    await assert.rejects(deleteUserProfile('io-owner'), /EISDIR|EFAULT|directory/)
    assert.equal((await sql`SELECT id FROM users WHERE id='io-owner'`).length, 1, 'Storage IO failure preserves the account for retry')
    assert.equal((await sql`SELECT id FROM photos WHERE id='blocked'`).length, 1)

    await sql`INSERT INTO anonymous_profiles VALUES ('anonymous')`
    await sql`INSERT INTO photos VALUES ('anonymous-photo', NULL, 'anonymous', ${url(anonymous)}, ${anonymous})`
    await sql`INSERT INTO analyses VALUES ('anonymous-report', 'anonymous-photo')`
    await sql`INSERT INTO analysis_shares VALUES ('anonymous-report')`
    await deleteAnonymousProfile('anonymous')
    assert.equal((await sql`SELECT id FROM photos WHERE id='anonymous-photo'`).length, 0)
    assert.equal((await sql`SELECT analysis_id FROM analysis_shares`).length, 0)
    assert.equal((await sql`SELECT anonymous_actor_id FROM anonymous_profiles`).length, 0)
    assert.equal(await exists(anonymous), false)
    console.log('PASS: account and anonymous deletion remove images, preserve shared references, clear creator-invite ownership, and roll back on storage failure.')
  } finally {
    await sql.end()
  }
} finally {
  await (globalThis as { postgresClient?: postgres.Sql }).postgresClient?.end({ timeout: 2 })
  await admin.unsafe(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`)
  await admin.end()
  await rm(imageRoot, { recursive: true, force: true })
}
