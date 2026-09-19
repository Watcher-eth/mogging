import { createHash } from 'crypto'
import { inArray } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { createPhotoRecord } from '../../lib/photos/service'
import { storeImageDataUrl } from '../../lib/storage/images'
import { conservativeScore, displayRating, initialSkillRating } from '../../lib/ratings/trueskill'

type Actor = {
  name: string
  wikipediaTitle: string
  instagram: string
  gender: 'female' | 'male'
}

const actors: Actor[] = [
  { name: 'Jenna Ortega', wikipediaTitle: 'Jenna Ortega', instagram: 'https://www.instagram.com/jennaortega/', gender: 'female' },
  { name: 'Millie Bobby Brown', wikipediaTitle: 'Millie Bobby Brown', instagram: 'https://www.instagram.com/milliebobbybrown/', gender: 'female' },
  { name: 'Sadie Sink', wikipediaTitle: 'Sadie Sink', instagram: 'https://www.instagram.com/sadiesink_/', gender: 'female' },
  { name: 'Sydney Sweeney', wikipediaTitle: 'Sydney Sweeney', instagram: 'https://www.instagram.com/sydney_sweeney/', gender: 'female' },
  { name: 'Florence Pugh', wikipediaTitle: 'Florence Pugh', instagram: 'https://www.instagram.com/florencepugh/', gender: 'female' },
  { name: 'Anya Taylor-Joy', wikipediaTitle: 'Anya Taylor-Joy', instagram: 'https://www.instagram.com/anyataylorjoy/', gender: 'female' },
  { name: 'Zendaya', wikipediaTitle: 'Zendaya', instagram: 'https://www.instagram.com/zendaya/', gender: 'female' },
  { name: 'Ayo Edebiri', wikipediaTitle: 'Ayo Edebiri', instagram: 'https://www.instagram.com/ayoedebiri/', gender: 'female' },
  { name: 'Emma Myers', wikipediaTitle: 'Emma Myers', instagram: 'https://www.instagram.com/ememyers/', gender: 'female' },
  { name: 'Rachel Zegler', wikipediaTitle: 'Rachel Zegler', instagram: 'https://www.instagram.com/rachelzegler/', gender: 'female' },
  { name: 'Isabela Merced', wikipediaTitle: 'Isabela Merced', instagram: 'https://www.instagram.com/isabelamerced/', gender: 'female' },
  { name: 'Cailee Spaeny', wikipediaTitle: 'Cailee Spaeny', instagram: 'https://www.instagram.com/caileespaeny/', gender: 'female' },
  { name: 'Hunter Schafer', wikipediaTitle: 'Hunter Schafer', instagram: 'https://www.instagram.com/hunterschafer/', gender: 'female' },
  { name: 'Maya Hawke', wikipediaTitle: 'Maya Hawke', instagram: 'https://www.instagram.com/maya_hawke/', gender: 'female' },
  { name: 'Sophie Thatcher', wikipediaTitle: 'Sophie Thatcher', instagram: 'https://www.instagram.com/sofiethatcher/', gender: 'female' },
  { name: 'Margaret Qualley', wikipediaTitle: 'Margaret Qualley', instagram: 'https://www.instagram.com/margaretqualley/', gender: 'female' },
  { name: 'Daisy Edgar-Jones', wikipediaTitle: 'Daisy Edgar-Jones', instagram: 'https://www.instagram.com/daisyedgarjones/', gender: 'female' },
  { name: 'Ella Purnell', wikipediaTitle: 'Ella Purnell', instagram: 'https://www.instagram.com/ella_purnell/', gender: 'female' },
  { name: 'Victoria Pedretti', wikipediaTitle: 'Victoria Pedretti', instagram: 'https://www.instagram.com/then0t0riousvip/', gender: 'female' },
  { name: 'Naomi Scott', wikipediaTitle: 'Naomi Scott', instagram: 'https://www.instagram.com/naomigscott/', gender: 'female' },
  { name: 'Kiernan Shipka', wikipediaTitle: 'Kiernan Shipka', instagram: 'https://www.instagram.com/kiernanshipka/', gender: 'female' },
  { name: 'Madelyn Cline', wikipediaTitle: 'Madelyn Cline', instagram: 'https://www.instagram.com/madelyncline/', gender: 'female' },
  { name: 'Halle Bailey', wikipediaTitle: 'Halle Bailey', instagram: 'https://www.instagram.com/hallebailey/', gender: 'female' },
  { name: 'Joey King', wikipediaTitle: 'Joey King', instagram: 'https://www.instagram.com/joeyking/', gender: 'female' },
  { name: 'Kathryn Newton', wikipediaTitle: 'Kathryn Newton', instagram: 'https://www.instagram.com/kathrynnewton/', gender: 'female' },
  { name: 'Maude Apatow', wikipediaTitle: 'Maude Apatow', instagram: 'https://www.instagram.com/maudeapatow/', gender: 'female' },
  { name: 'Lili Reinhart', wikipediaTitle: 'Lili Reinhart', instagram: 'https://www.instagram.com/lilireinhart/', gender: 'female' },
  { name: 'Camila Mendes', wikipediaTitle: 'Camila Mendes', instagram: 'https://www.instagram.com/camimendes/', gender: 'female' },
  { name: 'Timothée Chalamet', wikipediaTitle: 'Timothée Chalamet', instagram: 'https://www.instagram.com/tchalamet/', gender: 'male' },
  { name: 'Paul Mescal', wikipediaTitle: 'Paul Mescal', instagram: 'https://www.instagram.com/paulmescal/', gender: 'male' },
  { name: 'Jacob Elordi', wikipediaTitle: 'Jacob Elordi', instagram: 'https://www.instagram.com/jacobelordi/', gender: 'male' },
  { name: 'Tom Holland', wikipediaTitle: 'Tom Holland', instagram: 'https://www.instagram.com/tomholland2013/', gender: 'male' },
  { name: 'Harris Dickinson', wikipediaTitle: 'Harris Dickinson', instagram: 'https://www.instagram.com/harrisdickinson/', gender: 'male' },
  { name: 'Barry Keoghan', wikipediaTitle: 'Barry Keoghan', instagram: 'https://www.instagram.com/keoghan92/', gender: 'male' },
  { name: 'Hero Fiennes Tiffin', wikipediaTitle: 'Hero Fiennes Tiffin', instagram: 'https://www.instagram.com/hero_ft/', gender: 'male' },
  { name: 'Louis Partridge', wikipediaTitle: 'Louis Partridge', instagram: 'https://www.instagram.com/louispartridge_/', gender: 'male' },
  { name: 'Kit Connor', wikipediaTitle: 'Kit Connor', instagram: 'https://www.instagram.com/kit.connor/', gender: 'male' },
  { name: 'Tanner Buchanan', wikipediaTitle: 'Tanner Buchanan', instagram: 'https://www.instagram.com/tannerbuchananofficial/', gender: 'male' },
  { name: 'Mason Gooding', wikipediaTitle: 'Mason Gooding', instagram: 'https://www.instagram.com/mason.gooding/', gender: 'male' },
  { name: 'Nicholas Galitzine', wikipediaTitle: 'Nicholas Galitzine', instagram: 'https://www.instagram.com/nicholasgalitzine/', gender: 'male' },
]

type WikipediaSummary = {
  thumbnail?: { source?: string }
}

async function fetchPortrait(title: string) {
  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, { headers: { 'user-agent': 'mogging-battle-import/1.0' } })
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)))
      continue
    }
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status} ${response.statusText}`)
    const summary = (await response.json()) as WikipediaSummary
    if (!summary.thumbnail?.source) throw new Error('Wikipedia does not provide a portrait thumbnail')
    return summary.thumbnail.source
  }

  throw new Error('Wikipedia rate limited all portrait retries')
}

const existing = await db
  .select({ name: schema.photos.name })
  .from(schema.photos)
  .where(inArray(schema.photos.name, actors.map((actor) => actor.name)))
const existingNames = new Set(existing.flatMap((actor) => (actor.name ? [actor.name] : [])))
const dryRun = process.env.DRY_RUN === '1'

let created = 0
let skipped = 0
const failed: string[] = []

for (const actor of actors) {
  if (existingNames.has(actor.name)) {
    skipped += 1
    console.log(`skipped\t${actor.name}\talready present`)
    continue
  }

  try {
    const portraitUrl = await fetchPortrait(actor.wikipediaTitle)
    if (dryRun) {
      console.log(`preview\t${actor.name}\t${portraitUrl}`)
      continue
    }
    const response = await fetch(portraitUrl)
    if (!response.ok) throw new Error(`portrait download returned ${response.status} ${response.statusText}`)

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
      name: actor.name,
      caption: actor.instagram,
      gender: actor.gender,
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
    console.log(`created\t${actor.name}\t${portraitUrl}`)
  } catch (error) {
    failed.push(actor.name)
    console.error(`failed\t${actor.name}\t${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

console.log(`ok\tcreated ${created}\tskipped ${skipped}\tfailed ${failed.join(', ') || 'none'}`)
