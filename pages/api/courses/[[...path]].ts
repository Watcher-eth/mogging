import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { json, ApiError, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getAuthSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { courseApi, courseUser, pathOf } from '@/lib/courses/http'
import { catalog, publicCourse } from '@/lib/courses/catalog'
import { library, getLesson, assetAccess, saveProgress, enrollment } from '@/lib/courses/access'
import { checkout, syncOrder } from '@/lib/courses/commerce'
import { sendVerification, verifyEmail, deliverableEmail } from '@/lib/courses/identity'
import { courseContacts, courseOrders, courses, courseProgress } from '@/lib/courses/schema'
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } }
export default courseApi(async (req, res) => {
  const path = pathOf(req), method = req.method
  if (!path.length && method === 'GET') return json(res, 200, await catalog(req.query))
  if (path[0] === 'lookup' && path.length === 3 && method === 'GET') return json(res, 200, await publicCourse(path[1], path[2]))
  if (path[0] === 'library' && path.length === 1 && method === 'GET') return json(res, 200, await library((await courseUser(req, res)).id))
  if (path[0] === 'email' && path.length === 1 && method === 'GET') {
    const user = await courseUser(req, res)
    const contact = await db.query.courseContacts.findFirst({ where: eq(courseContacts.userId, user.id) })
    return json(res, 200, { email: contact?.email || (deliverableEmail(user.email) ? user.email : null), verified: Boolean(contact?.verifiedAt || (user.emailVerified && deliverableEmail(user.email))), pendingEmail: contact?.pendingEmail || null })
  }
  if (path[0] === 'email' && path.length <= 2 && method === 'POST') {
    const user = await courseUser(req, res)
    await enforceRateLimit(req, res, { key: `course-email:${user.id}`, limit: path[1] === 'verify' ? 10 : 1, windowMs: 60_000 })
    if (path.length === 1) return json(res, 200, await sendVerification(user, req.body))
    if (path[1] === 'verify') return json(res, 200, await verifyEmail(user, req.body))
  }
  if (path[0] === 'orders' && path.length === 2 && method === 'GET') {
    const user = await courseUser(req, res), id = z.uuid().parse(path[1])
    const order = await db.query.courseOrders.findFirst({ where: and(eq(courseOrders.id, id), eq(courseOrders.buyerId, user.id)) })
    if (!order) throw new ApiError(404, 'Order not found')
    await enforceRateLimit(req, res, { key: `course-order-poll:${user.id}`, limit: 20, windowMs: 60_000 })
    return json(res, 200, await syncOrder(order.id))
  }
  const courseId = z.uuid().parse(path[0])
  if (path.length === 2 && path[1] === 'checkout' && method === 'POST') {
    const user = await courseUser(req, res)
    await enforceRateLimit(req, res, { key: `course-checkout:${user.id}`, limit: 10, windowMs: 60_000 })
    return json(res, 200, await checkout(user, courseId))
  }
  if (path.length === 1 && method === 'GET') {
    const user = await courseUser(req, res)
    if (!await enrollment(user.id, courseId)) throw new ApiError(403, 'Enrollment required')
    const [course] = await db.select({ id: courses.id, contentBlocked: courses.contentBlocked, catalog: courses.catalog }).from(courses).where(eq(courses.id, courseId)).limit(1)
    if (!course?.catalog || course.contentBlocked) throw new ApiError(404, 'Course unavailable')
    return json(res, 200, { id: course.id, content: course.catalog, progress: await db.select().from(courseProgress).where(and(eq(courseProgress.courseId, courseId), eq(courseProgress.userId, user.id))) })
  }
  if (path[1] === 'lessons' && path.length >= 3) {
    const lessonId = z.uuid().parse(path[2]), draft = req.query.draft === 'true'
    if (method === 'GET') {
      const session = await getAuthSession(req, res), userId = session?.user?.id || null
      if (path.length === 3) return json(res, 200, await getLesson(userId, courseId, lessonId, draft))
      if (path.length === 5 && path[3] === 'assets') return json(res, 200, await assetAccess(userId, courseId, lessonId, z.uuid().parse(path[4]), draft))
    }
    if (path.length === 4 && path[3] === 'progress' && method === 'PUT') return json(res, 200, await saveProgress((await courseUser(req, res)).id, courseId, lessonId, req.body))
  }
  return methodNotAllowed(res, ['GET', 'POST', 'PUT'])
})
