import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { createPhotoRecord } from '../../lib/photos/service'
import { conservativeScore, displayRating, initialSkillRating } from '../../lib/ratings/trueskill'

const seedPhotos = [
  { file: 'model.png', name: 'Vanta', gender: 'female' as const, pslScore: 7.9 },
  { file: 'model2.png', name: 'Kairo', gender: 'male' as const, pslScore: 7.4 },
  { file: 'model3.png', name: 'Sable', gender: 'female' as const, pslScore: 7.9 },
  { file: 'model4.png', name: 'Rook', gender: 'male' as const, pslScore: 7.7 },
  { file: 'model5.png', name: 'Luma', gender: 'female' as const, pslScore: 7.6 },
  { file: 'model6.png', name: 'Nero', gender: 'male' as const, pslScore: 7.9 },
  { file: 'model7.png', name: 'Iris', gender: 'male' as const, pslScore: 7.8 },
  { file: 'model8.png', name: 'Astra', gender: 'male' as const, pslScore: 7.5 },
  { file: 'model9.png', name: 'Ciel', gender: 'male' as const, pslScore: 7.3 },
  { file: 'model10.png', name: 'Vale', gender: 'male' as const, pslScore: 7.2 },
  { file: 'model11.png', name: 'Noa', gender: 'male' as const, pslScore: 7.7 },
  { file: 'model12.png', name: 'Sol', gender: 'female' as const, pslScore: 7.1 },
  { file: 'model13.png', name: 'Eden', gender: 'male' as const, pslScore: 7.6 },
  { file: 'model14.png', name: 'Mika', gender: 'male' as const, pslScore: 7.9 },
]

for (const seed of seedPhotos) {
  const publicPath = path.join(process.cwd(), 'public', seed.file)
  const fileBuffer = await readFile(publicPath)
  const hash = createHash('sha256').update(fileBuffer).digest('hex')
  const photoResult = await createPhotoRecord({
    imageUrl: `/${seed.file}`,
    imageStorageKey: `public/${seed.file}`,
    imageHash: hash,
    name: seed.name,
    gender: seed.gender,
    photoType: 'face',
    source: 'seeded',
    isPublic: true,
  })
  await db
    .update(schema.photos)
    .set({
      gender: seed.gender,
      imageStorageKey: `public/${seed.file}`,
      imageUrl: `/${seed.file}`,
      name: seed.name,
      photoType: 'face',
      source: 'seeded',
      updatedAt: new Date(),
    })
    .where(eq(schema.photos.id, photoResult.photo.id))
  const rating = initialSkillRating()

  await db
    .insert(schema.photoRatings)
    .values({
      photoId: photoResult.photo.id,
      mu: rating.mu,
      sigma: rating.sigma,
      conservativeScore: conservativeScore(rating),
      displayRating: displayRating(rating),
    })
    .onConflictDoNothing()

  await db
    .insert(schema.analyses)
    .values({
      photoId: photoResult.photo.id,
      status: 'complete',
      pslScore: seed.pslScore,
      harmonyScore: seed.pslScore,
      dimorphismScore: seed.pslScore,
      angularityScore: seed.pslScore,
      metrics: { seed: true },
      landmarks: {},
      model: 'seed',
      promptVersion: 'seed-v1',
    })
    .onConflictDoUpdate({
      target: schema.analyses.photoId,
      set: {
        status: 'complete',
        pslScore: seed.pslScore,
        harmonyScore: seed.pslScore,
        dimorphismScore: seed.pslScore,
        angularityScore: seed.pslScore,
        metrics: { seed: true },
        landmarks: {},
        model: 'seed',
        promptVersion: 'seed-v1',
        updatedAt: new Date(),
      },
    })
}

console.log(`ok\tseeded ${seedPhotos.length} photos`)
process.exit(0)
