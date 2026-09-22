import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { storeImageDataUrl } from '../../lib/storage/images'

const actors = [
  ['Jenna Ortega', 'Jenna Ortega'], ['Millie Bobby Brown', 'Millie Bobby Brown'], ['Sadie Sink', 'Sadie Sink'], ['Sydney Sweeney', 'Sydney Sweeney'],
  ['Florence Pugh', 'Florence Pugh'], ['Anya Taylor-Joy', 'Anya Taylor-Joy'], ['Zendaya', 'Zendaya'], ['Ayo Edebiri', 'Ayo Edebiri'],
  ['Emma Myers', 'Emma Myers'], ['Rachel Zegler', 'Rachel Zegler'], ['Isabela Merced', 'Isabela Merced'], ['Cailee Spaeny', 'Cailee Spaeny'],
  ['Hunter Schafer', 'Hunter Schafer'], ['Maya Hawke', 'Maya Hawke'], ['Sophie Thatcher', 'Sophie Thatcher'], ['Margaret Qualley', 'Margaret Qualley'],
  ['Daisy Edgar-Jones', 'Daisy Edgar-Jones'], ['Ella Purnell', 'Ella Purnell'], ['Victoria Pedretti', 'Victoria Pedretti'], ['Naomi Scott', 'Naomi Scott'],
  ['Kiernan Shipka', 'Kiernan Shipka'], ['Madelyn Cline', 'Madelyn Cline'], ['Halle Bailey', 'Halle Bailey'], ['Joey King', 'Joey King'],
  ['Kathryn Newton', 'Kathryn Newton'], ['Maude Apatow', 'Maude Apatow'], ['Lili Reinhart', 'Lili Reinhart'], ['Camila Mendes', 'Camila Mendes'],
  ['Timothée Chalamet', 'Timothée Chalamet'], ['Paul Mescal', 'Paul Mescal'], ['Jacob Elordi', 'Jacob Elordi'], ['Tom Holland', 'Tom Holland'],
  ['Harris Dickinson', 'Harris Dickinson'], ['Barry Keoghan', 'Barry Keoghan'], ['Hero Fiennes Tiffin', 'Hero Fiennes Tiffin'], ['Louis Partridge', 'Louis Partridge'],
  ['Kit Connor', 'Kit Connor'], ['Tanner Buchanan', 'Tanner Buchanan'], ['Mason Gooding', 'Mason Gooding'], ['Nicholas Galitzine', 'Nicholas Galitzine'],
] as const

type PageImageResponse = {
  query?: { pages?: Record<string, { thumbnail?: { source?: string } }> }
}

type WikipediaSummary = {
  thumbnail?: { source?: string }
}

async function fetchHighResolutionPortrait(title: string) {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php')
  endpoint.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'pageimages',
    titles: title,
    pithumbsize: '1200',
    pilimit: '1',
  }).toString()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, { headers: { 'user-agent': 'mogging-battle-import/1.0' } })
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)))
      continue
    }
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status} ${response.statusText}`)
    const payload = (await response.json()) as PageImageResponse
    const page = Object.values(payload.query?.pages ?? {})[0]
    if (page?.thumbnail?.source) return page.thumbnail.source

    const fallback = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`, {
      headers: { 'user-agent': 'mogging-battle-import/1.0' },
    })
    if (!fallback.ok) throw new Error(`Wikipedia returned ${fallback.status} ${fallback.statusText}`)
    const summary = (await fallback.json()) as WikipediaSummary
    if (!summary.thumbnail?.source) throw new Error('Wikipedia does not provide a portrait thumbnail')
    return summary.thumbnail.source.replace('/330px-', '/1280px-')
  }

  throw new Error('Wikipedia rate limited all portrait retries')
}

const requestedNames = new Set((process.env.NAMES ?? '').split(',').filter(Boolean))
const selectedActors = requestedNames.size ? actors.filter(([name]) => requestedNames.has(name)) : actors
const names = selectedActors.map(([name]) => name)
const rows = await db
  .select({ id: schema.photos.id, name: schema.photos.name })
  .from(schema.photos)
  .where(inArray(schema.photos.name, names))
const photoIdByName = new Map(rows.flatMap((row) => (row.name ? [[row.name, row.id] as const] : [])))

let upgraded = 0
const failed: string[] = []

for (const [name, wikipediaTitle] of selectedActors) {
  const photoId = photoIdByName.get(name)
  if (!photoId) {
    failed.push(name)
    console.error(`failed\t${name}\tmissing Battle record`)
    continue
  }

  try {
    const portraitUrl = await fetchHighResolutionPortrait(wikipediaTitle)
    const response = await fetch(portraitUrl)
    if (!response.ok) throw new Error(`portrait download returned ${response.status} ${response.statusText}`)
    const contentType = response.headers.get('content-type')?.split(';')[0]
    if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') {
      throw new Error(`unsupported image type: ${contentType ?? 'missing content type'}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const storedImage = await storeImageDataUrl(`data:${contentType};base64,${bytes.toString('base64')}`)
    await db
      .update(schema.photos)
      .set({
        imageUrl: storedImage.imageUrl,
        imageStorageKey: storedImage.imageStorageKey,
        imageHash: storedImage.imageHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.photos.id, photoId))

    upgraded += 1
    console.log(`upgraded\t${name}\t${portraitUrl}`)
  } catch (error) {
    failed.push(name)
    console.error(`failed\t${name}\t${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

console.log(`ok\tupgraded ${upgraded}\tfailed ${failed.join(', ') || 'none'}`)
