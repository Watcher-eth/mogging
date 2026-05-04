import { readFile } from 'fs/promises'
import path from 'path'
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm'
import sharp from 'sharp'
import { z } from 'zod'
import { skinColorSchema, type HairColor, type SkinColor } from '../../lib/appearance/types'
import { db, schema } from '../../lib/db'
import { env } from '../../lib/env'

type Rgb = {
  r: number
  g: number
  b: number
}

type BackfillOptions = {
  dryRun: boolean
  fields: Set<AppearanceField>
  limit: number | null
  overwrite: boolean
  vision: boolean
}

type AppearanceField = 'age' | 'gender' | 'hair' | 'skin'

const hairColorSchema = z.enum(['black', 'brown', 'blond', 'red', 'gray', 'other'])
const genderSchema = z.enum(['male', 'female', 'other'])
const visionAppearanceSchema = z.object({
  gender: genderSchema.nullable().optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
})

const options = parseOptions(process.argv.slice(2))
const rows = await loadRows(options)
let updated = 0
let skipped = 0
let failed = 0

console.log(`appearance backfill: ${rows.length} photo(s), dryRun=${options.dryRun}, overwrite=${options.overwrite}, vision=${options.vision}`)

for (const row of rows) {
  try {
    const imageBuffer = await loadPhotoBuffer(row.imageUrl)
    const localAppearance = await inferLocalAppearance(imageBuffer)
    const profileGender = row.userGender ?? row.anonymousGender ?? null
    const profileAge = row.userAge ?? row.anonymousAge ?? null
    const visionAppearance = options.vision ? await inferVisionAppearance(imageBuffer) : null

    const next = {
      gender: chooseValue(row.gender, visionAppearance?.gender ?? profileGender, options.overwrite),
      age: chooseValue(row.age, visionAppearance?.age ?? profileAge, options.overwrite),
      hairColor: chooseValue(row.hairColor, visionAppearance?.hairColor ?? localAppearance.hairColor, options.overwrite),
      skinColor: chooseValue(row.skinColor, visionAppearance?.skinColor ?? localAppearance.skinColor, options.overwrite),
    }

    const patch = {
      ...(options.fields.has('gender') && next.gender !== row.gender ? { gender: next.gender } : null),
      ...(options.fields.has('age') && next.age !== row.age ? { age: next.age } : null),
      ...(options.fields.has('hair') && next.hairColor !== row.hairColor ? { hairColor: next.hairColor } : null),
      ...(options.fields.has('skin') && next.skinColor !== row.skinColor ? { skinColor: next.skinColor } : null),
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1
      continue
    }

    updated += 1
    console.log(`${options.dryRun ? 'would update' : 'updated'} ${row.id} ${row.name ?? row.imageUrl}`, patch)

    if (!options.dryRun) {
      await db
        .update(schema.photos)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(schema.photos.id, row.id))
    }
  } catch (error) {
    failed += 1
    console.error(`failed ${row.id} ${row.imageUrl}:`, error instanceof Error ? error.message : error)
  }
}

console.log(`appearance backfill complete: updated=${updated}, skipped=${skipped}, failed=${failed}`)
process.exit(failed > 0 ? 1 : 0)

function parseOptions(args: string[]): BackfillOptions {
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const fieldsArg = args.find((arg) => arg.startsWith('--fields='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null
  const fields = parseFields(fieldsArg?.split('=')[1])

  if (limitArg && (!Number.isInteger(limit) || limit! < 1)) {
    throw new Error('--limit must be a positive integer')
  }

  return {
    dryRun: args.includes('--dry-run'),
    fields,
    limit,
    overwrite: args.includes('--overwrite'),
    vision: args.includes('--vision'),
  }
}

function parseFields(value?: string) {
  const fields = new Set<AppearanceField>()
  const requested = value ? value.split(',') : ['age', 'gender', 'hair', 'skin']

  for (const field of requested) {
    if (field === 'age' || field === 'gender' || field === 'hair' || field === 'skin') {
      fields.add(field)
      continue
    }

    throw new Error('--fields must contain only age,gender,hair,skin')
  }

  return fields
}

async function loadRows({ limit, overwrite }: BackfillOptions) {
  const filters = overwrite
    ? [isNotNull(schema.photos.id)]
    : [
        or(
          options.fields.has('gender') ? eq(schema.photos.gender, 'other') : undefined,
          options.fields.has('age') ? isNull(schema.photos.age) : undefined,
          options.fields.has('hair') ? isNull(schema.photos.hairColor) : undefined,
          options.fields.has('skin') ? isNull(schema.photos.skinColor) : undefined
        ),
      ]

  const query = db
    .select({
      id: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      name: schema.photos.name,
      gender: schema.photos.gender,
      age: schema.photos.age,
      hairColor: schema.photos.hairColor,
      skinColor: schema.photos.skinColor,
      userGender: schema.users.gender,
      userAge: schema.users.age,
      anonymousGender: schema.anonymousProfiles.gender,
      anonymousAge: schema.anonymousProfiles.age,
    })
    .from(schema.photos)
    .leftJoin(schema.users, eq(schema.users.id, schema.photos.userId))
    .leftJoin(
      schema.anonymousProfiles,
      and(eq(schema.anonymousProfiles.anonymousActorId, schema.photos.anonymousActorId), isNotNull(schema.photos.anonymousActorId))
    )
    .where(and(...filters))

  return limit ? query.limit(limit) : query
}

async function loadPhotoBuffer(imageUrl: string) {
  if (imageUrl.startsWith('data:image/')) {
    const [, base64] = imageUrl.split(',', 2)
    return Buffer.from(base64, 'base64')
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error(`Unable to fetch image: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }

  const publicPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl
  return readFile(path.resolve(process.cwd(), 'public', publicPath))
}

async function inferLocalAppearance(buffer: Buffer): Promise<{ hairColor: HairColor | null; skinColor: SkinColor | null }> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    hairColor: inferHairColor(data, info.width, info.height),
    skinColor: inferSkinColor(data, info.width, info.height),
  }
}

function inferHairColor(data: Buffer, width: number, height: number): HairColor | null {
  const rects = [
    rect(width * 0.28, height * 0.08, width * 0.44, height * 0.24, width, height),
    rect(width * 0.18, height * 0.18, width * 0.18, height * 0.34, width, height),
    rect(width * 0.64, height * 0.18, width * 0.18, height * 0.34, width, height),
  ]
  const samples: Rgb[] = []

  for (const sampleRect of rects) {
    forEachPixel(data, width, sampleRect, (pixel, index) => {
      if (index % 7 !== 0) return
      if (isLikelyBackground(pixel)) return
      samples.push(pixel)
    })
  }

  if (samples.length < 24) return null
  return bucketHairColor(samples)
}

function inferSkinColor(data: Buffer, width: number, height: number): SkinColor | null {
  const points = [
    { x: width * 0.38, y: height * 0.44 },
    { x: width * 0.62, y: height * 0.44 },
    { x: width * 0.5, y: height * 0.35 },
    { x: width * 0.5, y: height * 0.52 },
  ]
  const samples: Rgb[] = []

  for (const point of points) {
    const sampleRect = rect(point.x - 12, point.y - 12, 24, 24, width, height)
    forEachPixel(data, width, sampleRect, (pixel, index) => {
      if (index % 5 !== 0) return
      if (isLikelySkin(pixel)) samples.push(pixel)
    })
  }

  if (samples.length < 12) return null
  return bucketSkinColor(samples)
}

async function inferVisionAppearance(buffer: Buffer) {
  if (!env.MOONSHOT_API_KEY) {
    throw new Error('MOONSHOT_API_KEY is required for --vision backfill')
  }

  const imageDataUrl = `data:image/jpeg;base64,${(await sharp(buffer).jpeg({ quality: 82 }).toBuffer()).toString('base64')}`

  const body = JSON.stringify({
    model: env.KIMI_ANALYSIS_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Classify visible portrait metadata for leaderboard filters. Return strict JSON only. Skin color is a visible tone bucket, not ethnicity.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          {
            type: 'text',
            text: 'Return {"gender":"male|female|other|null","age":number|null,"hairColor":"black|brown|blond|red|gray|other|null","skinColor":"very_light|light|white|tan|brown|black|null"}. Estimate age as an integer from visible apparent age. Use null if not reasonably visible. Treat dirty blond and dark blond as blond, not brown.',
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    max_tokens: 300,
  })

  const response = await fetchVisionWithRetry(body)

  if (!response.ok) {
    throw new Error(`Vision appearance request failed: ${response.status} ${await response.text()}`)
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }
  const content = json.choices?.[0]?.message?.content
  if (!content) return null
  return visionAppearanceSchema.parse(JSON.parse(content))
}

async function fetchVisionWithRetry(body: string) {
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${env.MOONSHOT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (response.ok || (response.status !== 429 && response.status < 500)) return response

    lastResponse = response
    await sleep(900 * (attempt + 1))
  }

  return lastResponse!
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chooseValue<T>(currentValue: T, inferredValue: T | null | undefined, overwrite: boolean) {
  if (inferredValue === undefined || inferredValue === null) return currentValue
  if (overwrite) return inferredValue
  if (currentValue === null) return inferredValue
  if (currentValue === 'other') return inferredValue
  return currentValue
}

function bucketHairColor(samples: Rgb[]): HairColor {
  const hairSamples = samples.filter((pixel) => !isLikelySkin(pixel) || isLikelyBlondPixel(pixel))
  const usableSamples = hairSamples.length >= 24 ? hairSamples : samples
  const blondSamples = usableSamples.filter(isLikelyBlondPixel)
  const lightWarmRatio = blondSamples.length / usableSamples.length

  if (blondSamples.length >= 10 && lightWarmRatio >= 0.16) return 'blond'

  const rgb = average(usableSamples)
  const { h, s, v } = rgbToHsv(rgb)

  if (v < 46) return 'black'
  if (s < 0.18 && v > 150) return 'gray'
  if ((h < 26 || h > 345) && s > 0.28 && v > 55) return 'red'
  if (h >= 28 && h <= 62 && s > 0.12 && v > 112) return 'blond'
  if (v < 138 && h >= 12 && h <= 52) return 'brown'
  if (v < 92) return 'black'
  return 'other'
}

function bucketSkinColor(samples: Rgb[]): SkinColor {
  const luminanceValues = samples
    .map((pixel) => 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b)
    .sort((a, b) => a - b)
  const middle = luminanceValues.slice(
    Math.floor(luminanceValues.length * 0.18),
    Math.ceil(luminanceValues.length * 0.82)
  )
  const luminance = middle.reduce((sum, value) => sum + value, 0) / Math.max(1, middle.length)

  if (luminance >= 202) return 'very_light'
  if (luminance >= 172) return 'light'
  if (luminance >= 138) return 'white'
  if (luminance >= 106) return 'tan'
  if (luminance >= 74) return 'brown'
  return 'black'
}

function average(samples: Rgb[]) {
  const total = samples.reduce(
    (sum, pixel) => ({
      r: sum.r + pixel.r,
      g: sum.g + pixel.g,
      b: sum.b + pixel.b,
    }),
    { r: 0, g: 0, b: 0 }
  )

  return {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length,
  }
}

function isLikelySkin({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 72 && g > 38 && b > 24 && max - min > 15 && r > g && g >= b * 0.72
}

function isLikelyBlondPixel(pixel: Rgb) {
  const { h, s, v } = rgbToHsv(pixel)
  return h >= 28 && h <= 64 && s >= 0.10 && s <= 0.68 && v >= 112 && pixel.r >= pixel.b + 22
}

function isLikelyBackground({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max > 238 && max - min < 16
}

function rgbToHsv({ r, g, b }: Rgb) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max * 255,
  }
}

function rect(x: number, y: number, width: number, height: number, maxWidth: number, maxHeight: number) {
  const left = Math.max(0, Math.min(maxWidth - 1, Math.round(x)))
  const top = Math.max(0, Math.min(maxHeight - 1, Math.round(y)))
  const right = Math.max(left + 1, Math.min(maxWidth, Math.round(x + width)))
  const bottom = Math.max(top + 1, Math.min(maxHeight, Math.round(y + height)))

  return { left, top, right, bottom }
}

function forEachPixel(
  data: Buffer,
  width: number,
  sampleRect: ReturnType<typeof rect>,
  callback: (pixel: Rgb, index: number) => void
) {
  let index = 0
  for (let y = sampleRect.top; y < sampleRect.bottom; y += 1) {
    for (let x = sampleRect.left; x < sampleRect.right; x += 1) {
      const offset = (y * width + x) * 3
      callback({ r: data[offset], g: data[offset + 1], b: data[offset + 2] }, index)
      index += 1
    }
  }
}
