import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { db } from '@/lib/db'
import { courseApi, courseUser, pathOf, siteUrl } from '@/lib/courses/http'
import { courses } from '@/lib/courses/schema'
import { sellerForUser, saveSeller, onboarding, syncSeller } from '@/lib/courses/sellers'
import { oauthStart, oauthComplete } from '@/lib/courses/identity'
import { createCourse, saveCourse, ownedCourse, submitCourse, archiveCourse } from '@/lib/courses/catalog'
import { startUpload, resumeUpload, finishUpload, deleteAsset, assetsForCourse, assetThumbnail } from '@/lib/courses/media'
import { creatorDashboard, payoutBalance, courseStudents } from '@/lib/courses/reporting'
import { refundOrder } from '@/lib/courses/commerce'
import { versionSchema, refundSchema } from '@/lib/courses/validation'
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
export default courseApi(async (req, res) => {
  const path = pathOf(req), method = req.method, user = await courseUser(req, res)
  if (path[0] === 'seller' && path.length === 1) {
    if (method === 'GET') return json(res, 200, await sellerForUser(user.id))
    if (method === 'PUT') return json(res, 200, await saveSeller(user.id, req.body))
  }
  if (path[0] === 'connect') {
    await enforceRateLimit(req, res, { key: `course-connect:${user.id}`, limit: 10, windowMs: 60_000 })
    if (path.length === 1 && method === 'POST') return json(res, 200, await oauthStart(user.id))
    if (path.length === 2 && path[1] === 'onboarding' && method === 'POST') return json(res, 200, await onboarding(user.id, user.email))
    if (path.length === 2 && path[1] === 'status' && method === 'GET') return json(res, 200, await syncSeller(await sellerForUser(user.id)))
    if (path.length === 2 && path[1] === 'callback' && method === 'GET') { await oauthComplete(user.id, req.query); return res.redirect(303, `${siteUrl()}/creator/courses?connect=returned`) }
  }
  const seller = await sellerForUser(user.id)
  if (!path.length) {
    if (method === 'GET') return json(res, 200, await db.select().from(courses).where(eq(courses.sellerId, seller.id)).orderBy(desc(courses.updatedAt)).limit(30))
    if (method === 'POST') return json(res, 201, await createCourse(user.id, req.body))
  }
  if (path.length === 1 && path[0] === 'dashboard' && method === 'GET') return json(res, 200, await creatorDashboard(seller.id, req.query))
  if (path.length === 1 && path[0] === 'balance' && method === 'GET') return json(res, 200, await payoutBalance(seller.id))
  if (path[0] === 'orders' && path.length === 3 && path[2] === 'refund' && method === 'POST') {
    const { amount } = refundSchema.parse(req.body)
    return json(res, 200, await refundOrder(seller.id, z.uuid().parse(path[1]), req.headers['idempotency-key'], amount))
  }
  const id = z.uuid().parse(path[0])
  if (path.length === 1) {
    if (method === 'GET') return json(res, 200, (await ownedCourse(user.id, id)).course)
    if (method === 'PUT') return json(res, 200, await saveCourse(user.id, id, req.body))
  }
  if (path.length === 2 && method === 'POST') {
    if (path[1] === 'submit') return json(res, 200, await submitCourse(user.id, id, versionSchema.parse(req.body).version))
    if (path[1] === 'archive') return json(res, 200, await archiveCourse(user.id, id, versionSchema.parse(req.body).version))
    if (path[1] === 'uploads') return json(res, 201, await startUpload(user.id, id, req.body))
  }
  if (path.length === 2 && path[1] === 'students' && method === 'GET') return json(res, 200, await courseStudents(seller.id, id, req.query))
  if (path[1] === 'assets') {
    await ownedCourse(user.id, id)
    if (path.length === 2 && method === 'GET') return json(res, 200, await assetsForCourse(id))
    const assetId = z.uuid().parse(path[2])
    if (path.length === 4 && path[3] === 'thumbnail' && method === 'GET') return res.redirect(302, await assetThumbnail(user.id, id, assetId))
    if (path.length === 3 && method === 'DELETE') { await deleteAsset(user.id, id, assetId); return json(res, 200, { deleted: true }) }
    if (path.length === 4 && path[3] === 'complete' && method === 'POST') return json(res, 200, await finishUpload(user.id, id, assetId))
    if (path.length === 4 && path[3] === 'resume' && method === 'POST') return json(res, 200, await resumeUpload(user.id, id, assetId, req.body))
  }
  return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE'])
})
