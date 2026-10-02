import { and, eq, desc, sql, gte, lt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@/lib/db/schema'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { getStripe } from '@/lib/payments/stripe'
import { courseOrders, courseEnrollments, courses, courseSellers } from './schema'

const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), courseId: z.uuid().optional() })
export async function creatorDashboard(sellerId: string, query: unknown) {
  const input = pageSchema.parse(query), conditions = [eq(courseOrders.sellerId, sellerId)]
  if (input.from) conditions.push(gte(courseOrders.createdAt, new Date(input.from)))
  if (input.to) conditions.push(lt(courseOrders.createdAt, new Date(input.to)))
  if (input.courseId) conditions.push(eq(courseOrders.courseId, input.courseId))
  const [totals, orders, studentCount] = await Promise.all([
    db.select({ currency: courseOrders.currency, orders: sql<number>`count(*) filter (where ${courseOrders.paidAt} is not null)::int`, courseSales: sql<string>`coalesce(sum(${courseOrders.amount}) filter (where ${courseOrders.paidAt} is not null),0)::text`, collected: sql<string>`coalesce(sum(${courseOrders.totalAmount}) filter (where ${courseOrders.paidAt} is not null),0)::text`, refunds: sql<string>`coalesce(sum(${courseOrders.refundedAmount}),0)::text`, disputes: sql<number>`count(*) filter (where ${courseOrders.disputed})::int` }).from(courseOrders).where(and(...conditions)).groupBy(courseOrders.currency),
    db.select().from(courseOrders).where(and(...conditions)).orderBy(desc(courseOrders.createdAt), courseOrders.id).limit(input.limit + 1).offset((input.page - 1) * input.limit),
    db.select({ active: sql<number>`count(*)::int` }).from(courseEnrollments).innerJoin(courses, eq(courseEnrollments.courseId, courses.id)).where(and(eq(courses.sellerId, sellerId), isNull(courseEnrollments.revokedAt), gte(courseEnrollments.expiresAt, new Date()))),
  ])
  const fees = await db.select({ currency: courseOrders.feeCurrency, amount: sql<string>`sum(${courseOrders.processingFee})::text` }).from(courseOrders).where(and(...conditions)).groupBy(courseOrders.feeCurrency)
  return { totals, fees, activeStudents: studentCount[0].active, page: input.page, hasMore: orders.length > input.limit, orders: orders.slice(0, input.limit) }
}
export async function payoutBalance(sellerId: string) {
  const seller = await db.query.courseSellers.findFirst({ where: eq(courseSellers.id, sellerId) })
  if (!seller?.stripeAccountId) throw new ApiError(409, 'Connect Stripe first')
  const balance = await getStripe().balance.retrieve({}, { stripeAccount: seller.stripeAccountId })
  return { available: balance.available.map(({ amount, currency }) => ({ amount, currency })), pending: balance.pending.map(({ amount, currency }) => ({ amount, currency })), scope: 'entire_stripe_account', dashboardUrl: 'https://dashboard.stripe.com' }
}
export async function courseStudents(sellerId: string, courseId: string, query: unknown) {
  const input = pageSchema.parse(query)
  const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.sellerId, sellerId)) })
  if (!course) throw new ApiError(404, 'Course not found')
  const rows = await db.select({ id: courseEnrollments.id, userId: courseEnrollments.userId, name: users.name, image: users.image, source: courseEnrollments.source, expiresAt: courseEnrollments.expiresAt, revokedAt: courseEnrollments.revokedAt, createdAt: courseEnrollments.createdAt }).from(courseEnrollments).innerJoin(users, eq(courseEnrollments.userId, users.id)).where(eq(courseEnrollments.courseId, courseId)).orderBy(desc(courseEnrollments.createdAt), courseEnrollments.id).limit(input.limit + 1).offset((input.page - 1) * input.limit)
  return { page: input.page, hasMore: rows.length > input.limit, students: rows.slice(0, input.limit) }
}
