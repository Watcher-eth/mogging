import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'

export const submissionReadSchema = z.object({ messageId: z.string().min(1).max(100) })
export const submissionMessageSchema = z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(2000) })
const cursorSchema = z.object({ date: z.string().datetime(), id: z.string().min(1).max(100) })
export type SubmissionMessageActor = { userId: string; role: 'creator' | 'team' }

// Admins share a team inbox; creators have their own read position.
export function submissionUnreadCount(role: SubmissionMessageActor['role']) {
  const table = schema.creatorSubmissionMessages
  const readAt = role === 'creator' ? schema.creatorSubmissions.creatorMessagesReadAt : schema.creatorSubmissions.teamMessagesReadAt
  return sql<number>`(select count(*)::integer from ${table} where ${table.submissionId} = ${schema.creatorSubmissions.id} and ${table.authorRole} = ${role === 'creator' ? 'team' : 'creator'} and ${table.createdAt} > coalesce(${readAt}, '-infinity'::timestamp))`
}

export async function markSubmissionMessagesRead(id: string, actor: SubmissionMessageActor, messageId: string) {
  await authorizedSubmission(id, actor)
  const messages = schema.creatorSubmissionMessages
  const [message] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, messageId), eq(messages.submissionId, id)))
  if (!message) throw new ApiError(404, 'Message not found')
  const readAt = actor.role === 'creator' ? schema.creatorSubmissions.creatorMessagesReadAt : schema.creatorSubmissions.teamMessagesReadAt
  const value = sql`greatest(${readAt}, (select ${messages.createdAt} from ${messages} where ${messages.id} = ${messageId} and ${messages.submissionId} = ${id}))`
  await db.update(schema.creatorSubmissions).set(actor.role === 'creator' ? { creatorMessagesReadAt: value } : { teamMessagesReadAt: value }).where(eq(schema.creatorSubmissions.id, id))
  return { read: true }
}

async function authorizedSubmission(id: string, actor: SubmissionMessageActor) {
  const [submission] = await db.select({ id: schema.creatorSubmissions.id, status: schema.creatorSubmissions.status, unreadMessages: submissionUnreadCount(actor.role) })
    .from(schema.creatorSubmissions).innerJoin(schema.creatorProfiles, eq(schema.creatorProfiles.id, schema.creatorSubmissions.creatorProfileId))
    .where(and(eq(schema.creatorSubmissions.id, id), actor.role === 'creator' ? eq(schema.creatorProfiles.userId, actor.userId) : undefined))
  if (!submission) throw new ApiError(404, 'Submission not found')
  return submission
}

export async function getSubmissionMessages(id: string, actor: SubmissionMessageActor, cursor?: string) {
  const submission = await authorizedSubmission(id, actor)
  let before: z.infer<typeof cursorSchema> | undefined
  if (cursor) {
    try { before = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())) }
    catch { throw new ApiError(400, 'Invalid message cursor') }
  }
  const table = schema.creatorSubmissionMessages
  const rows = await db.select({ id: table.id, authorRole: table.authorRole, body: table.body, createdAt: table.createdAt, cursorDate: sql<string>`to_char(${table.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'` }).from(table)
    .where(and(eq(table.submissionId, id), before ? or(lt(table.createdAt, sql`cast(${before.date} as timestamp)`), and(eq(table.createdAt, sql`cast(${before.date} as timestamp)`), lt(table.id, before.id))) : undefined))
    .orderBy(desc(table.createdAt), desc(table.id)).limit(51)
  const messages = rows.slice(0, 50).reverse()
  const oldest = messages[0]
  return { submission, messages: messages.map(({ cursorDate, ...message }) => message), nextCursor: rows.length > 50 && oldest ? Buffer.from(JSON.stringify({ date: oldest.cursorDate, id: oldest.id })).toString('base64url') : null }
}

export async function sendSubmissionMessage(id: string, actor: SubmissionMessageActor, input: z.infer<typeof submissionMessageSchema>) {
  await authorizedSubmission(id, actor)
  const table = schema.creatorSubmissionMessages
  const [inserted] = await db.insert(table).values({ ...input, submissionId: id, authorRole: actor.role, authorUserId: actor.userId }).onConflictDoNothing().returning()
  if (inserted) return { message: inserted }
  const existing = await db.query.creatorSubmissionMessages.findFirst({ where: eq(table.id, input.id) })
  if (!existing || existing.submissionId !== id || existing.authorUserId !== actor.userId || existing.authorRole !== actor.role || existing.body !== input.body) throw new ApiError(409, 'Message ID already used')
  return { message: existing }
}
