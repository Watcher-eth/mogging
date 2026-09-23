import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../../lib/db'
import reviewData from './data/celebrity-psl-reviews.json'

const reviews = z.array(z.object({
  photoId: z.string().min(1), name: z.string().min(1), imageUrl: z.string().min(1),
  pslScore: z.number().min(1).max(8), confidence: z.enum(['low', 'moderate']), rationale: z.string().min(1),
})).parse(reviewData.reviews)
if (new Set(reviews.map(r => r.photoId)).size !== reviews.length) throw new Error('Duplicate portrait review')
const apply = process.argv.includes('--apply')

const count = await db.transaction(async tx => {
  const photos = await tx.select().from(schema.photos).where(and(
    inArray(schema.photos.id, reviews.map(r => r.photoId)),
    eq(schema.photos.source, 'seeded'), isNull(schema.photos.userId),
  )).for('update')
  for (const review of reviews) {
    const photo = photos.find(p => p.id === review.photoId)
    if (!photo || photo.name !== review.name || photo.imageUrl !== review.imageUrl) {
      throw new Error(`Portrait changed or missing: ${review.name}; review again before applying`)
    }
  }
  const existing = await tx.select({ photoId: schema.analyses.photoId }).from(schema.analyses)
    .where(inArray(schema.analyses.photoId, reviews.map(r => r.photoId)))
  const existingIds = new Set(existing.map(r => r.photoId))
  const missing = reviews.filter(r => !existingIds.has(r.photoId))
  if (!apply || !missing.length) return missing.length
  const inserted = await tx.insert(schema.analyses).values(missing.map(review => ({
    photoId: review.photoId, status: 'complete' as const, pslScore: review.pslScore,
    model: 'editorial-photo-review', promptVersion: 'celebrity-psl-v1',
    metrics: { editorialReview: { reviewedAt: reviewData.reviewedAt, method: reviewData.method,
      rubric: reviewData.rubric, confidence: review.confidence, rationale: review.rationale } },
  }))).onConflictDoNothing({ target: schema.analyses.photoId }).returning({ id: schema.analyses.id })
  return inserted.length
})
console.log(`${apply ? 'Inserted' : 'Would insert'} ${count} reviewed PSL records; existing analyses and Battle ratings untouched.`)
process.exit(0)
