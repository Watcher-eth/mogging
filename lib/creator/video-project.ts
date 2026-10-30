import { z } from 'zod'
import { audioFingerprint } from './video-script'
import { faceLandmarksPayloadSchema } from '@/lib/analysis/landmarks'
import { buildZip } from './export-slides'
import type { GeneratorImage } from './content-generator'
import { parseComposition, videoImageIds, type VideoComposition } from './video-composition'

const MAX_PROJECT_BYTES = 80 * 1024 * 1024
const manifestSchema = z.array(z.object({
  id: z.string().min(1).max(100), name: z.string().max(300), width: z.number().positive().max(20000), height: z.number().positive().max(20000),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']), path: z.string().max(200),
  landmarks: faceLandmarksPayloadSchema.extend({ source: z.enum(['mediapipe-face-landmarker', 'apple-vision', 'google-mlkit', 'kimi-vision-estimate', 'demo-static']) }).nullable(),
})).max(100)

export async function packVideoProject(composition: VideoComposition, images: GeneratorImage[], voiceover?: { file: Blob; name: string }) {
  parseComposition(composition)
  if (composition.recording?.audioSha256 && (!voiceover || await audioFingerprint(voiceover.file) !== composition.recording.audioSha256)) throw new Error('The recording clock belongs to a different or missing audio file')
  const ids = videoImageIds(composition.scenes)
  const assets = images.filter(image => ids.has(image.id))
  if (assets.length !== ids.size) throw new Error('Some project assets are missing')
  const entries = await Promise.all(assets.map(async (image, index) => {
    const response = await fetch(image.dataUrl)
    if (!response.ok) throw new Error(`Could not load ${image.name}`)
    const data = new Uint8Array(await response.arrayBuffer())
    const mimeType = imageMime(data)
    return { file: { name: `assets/${index}.image`, data }, metadata: { id: image.id, name: image.name, width: image.width, height: image.height, landmarks: image.landmarks, mimeType, path: `assets/${index}.image` } }
  }))
  const encoder = new TextEncoder()
  const files = entries.map(entry => entry.file)
  files.push({ name: 'composition.json', data: encoder.encode(JSON.stringify(composition, null, 2)) })
  files.push({ name: 'assets.json', data: encoder.encode(JSON.stringify(entries.map(entry => entry.metadata))) })
  if (voiceover) {
    files.push({ name: 'voiceover.audio', data: new Uint8Array(await voiceover.file.arrayBuffer()) })
    files.push({ name: 'voiceover.json', data: encoder.encode(JSON.stringify({ name: voiceover.name, type: voiceover.file.type })) })
  }
  if (files.reduce((sum, file) => sum + file.data.length, 0) > MAX_PROJECT_BYTES) throw new Error('Keep project assets below 80 MB')
  return buildZip(files)
}

// The built-in packer writes uncompressed ZIP entries. Parse only that format;
// no extraction to disk, remote URLs, or arbitrary filenames are executed.
export async function unpackVideoProject(blob: Blob) {
  if (blob.size > MAX_PROJECT_BYTES) throw new Error('Choose a project ZIP below 80 MB')
  const buffer = await blob.arrayBuffer(), bytes = new Uint8Array(buffer), view = new DataView(buffer)
  const files = new Map<string, Uint8Array>(), decoder = new TextDecoder()
  let offset = 0
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (offset + 30 > bytes.length) throw new Error('Incomplete project ZIP header')
    const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true), size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true)
    const start = offset + 30 + nameLength + extraLength, end = start + size
    if (flags !== 0 || method !== 0 || end > bytes.length || files.size >= 104) throw new Error('Use an unmodified project ZIP exported by Mogging')
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength))
    if (files.has(name)) throw new Error('Duplicate project ZIP entry')
    files.set(name, bytes.slice(start, end)); offset = end
  }
  const compositionBytes = files.get('composition.json'), manifestBytes = files.get('assets.json')
  if (!compositionBytes || !manifestBytes || compositionBytes.length > 2 * 1024 * 1024 || manifestBytes.length > 5 * 1024 * 1024) throw new Error('Project is missing its composition or asset manifest')
  const composition = parseComposition(JSON.parse(decoder.decode(compositionBytes)))
  const manifest = manifestSchema.parse(JSON.parse(decoder.decode(manifestBytes)))
  const images: GeneratorImage[] = []
  const objectUrls: string[] = []
  try {
    for (const entry of manifest) {
      const data = files.get(entry.path)
      if (!data || imageMime(data) !== entry.mimeType) throw new Error(`Missing or invalid image: ${entry.name}`)
      const dataUrl = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: entry.mimeType }))
      objectUrls.push(dataUrl)
      images.push({ id: entry.id, name: entry.name, width: entry.width, height: entry.height, landmarks: entry.landmarks as GeneratorImage['landmarks'], dataUrl, status: 'ready' })
    }
    const required = videoImageIds(composition.scenes)
    if (required.size !== manifest.length || [...required].some(id => !manifest.some(entry => entry.id === id))) throw new Error('Project asset IDs do not match its timeline')
    const audio = files.get('voiceover.audio'), audioMetadata = files.get('voiceover.json')
    if (Boolean(audio) !== Boolean(audioMetadata)) throw new Error('Project voiceover is incomplete')
    let voiceover: { file: Blob; name: string } | undefined
    if (audio && audioMetadata) {
      if (audio.length > 20 * 1024 * 1024 || audioMetadata.length > 2048) throw new Error('Project voiceover is too large')
      const metadata = z.object({ name: z.string().max(300), type: z.string().max(100) }).strict().parse(JSON.parse(decoder.decode(audioMetadata)))
      voiceover = { file: new Blob([new Uint8Array(audio)], { type: metadata.type }), name: metadata.name }
    }
    if (composition.recording?.audioSha256 && (!voiceover || await audioFingerprint(voiceover.file) !== composition.recording.audioSha256)) throw new Error('Project audio does not match its recorded word clock')
    return { composition, images, objectUrls, voiceover }
  } catch (error) { objectUrls.forEach(url => URL.revokeObjectURL(url)); throw error }
}

function imageMime(data: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  if (new TextDecoder().decode(data.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(data.subarray(8, 12)) === 'WEBP') return 'image/webp'
  throw new Error('Project assets must be PNG, JPG or WebP images')
}
