import { eq, isNotNull, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, methodNotAllowed, ApiError } from '@/lib/api/http'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { courseApi, pathOf } from '@/lib/courses/http'
import { courses, courseSellers, courseAudit } from '@/lib/courses/schema'
import { reviewCourse } from '@/lib/courses/catalog'
import { changeSellerStatus } from '@/lib/courses/sellers'
import { reviewSchema, sellerDecisionSchema } from '@/lib/courses/validation'
import { getLesson, assetAccess } from '@/lib/courses/access'
export default courseApi(async (req, res) => {
  const { session } = await requireCreatorAdmin(req, res), actorId = session.user.id, path = pathOf(req), method = req.method
  if (!path.length && method === 'GET') return json(res, 200, await db.select().from(courses).where(isNotNull(courses.submittedVersion)).orderBy(courses.updatedAt).limit(100))
  if (path[0] === 'sellers') {
    if (path.length === 1 && method === 'GET') {
      const page = z.coerce.number().int().min(1).max(1000).parse(req.query.page || 1)
      return json(res, 200, await db.select().from(courseSellers).orderBy(desc(courseSellers.createdAt), courseSellers.id).limit(50).offset((page - 1) * 50))
    }
    if (path.length === 2 && method === 'PATCH') return json(res, 200, await changeSellerStatus(z.uuid().parse(path[1]), sellerDecisionSchema.parse(req.body).status, actorId))
  }
  const id = z.uuid().parse(path[0])
  if (path.length === 1 && method === 'GET') {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, id) })
    if (!course) throw new ApiError(404, 'Course not found')
    return json(res, 200, course)
  }
  if (path.length === 2 && path[1] === 'review' && method === 'POST') {
    const input = reviewSchema.parse(req.body)
    return json(res, 200, await reviewCourse(id, input.version, input.decision, input.note, actorId))
  }
  if (path.length === 1 && method === 'PATCH') {
    const changes = z.object({ listed: z.boolean().optional(), salesEnabled: z.boolean().optional(), contentBlocked: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0).parse(req.body)
    const course = await db.transaction(async tx => {
      const [updated] = await tx.update(courses).set({ ...changes, updatedAt: new Date() }).where(eq(courses.id, id)).returning()
      if (!updated) throw new ApiError(404, 'Course not found')
      await tx.insert(courseAudit).values({ actorUserId: actorId, courseId: id, sellerId: updated.sellerId, action: 'course.moderation', detail: changes })
      return updated
    })
    return json(res, 200, course)
  }
  if (path[1] === 'lessons' && method === 'GET') {
    const lessonId = z.uuid().parse(path[2])
    if (path.length === 3) return json(res, 200, await getLesson(actorId, id, lessonId, true, true))
    if (path.length === 5 && path[3] === 'assets') return json(res, 200, await assetAccess(actorId, id, lessonId, z.uuid().parse(path[4]), true, true))
  }
  if (path.length === 2 && path[1] === 'audit' && method === 'GET') return json(res, 200, await db.select().from(courseAudit).where(eq(courseAudit.courseId, id)).orderBy(desc(courseAudit.createdAt)).limit(100))
  return methodNotAllowed(res, ['GET', 'POST', 'PATCH'])
})
