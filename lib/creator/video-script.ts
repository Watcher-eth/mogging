import { z } from 'zod'
import { deliverySchema } from './video-speech'
import { semanticSectionSchema } from './video-semantics'

export const scriptTokens = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+(?:['’.][\p{L}\p{N}]+)*/gu)].map(match => ({ text: match[0], offset: match.index }))
export const normalizedScriptWord = (text: string) => scriptTokens(text).map(word => word.text).join('').normalize('NFKC').toLocaleLowerCase('en').replace(/’/g, "'")
const fingerprint = (text: string) => {
  let hash = BigInt('0xcbf29ce484222325')
  for (const character of text) hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0)!)) * BigInt('0x100000001b3'))
  return hash.toString(16).padStart(16, '0')
}
// Stable choices across preview/export and section reordering; no runtime randomness.
export function scriptVisualSeed(...parts: string[]) {
  const hash = fingerprint(parts.join('\0'))
  let seed = Number.parseInt(hash.slice(0, 8), 16) ^ Number.parseInt(hash.slice(8), 16)
  // Mix both halves so similar names and text do not share low-bit/parity patterns.
  seed = Math.imul(seed ^ seed >>> 16, 0x85ebca6b)
  seed = Math.imul(seed ^ seed >>> 13, 0xc2b2ae35)
  return (seed ^ seed >>> 16) >>> 0
}

export const sectionVisualSchema = z.object({
  treatment: z.enum(['portrait', 'detail', 'measurement', 'profile', 'lighting', 'comparison', 'report', 'grid']),
  categoryId: z.string().min(1).max(80), focus: z.string().max(160).optional(),
  view: z.enum(['front', 'three-quarter', 'profile']).default('front'),
  reason: z.string().min(1).max(300),
  styles: z.array(z.enum(['portrait-audit', 'report-led', 'measurement-explainer', 'hybrid-story', 'minimal-explainer', 'feature-study'])).max(6).optional(),
}).strict()
export const scriptSectionSchema = z.object({
  id: z.string().min(1).max(80), title: z.string().min(1).max(100),
  role: z.enum(['hook', 'explanation', 'cta', 'product', 'takeaway']),
  priority: z.number().int().min(0).max(100).default(50),
  dependsOn: z.array(z.string().min(1).max(80)).max(12).default([]),
  visuals: z.array(sectionVisualSchema).min(1).max(12),
  semantic: semanticSectionSchema.optional(),
}).strict()
export type ScriptSection = z.infer<typeof scriptSectionSchema>
export const scriptReferenceSchema = z.object({ id: z.string().min(1).max(80), url: z.url().max(2000).optional(), title: z.string().min(1).max(160), transcript: z.string().max(12000).optional(), notes: z.string().max(3000), status: z.enum(['notes-only', 'transcript-reviewed']) }).strict()
export const scriptSchema = z.object({ version: z.literal(1), revision: z.string().max(80), promotion: z.enum(['early-score', 'contextual']).optional(), cues: z.array(z.object({ id: z.string().max(100), sourceId: z.string().max(160), text: z.string().min(1).max(5000), delivery: deliverySchema.optional(), section: scriptSectionSchema.optional() }).strict()).min(1).max(250), references: z.array(scriptReferenceSchema).max(20).optional() }).strict().superRefine((script, context) => {
  if (script.revision !== scriptRevision(script.cues)) context.addIssue({ code: 'custom', path: ['revision'], message: 'Script revision does not match its approved content and delivery' })
  if (new Set(script.cues.map(cue => cue.id)).size !== script.cues.length) context.addIssue({ code: 'custom', path: ['cues'], message: 'Script cue IDs must be unique' })
})
export type VideoScript = z.infer<typeof scriptSchema>
export const scriptRangeSchema = z.object({ cueId: z.string().max(100), startWord: z.number().int().min(0), wordCount: z.number().int().min(0), startChar: z.number().int().min(0), endChar: z.number().int().min(0) }).strict()
export const recordingSchema = z.object({ scriptRevision: z.string().max(80), audioSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), provider: z.enum(['google-stt', 'imported']), words: z.array(z.object({ wordId: z.string().max(140), startMs: z.number().finite().min(0), endMs: z.number().finite().min(0) }).strict()).max(5000) }).strict()
export function scriptRevision(cues: Array<{ id: string; text: string; delivery?: z.infer<typeof deliverySchema> }>) {
  return `script-${fingerprint(JSON.stringify(cues.map(cue => ({ id: cue.id, text: cue.text, delivery: cue.delivery ? deliverySchema.parse(cue.delivery) : undefined }))))}`
}
export function createVideoScript(cues: Array<{ id: string; narration: string; delivery?: z.infer<typeof deliverySchema> }>): VideoScript {
  const occurrences = new Map<string, number>()
  const result = cues.filter(cue => cue.narration.trim()).map(cue => {
    const text = cue.narration.replace(/\s+/g, ' ').trim(), key = fingerprint(text), occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    return { id: `cue-${key}-${occurrence}`, sourceId: cue.id, text, delivery: cue.delivery }
  })
  return { version: 1, revision: scriptRevision(result), cues: result }
}
export function scriptWords(script: VideoScript) {
  return script.cues.flatMap(cue => scriptTokens(cue.text).map((word, index) => ({ ...word, id: `${cue.id}/word:${index}`, cueId: cue.id, index })))
}
export function bindScriptScenes<Scene extends { cueId: string; narration: string }>(script: VideoScript, scenes: Scene[]) {
  const cursors = new Map<string, number>()
  const characters = new Map<string, number>()
  return scenes.map(scene => {
    const cue = script.cues.find(cue => cue.sourceId === scene.cueId)
    if (!cue) throw new Error('A scene has no original script cue')
    const startWord = cursors.get(cue.id) ?? 0, wordCount = scriptTokens(scene.narration).length
    const startChar = cue.text.indexOf(scene.narration.replace(/\s+/g, ' ').trim(), characters.get(cue.id) ?? 0)
    if (startChar < 0) throw new Error('A scene changed the approved script wording')
    const endChar = startChar + scene.narration.replace(/\s+/g, ' ').trim().length
    characters.set(cue.id, endChar)
    cursors.set(cue.id, startWord + wordCount)
    return { ...scene, scriptRange: { cueId: cue.id, startWord, wordCount, startChar, endChar } }
  })
}
export async function audioFingerprint(file: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
