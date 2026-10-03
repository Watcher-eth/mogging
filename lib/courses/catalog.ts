import { and, or, eq, inArray, desc, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { getStripe } from '@/lib/payments/stripe'
import { courses, courseAssets, courseAudit, courseSellers, courseEnrollments } from './schema'
import { sellerForUser } from './sellers'
import { courseStripeOptions } from './stripe'
import { createCourseSchema, saveCourseSchema, assetIdsOf, lessonsOf, validatePublication, publicCourseContent, courseCategorySchema, type CourseContent } from './validation'

export async function ownedCourse(userId: string, id: string) {
  const seller = await sellerForUser(userId)
  const course = await db.query.courses.findFirst({ where: and(eq(courses.id, id), eq(courses.sellerId, seller.id)) })
  if (!course) throw new ApiError(404, 'Course not found')
  if (seller.status === 'suspended') throw new ApiError(403, 'Seller is suspended')
  return { course, seller }
}
export async function createCourse(userId: string, body: unknown) {
  const { slug, content } = createCourseSchema.parse(body), seller = await sellerForUser(userId)
  if (seller.status === 'suspended') throw new ApiError(403, 'Seller is suspended')
  return db.transaction(async tx => {
    await tx.select().from(courseSellers).where(eq(courseSellers.id, seller.id)).for('update')
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(courses).where(eq(courses.sellerId, seller.id))
    if (total >= 30) throw new ApiError(409, 'Seller course limit reached')
    const [course] = await tx.insert(courses).values({ sellerId: seller.id, slug, draft: content }).returning()
    return course
  })
}
export async function saveCourse(userId: string, id: string, body: unknown) {
  const { version, content } = saveCourseSchema.parse(body)
  const { course } = await ownedCourse(userId, id)
  return db.transaction(async tx => {
    await tx.select().from(courses).where(eq(courses.id, id)).for('update')
    await validateAssets(id, content, false, tx)
    const [updated] = await tx.update(courses).set({ draft: content, version: version + 1, submittedVersion: null, updatedAt: new Date() }).where(and(eq(courses.id, course.id), eq(courses.version, version))).returning()
    if (!updated) throw new ApiError(409, 'Course changed; reload before saving')
    return updated
  })
}
export async function validateAssets(id: string, content: CourseContent, ready: boolean, store: Pick<typeof db, 'select'> = db) {
  const ids = assetIdsOf(content)
  const assets = ids.length ? await store.select().from(courseAssets).where(and(eq(courseAssets.courseId, id), inArray(courseAssets.id, ids))) : []
  const lookup = new Map(assets.map(asset => [asset.id, asset]))
  for (const lesson of lessonsOf(content)) {
    for (const [assetId, kind] of [...lesson.resourceAssetIds.map(assetId => [assetId, 'resource'] as const), ...(lesson.videoAssetId ? [[lesson.videoAssetId, 'video'] as const] : [])]) {
      const asset = lookup.get(assetId)
      if (!asset || asset.kind !== kind || asset.state === 'deleted' || (ready && asset.state !== 'ready')) throw new ApiError(400, 'Course references a missing, mismatched, or unfinished asset')
    }
  }
}
export async function submitCourse(userId: string, id: string, version: number) {
  const { course } = await ownedCourse(userId, id)
  try { validatePublication(course.draft) } catch (error) { throw new ApiError(400, (error as Error).message) }
  await validateAssets(id, course.draft, true)
  const [updated] = await db.update(courses).set({ submittedVersion: version, reviewNote: null, updatedAt: new Date() }).where(and(eq(courses.id, id), eq(courses.version, version))).returning()
  if (!updated) throw new ApiError(409, 'Course changed; submit the latest version')
  return updated
}
export async function reviewCourse(id: string, version: number, decision: 'approve' | 'reject', note: string, actorUserId: string) {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, id) })
  if (!course || course.version !== version || course.submittedVersion !== version) throw new ApiError(409, 'Review requires the submitted current version')
  let stripeProductId = course.stripeProductId, stripePriceId: string | null = null
  if (decision === 'approve') {
    try { validatePublication(course.draft) } catch (error) { throw new ApiError(400, (error as Error).message) }
    await validateAssets(id, course.draft, true)
    const seller = await db.query.courseSellers.findFirst({ where: eq(courseSellers.id, course.sellerId) })
    if (!seller || seller.status !== 'enabled') throw new ApiError(409, 'Enable the seller before publishing')
    if (course.draft.price.amount > 0) {
      if (!seller.stripeAccountId || !seller.chargesEnabled) throw new ApiError(409, 'Seller Stripe onboarding is incomplete')
      const options = { ...courseStripeOptions, stripeAccount: seller.stripeAccountId }
      stripeProductId = (await getStripe().products.create({ name: course.draft.title, metadata: { moggingCourseId: id, version: String(version) } }, { ...options, idempotencyKey: `course-product-${id}-${version}` })).id
      const price = await getStripe().prices.create({ product: stripeProductId, currency: course.draft.price.currency, unit_amount: course.draft.price.amount }, { ...options, idempotencyKey: `course-price-${id}-${version}` })
      stripePriceId = price.id
    }
  }
  return db.transaction(async tx => {
    await tx.select().from(courses).where(eq(courses.id, id)).for('update')
    if (decision === 'approve') await validateAssets(id, course.draft, true, tx)
    const [updated] = await tx.update(courses).set({ ...(decision === 'approve' ? { published: course.draft, catalog: publicCourseContent(course.draft), publishedVersion: version, status: 'published' as const, publishedAt: new Date(), stripeProductId, stripePriceId } : {}), submittedVersion: null, reviewNote: note, updatedAt: new Date() }).where(and(eq(courses.id, id), eq(courses.version, version), eq(courses.submittedVersion, version))).returning()
    if (!updated) throw new ApiError(409, 'Course changed during review; review it again')
    await tx.insert(courseAudit).values({ actorUserId, courseId: id, sellerId: course.sellerId, action: `course.${decision}`, detail: { version, note } })
    return updated
  })
}
const browseSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(48).default(24), seller: z.string().max(60).optional(), category: courseCategorySchema.optional(), q: z.string().trim().max(100).optional() })
export async function catalog(query: unknown) {
  const input = browseSchema.parse(query)
  const conditions = [eq(courses.status, 'published'), eq(courses.contentBlocked, false), eq(courses.listed, true), eq(courses.salesEnabled, true), eq(courseSellers.status, 'enabled')]
  if (input.seller) conditions.push(eq(courseSellers.slug, input.seller))
  if (input.category) conditions.push(sql`${courses.catalog}->>'category' = ${input.category}`)
  if (input.q) conditions.push(sql`strpos(lower(concat_ws(' ', ${courses.catalog}->>'title', ${courses.catalog}->>'summary', ${courseSellers.slug}, ${courses.catalog}->>'category')), lower(${input.q})) > 0`)
  const rows = await db.select({ id: courses.id, slug: courses.slug, content: courses.catalog, seller: { slug: courseSellers.slug, bio: courseSellers.bio }, publishedAt: courses.publishedAt }).from(courses).innerJoin(courseSellers, eq(courses.sellerId, courseSellers.id)).where(and(...conditions)).orderBy(desc(courses.publishedAt), courses.id).limit(input.limit + 1).offset((input.page - 1) * input.limit)
  return { page: input.page, hasMore: rows.length > input.limit, items: rows.slice(0, input.limit).map(row => ({ ...row, content: row.content! })) }
}
export async function publicCourse(sellerSlug: string, slug: string) {
  return courseDetails(and(eq(courseSellers.slug, sellerSlug), eq(courses.slug, slug))!)
}
export async function courseOverview(id: string, userId?: string | null) {
  return courseDetails(eq(courses.id, id), userId)
}
async function courseDetails(identity: SQL, userId?: string | null) {
  const available = and(eq(courses.status, 'published'), eq(courses.salesEnabled, true), eq(courseSellers.status, 'enabled'))
  const enrolled = userId ? sql`exists (select 1 from ${courseEnrollments} where ${courseEnrollments.courseId} = ${courses.id} and ${courseEnrollments.userId} = ${userId} and ${courseEnrollments.revokedAt} is null and ${courseEnrollments.expiresAt} > now())` : undefined
  const [row] = await db.select({ id: courses.id, slug: courses.slug, content: courses.catalog, seller: { slug: courseSellers.slug, bio: courseSellers.bio, supportEmail: courseSellers.supportEmail } }).from(courses).innerJoin(courseSellers, eq(courses.sellerId, courseSellers.id)).where(and(identity, eq(courses.contentBlocked, false), or(available, enrolled))).limit(1)
  if (!row?.content) throw new ApiError(404, 'Course not found')
  return { ...row, content: row.content }
}
export async function archiveCourse(userId: string, id: string, version: number) {
  await ownedCourse(userId, id)
  const [course] = await db.update(courses).set({ status: 'archived', version: version + 1, submittedVersion: null, updatedAt: new Date() }).where(and(eq(courses.id, id), eq(courses.version, version))).returning()
  if (!course) throw new ApiError(409, 'Course changed; reload')
  return course
}
