import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/lib/db/schema'

// Temporary tables stay on one isolated local connection and disappear on close.
const testUrl = process.env.CREATOR_CHAT_TEST_DATABASE_URL
if (testUrl && !['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname)) throw new Error('Chat integration tests require a local database')
const sql = postgres(testUrl || 'postgres://watcher@127.0.0.1:55432/analytics_test', { max: 1 })
const db = drizzle(sql, { schema })
if (testUrl) mock.module('@/lib/db', () => ({ db, schema }))
const { getSubmissionMessages, markSubmissionMessagesRead, sendSubmissionMessage, submissionMessageSchema } = await import('@/lib/creator/submission-messages')
const creator = { userId: 'creator', role: 'creator' as const }
const team = { userId: 'admin', role: 'team' as const }

describe.skipIf(!testUrl)('submission chat PostgreSQL integration', () => {
beforeAll(async () => {
  await sql.unsafe(`CREATE TEMP TABLE creator_profiles (id text PRIMARY KEY, user_id text);
    CREATE TEMP TABLE creator_submissions (id text PRIMARY KEY, creator_profile_id text, status text, creator_messages_read_at timestamp, team_messages_read_at timestamp);
    CREATE TEMP TABLE creator_submission_messages (id text PRIMARY KEY, submission_id text REFERENCES creator_submissions(id) ON DELETE CASCADE, author_user_id text, author_role text, body text, created_at timestamp DEFAULT now());
    INSERT INTO creator_profiles VALUES ('profile', 'creator'), ('other-profile', 'other');
    INSERT INTO creator_submissions (id, creator_profile_id, status) VALUES ('submission', 'profile', 'in_review'), ('other-submission', 'other-profile', 'pending');`)
})
afterAll(async () => { await sql.end() })

test('message input accepts text and rejects blank/oversized messages and invalid IDs', () => {
  expect(submissionMessageSchema.parse({ id: crypto.randomUUID(), body: '  hello  ' }).body).toBe('hello')
  for (const body of ['', '  ', 'x'.repeat(2001)]) expect(submissionMessageSchema.safeParse({ id: crypto.randomUUID(), body }).success).toBe(false)
  expect(submissionMessageSchema.safeParse({ id: 'bad', body: 'Hello' }).success).toBe(false)
})

test('creators can only read and reply to their own submissions', async () => {
  await expect(getSubmissionMessages('other-submission', creator)).rejects.toMatchObject({ status: 404 })
  await expect(sendSubmissionMessage('other-submission', creator, { id: crypto.randomUUID(), body: 'Hello' })).rejects.toMatchObject({ status: 404 })
  expect((await getSubmissionMessages('other-submission', team)).submission.status).toBe('pending')
})

test('retries are idempotent and cannot reuse an ID for different content, author or thread', async () => {
  const input = { id: crypto.randomUUID(), body: 'Minimum views are 20k.' }
  await sendSubmissionMessage('submission', team, input)
  await sendSubmissionMessage('submission', team, input)
  expect((await getSubmissionMessages('submission', creator)).messages.filter(m => m.id === input.id)).toHaveLength(1)
  await expect(sendSubmissionMessage('submission', team, { ...input, body: 'Changed' })).rejects.toMatchObject({ status: 409 })
  await expect(sendSubmissionMessage('submission', creator, input)).rejects.toMatchObject({ status: 409 })
  await expect(sendSubmissionMessage('other-submission', team, input)).rejects.toMatchObject({ status: 409 })
  await sendSubmissionMessage('submission', creator, { id: crypto.randomUUID(), body: 'Thanks, I will update this.' })
  expect((await getSubmissionMessages('submission', creator)).messages.some(m => m.authorRole === 'creator')).toBe(true)
})

test('pagination preserves all messages including identical timestamps', async () => {
  for (let index = 0; index < 55; index++) await sendSubmissionMessage('submission', creator, { id: crypto.randomUUID(), body: `Message ${index}` })
  const latest = await getSubmissionMessages('submission', creator)
  expect(latest.messages).toHaveLength(50)
  expect(latest.nextCursor).toBeTruthy()
  const older = await getSubmissionMessages('submission', creator, latest.nextCursor!)
  const ids = [...latest.messages, ...older.messages].map(m => m.id)
  expect(ids.length).toBe(57)
  expect(new Set(ids).size).toBe(57)
  expect(older.nextCursor).toBeNull()
  await expect(getSubmissionMessages('submission', creator, 'invalid')).rejects.toMatchObject({ status: 400 })
})

test('unread counts exclude outgoing messages and read positions cannot move backwards', async () => {
  const thread = await getSubmissionMessages('submission', creator)
  expect(thread.submission.unreadMessages).toBe(1)
  const latest = thread.messages.at(-1)!
  await markSubmissionMessagesRead('submission', creator, latest.id)
  expect((await getSubmissionMessages('submission', creator)).submission.unreadMessages).toBe(0)
  await sendSubmissionMessage('submission', team, { id: crypto.randomUUID(), body: 'New feedback' })
  await markSubmissionMessagesRead('submission', creator, latest.id)
  expect((await getSubmissionMessages('submission', creator)).submission.unreadMessages).toBe(1)
  expect((await getSubmissionMessages('submission', team)).submission.unreadMessages).toBe(56)
  await expect(markSubmissionMessagesRead('other-submission', creator, latest.id)).rejects.toMatchObject({ status: 404 })
  await expect(markSubmissionMessagesRead('other-submission', team, latest.id)).rejects.toMatchObject({ status: 404 })
})

})

// Exercise the generated migration itself, including preservation of old review notes.
describe.skipIf(!testUrl)('submission chat migration', () => {
  test('backfills existing notes and enforces role/empty-message constraints', async () => {
    const namespace = `chat_test_${crypto.randomUUID().replaceAll('-', '')}`
    const connection = postgres(testUrl!, { max: 1 })
    try {
      await connection.unsafe(`CREATE SCHEMA ${namespace}; SET search_path TO ${namespace};
        CREATE TABLE users (id text PRIMARY KEY);
        CREATE TABLE creator_submissions (id text PRIMARY KEY, review_note text, updated_at timestamp);
        INSERT INTO creator_submissions VALUES ('video', 'Minimum views are 20k', '2026-10-04 12:00:00'), ('empty', ' ', now());`)
      const migration = await Bun.file('drizzle/0043_submission_chat.sql').text()
      await connection.unsafe(migration.replaceAll('"public".', `"${namespace}".`))
      const messages = await connection.unsafe('SELECT * FROM creator_submission_messages')
      expect(messages).toHaveLength(1)
      expect(messages[0].body).toBe('Minimum views are 20k')
      expect(messages[0].author_role).toBe('team')
      await expect((async () => await connection.unsafe("INSERT INTO creator_submission_messages (id,submission_id,author_role,body) VALUES ('bad','video','impersonator','Hi')"))()).rejects.toMatchObject({ code: '23514' })
      await expect((async () => await connection.unsafe("INSERT INTO creator_submission_messages (id,submission_id,author_role,body) VALUES ('blank','video','creator','  ')"))()).rejects.toMatchObject({ code: '23514' })
    } finally {
      await connection.unsafe(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`)
      await connection.end()
    }
  })
})
