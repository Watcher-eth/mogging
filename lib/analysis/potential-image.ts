import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { env } from '@/lib/env'
import { storeImageDataUrl } from '@/lib/storage/images'

const OPENAI_IMAGES_EDIT_URL = 'https://api.openai.com/v1/images/edits'
const POTENTIAL_IMAGE_TIMEOUT_MS = 75_000

export const potentialImageInputSchema = z.object({
  imageData: z.string().min(1).refine((value) => value.startsWith('data:image/'), 'Expected image data URL'),
  focusAreas: z.array(z.string().min(1).max(80)).max(6).default([]),
  summary: z.string().max(500).nullable().optional(),
  store: z.boolean().default(true),
})

export type PotentialImageInput = z.infer<typeof potentialImageInputSchema>

export async function generatePotentialImage(input: PotentialImageInput) {
  const data = potentialImageInputSchema.parse(input)
  if (!env.OPENAI_API_KEY) {
    throw new ApiError(503, 'GPT Image generation is not configured', 'provider_error')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), POTENTIAL_IMAGE_TIMEOUT_MS)

  try {
    const formData = new FormData()
    const image = dataUrlToFile(data.imageData, 'source-image')
    formData.append('model', env.OPENAI_IMAGE_MODEL)
    formData.append('image', image)
    formData.append('prompt', buildPotentialImagePrompt(data))
    formData.append('size', '1024x1536')
    formData.append('quality', 'medium')

    const response = await fetch(OPENAI_IMAGES_EDIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: formData,
      signal: controller.signal,
    })

    const responseText = await response.text()
    const responseBody = parseOpenAiImageResponse(responseText)

    if (!response.ok) {
      throw new ApiError(response.status, readOpenAiError(responseBody) ?? 'GPT Image generation failed', 'provider_error')
    }

    const imageDataUrl = readGeneratedImageDataUrl(responseBody)
    if (!imageDataUrl) {
      throw new ApiError(502, 'GPT Image generation returned no image', 'provider_error')
    }

    const storedImage = data.store ? await storeImageDataUrl(imageDataUrl).catch((error: unknown) => {
      console.warn('potential-image:storage-failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }) : null

    return {
      imageDataUrl,
      imageUrl: storedImage?.imageUrl ?? null,
      imageStorageKey: storedImage?.imageStorageKey ?? null,
      model: env.OPENAI_IMAGE_MODEL,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(504, 'GPT Image generation timed out', 'provider_error')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function buildPotentialImagePrompt(data: PotentialImageInput) {
  const focusAreas = data.focusAreas.length
    ? `Prioritize: ${data.focusAreas.join(', ')}.`
    : 'Prioritize facial harmony, grooming, skin, hair, and presentation.'
  const summary = data.summary ? `Report notes: ${data.summary}` : ''

  return [
    'Create a realistic glow-up projection of this exact person.',
    'Keep identity, facial structure, age, ethnicity, pose, camera angle, crop, and background the same.',
    focusAreas,
    summary,
    'Make them noticeably better and refreshed, but still believable: clearer healthier skin, less fatigue, slightly more refined visible features, better grooming, flattering hair shape/color, subtle makeup if suitable, and improved lighting/contrast.',
    'Choose hairstyle, color, makeup, and grooming changes that fit their head shape, coloring, facial proportions, and visible feature balance.',
    'Do not alter bone structure, eye color, nose, lips, body weight, or make them look like a different person.',
  ].filter(Boolean).join('\n')
}

function dataUrlToFile(dataUrl: string, name: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new ApiError(400, 'Invalid image data URL')
  const mimeType = match[1]
  const extension = mimeType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  return new File([buffer], `${name}.${extension}`, { type: mimeType })
}

function parseOpenAiImageResponse(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function readOpenAiError(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const error = (value as Record<string, unknown>).error
  if (!error || typeof error !== 'object') return null
  const message = (error as Record<string, unknown>).message
  return typeof message === 'string' ? message : null
}

function readGeneratedImageDataUrl(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const data = (value as Record<string, unknown>).data
  if (!Array.isArray(data)) return null

  const first = data[0]
  if (!first || typeof first !== 'object') return null
  const image = first as Record<string, unknown>
  const b64Json = image.b64_json
  if (typeof b64Json === 'string' && b64Json.length > 0) {
    return `data:image/png;base64,${b64Json}`
  }

  const url = image.url
  return typeof url === 'string' && url.length > 0 ? url : null
}
