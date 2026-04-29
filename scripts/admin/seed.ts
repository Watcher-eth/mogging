import { createHash } from 'crypto'
import { db, schema } from '../../lib/db'
import { createPhotoRecord } from '../../lib/photos/service'
import { conservativeScore, displayRating, initialSkillRating } from '../../lib/ratings/trueskill'

const seedPhotos = [
  { name: 'Seed Face A', gender: 'male' as const, pslScore: 4.1 },
  { name: 'Seed Face B', gender: 'female' as const, pslScore: 4.4 },
  { name: 'Seed Face C', gender: 'other' as const, pslScore: 3.8 },
]

for (const seed of seedPhotos) {
  const hash = createHash('sha256').update(seed.name).digest('hex')
  const photoResult = await createPhotoRecord({
    imageUrl: `https://example.com/${hash}.jpg`,
    imageStorageKey: `seed/${hash}.jpg`,
    imageHash: hash,
    name: seed.name,
    gender: seed.gender,
    photoType: 'face',
    source: 'seeded',
    isPublic: true,
  })
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
    .onConflictDoNothing()
}

console.log(`ok\tseeded ${seedPhotos.length} photos`)
