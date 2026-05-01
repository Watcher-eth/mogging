import { readFile } from 'fs/promises'
import path from 'path'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { createPhotoRecord } from '../../lib/photos/service'
import { storeImageDataUrl } from '../../lib/storage/images'
import { conservativeScore, displayRating, initialSkillRating } from '../../lib/ratings/trueskill'

type ManualPerson = {
  filePath: string
  name: string
  social: string | null
  gender: 'male' | 'female' | 'other'
}

const people: ManualPerson[] = [
  {
    filePath: '/Users/watcher/Documents/clav.png',
    name: 'Clavicular',
    social: 'https://www.instagram.com/clavicular0/',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/androgenic.png',
    name: 'Androgenic',
    social: 'https://www.instagram.com/androgenic1/',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/dillon.png',
    name: 'Dillon Latham',
    social: 'https://www.instagram.com/Dillonxlatham/',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/Romulus.png',
    name: 'Romulus',
    social: null,
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/fratleader.png',
    name: 'ASU Fratleader Varis',
    social: 'https://www.tiktok.com/@v.varis',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/Zeta.png',
    name: 'Zeta',
    social: 'https://www.tiktok.com/@zeta.psl?lang=en',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/Vmogsu.png',
    name: 'Vmogsu',
    social: 'https://www.tiktok.com/@humblemogger',
    gender: 'male',
  },
  {
    filePath: '/Users/watcher/Documents/lizka.png',
    name: 'Lizka',
    social: 'https://www.tiktok.com/@shloopityboopity7',
    gender: 'female',
  },
]

for (const person of people) {
  const fileBuffer = await readFile(person.filePath)
  const dataUrl = `data:image/png;base64,${fileBuffer.toString('base64')}`
  const storedImage = await storeImageDataUrl(dataUrl)

  const photoResult = await createPhotoRecord({
    imageUrl: storedImage.imageUrl,
    imageStorageKey: storedImage.imageStorageKey,
    imageHash: storedImage.imageHash,
    name: person.name,
    caption: person.social,
    gender: person.gender,
    photoType: 'face',
    source: 'seeded',
    isPublic: true,
  })

  await db
    .update(schema.photos)
    .set({
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      name: person.name,
      caption: person.social,
      gender: person.gender,
      photoType: 'face',
      source: 'seeded',
      isPublic: true,
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

  console.log(`${photoResult.deduped ? 'updated' : 'created'}\t${person.name}\t${path.basename(person.filePath)}\t${storedImage.imageUrl}`)
}

console.log(`ok\tprocessed ${people.length} manual people`)
process.exit(0)
