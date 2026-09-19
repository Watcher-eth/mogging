import { createHash } from 'crypto'
import { inArray } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { createPhotoRecord } from '../../lib/photos/service'
import { storeImageDataUrl } from '../../lib/storage/images'
import { conservativeScore, displayRating, initialSkillRating } from '../../lib/ratings/trueskill'

type RankedPerson = {
  name: string
  imageUrl: string
  gender: 'female' | 'male'
}

const source = 'https://officialchadrankings.com'
const imageBase = 'https://media.base44.com/images/public/69912bf501cd81dc0b521cee'

const people: RankedPerson[] = [
  { name: 'Salludon', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/f7f47f9bc_salludon.png', gender: 'male' },
  { name: 'Bass', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/0582c7d3f_bass.jpg', gender: 'male' },
  { name: 'Trevor Larcom', imageUrl: `${imageBase}/eb3e6027e_image.png`, gender: 'male' },
  { name: 'Derb', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/f255c280c_derb.jpg', gender: 'male' },
  { name: 'K Shami', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/12b5b2e1d_kshami.jpg', gender: 'male' },
  { name: 'Marlon', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/83fe677b1_marlon.png', gender: 'male' },
  { name: 'Bojack', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/684575d8d_bojack.jpg', gender: 'male' },
  { name: 'Aman', imageUrl: `${imageBase}/c33f4b7da_image.png`, gender: 'male' },
  { name: 'Matis Mallie', imageUrl: `${imageBase}/36e2e36f7_image.png`, gender: 'male' },
  { name: 'CookieKing', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/9e0262123_cookieking.jpg', gender: 'male' },
  { name: 'Orbital', imageUrl: `${imageBase}/23e7e0477_image.png`, gender: 'male' },
  { name: 'Archie Cranch', imageUrl: `${imageBase}/30f5a0343_image.png`, gender: 'male' },
  { name: 'Haskell', imageUrl: `${imageBase}/41fc532ca_image.png`, gender: 'male' },
  { name: 'Brev', imageUrl: `${imageBase}/ebff2d05a_image.png`, gender: 'male' },
  { name: 'Lance Baker', imageUrl: `${imageBase}/e72f3c15c_image.png`, gender: 'male' },
  { name: 'Dorian Sarachi', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/efa0f3c8d_doriansaraci.jpg', gender: 'male' },
  { name: 'Erik Harding', imageUrl: `${imageBase}/35aa72a9f_image.png`, gender: 'male' },
  { name: 'Sunshine', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/eccd9d222_sunshine.png', gender: 'male' },
  { name: 'Geno', imageUrl: `${imageBase}/f1721c22f_image.png`, gender: 'male' },
  { name: 'Aurora', imageUrl: `${imageBase}/92112902c_aurora.png`, gender: 'female' },
  { name: 'Brae', imageUrl: `${imageBase}/7deb7d0f0_image.png`, gender: 'male' },
  { name: 'Jawad', imageUrl: `${imageBase}/3d859bbc6_image.png`, gender: 'male' },
  { name: 'Ehren', imageUrl: `${imageBase}/66cb2c852_image.png`, gender: 'male' },
  { name: 'Don Starke', imageUrl: 'https://media.base44.com/images/public/69912bf501cd81dc0b521cee/5917b7b0c_tyrone.png', gender: 'male' },
  { name: 'Zmax', imageUrl: `${imageBase}/b109dccf8_image.png`, gender: 'male' },
  { name: 'Unc Sky', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/1fc1111ac_image.png', gender: 'male' },
  { name: 'Thien', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/2a14e1a5a_image.png', gender: 'male' },
  { name: 'Charlie Scholer', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/f18df08ab_image.png', gender: 'male' },
  { name: 'Manu', imageUrl: `${imageBase}/e80ab1bc3_image.png`, gender: 'male' },
  { name: 'Joseph Shin', imageUrl: `${imageBase}/561bac666_shin.png`, gender: 'male' },
  { name: 'Justice Johnson', imageUrl: `${imageBase}/9f2ab9039_image.png`, gender: 'male' },
  { name: 'Jynxzi', imageUrl: `${imageBase}/df492dc10_image.png`, gender: 'male' },
  { name: 'Louis', imageUrl: `${imageBase}/1b299e88d_image.png`, gender: 'male' },
  { name: 'Cizzle', imageUrl: `${imageBase}/d5f59e987_image.png`, gender: 'male' },
  { name: 'Missof', imageUrl: `${imageBase}/906abb504_image.png`, gender: 'female' },
  { name: 'Nocturnal Kent', imageUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69912bf501cd81dc0b521cee/91a41f069_nocturnalkent.jpg', gender: 'male' },
  { name: 'Adoxy', imageUrl: `${imageBase}/f74d9fa96_image.png`, gender: 'male' },
  { name: 'Dustin Wayne', imageUrl: `${imageBase}/4568cb828_image.png`, gender: 'male' },
  { name: 'AK Pilled', imageUrl: `${imageBase}/73e772126_image.png`, gender: 'male' },
  { name: 'Jesse Wilson', imageUrl: `${imageBase}/f50913b0c_image.png`, gender: 'male' },
]

const existing = await db
  .select({ name: schema.photos.name })
  .from(schema.photos)
  .where(inArray(schema.photos.name, people.map((person) => person.name)))
const existingNames = new Set(existing.flatMap((person) => (person.name ? [person.name] : [])))

let created = 0
let skipped = 0
const failed: string[] = []

for (const person of people) {
  if (existingNames.has(person.name)) {
    skipped += 1
    console.log(`skipped\t${person.name}\talready present`)
    continue
  }

  try {
    const response = await fetch(person.imageUrl)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)

    const contentType = response.headers.get('content-type')?.split(';')[0]
    if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') {
      throw new Error(`unsupported image type: ${contentType ?? 'missing content type'}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const imageHash = createHash('sha256').update(bytes).digest('hex')
    const storedImage = await storeImageDataUrl(`data:${contentType};base64,${bytes.toString('base64')}`)
    const photoResult = await createPhotoRecord({
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      imageHash,
      name: person.name,
      gender: person.gender,
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

    created += 1
    console.log(`created\t${person.name}\t${source}`)
  } catch (error) {
    failed.push(person.name)
    console.error(`failed\t${person.name}\t${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

console.log(`ok\tcreated ${created}\tskipped ${skipped}\tfailed ${failed.join(', ') || 'none'}`)
