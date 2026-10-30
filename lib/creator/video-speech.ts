import { z } from 'zod'

export const voicePresets = {
  editorial: { label: 'Contained, upbeat expert', voice: 'Puck' as const, direction: 'An engaging editorial face-analysis narrator. Measured, precise and quietly commanding, with warm late-night radio texture and a small spark of playful curiosity. Contained upbeat energy, not comedy or hype. Clear scientific vocabulary, conversational phrasing, approximately 175 words per minute. Light emphasis on contrasts; brief reflective pauses. Speak as an independent analyst, never imitate the person pictured.' },
  conversational: { label: 'Warm, conversational guide', voice: 'Algieba' as const, direction: 'Explain one useful observation to a curious friend. Warm, relaxed and specific, about 165 words per minute. Natural contractions and restrained emphasis. Carry the same conversational energy through product mentions; never switch to an advertising voice. Do not imitate the pictured person.' },
  curious: { label: 'Curious visual storyteller', voice: 'Orus' as const, direction: 'A curious documentary storyteller following visible evidence. Open with a genuine question, then resolve it with clear observations. Conversational, purposeful and lightly animated, about 165 words per minute. No artificial cliffhangers, hype or celebrity imitation. Product mentions should feel like part of the demonstration.' },
  expert: { label: 'Professional anatomy analyst', voice: 'Charon' as const, direction: 'A calm, knowledgeable documentary analyst explaining visible facial structure. Precise, grounded and quietly authoritative. Medium-low energy with purposeful emphasis, clean articulation and approximately 155 words per minute. Distinguish visible contours from underlying anatomy. No dramatic trailer delivery, gravelly celebrity impression or sales pitch. Speak as an independent expert, never imitate the person pictured.' },
} as const
export const voiceDirectionSchema = z.object({ preset: z.enum(['editorial', 'expert', 'conversational', 'curious']), voice: z.enum(['Puck', 'Charon', 'Algieba', 'Orus', 'Iapetus', 'Kore', 'en-us-koda', 'en-us-brio', 'en-us-knox', 'en-us-fola', 'en-us-zali']), direction: z.string().trim().min(1).max(1800) }).strict()
export const deliverySchema = z.object({ direction: z.string().max(400).default(''), emphasis: z.array(z.string().min(1).max(80)).max(8).default([]), pauseAfterMs: z.number().int().min(0).max(1000).default(120) }).strict()
export type VoiceDirection = z.infer<typeof voiceDirectionSchema>
export type SpeechDelivery = z.infer<typeof deliverySchema>
export function voiceDirection(preset: keyof typeof voicePresets): VoiceDirection {
  return { preset, voice: voicePresets[preset].voice, direction: voicePresets[preset].direction }
}
export function speechStyle(voice: VoiceDirection, delivery?: SpeechDelivery) {
  return [voice.direction, delivery?.direction, delivery?.emphasis.length ? `Gently emphasize: ${delivery.emphasis.join('; ')}.` : ''].filter(Boolean).join(' ')
}
export function geminiSpeechRequest(text: string, voice: VoiceDirection, delivery?: SpeechDelivery) {
  return { model: 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: speechStyle(voice, delivery) }] }] }], response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 }, generation_config: { speech_config: [{ voice: voice.voice }] }, store: false }
}

export function pcmWave(chunks: Uint8Array[], sampleRate = 24000) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  if (!size || size % 2 || size > sampleRate * 2 * 180) throw new Error('Use valid mono 16-bit PCM below three minutes')
  const output = new Uint8Array(44 + size), view = new DataView(output.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, size, true)
  let offset = 44
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

export function googleWordTimes(value: unknown, durationMs: number) {
  const timestamp = z.string().regex(/^\d+(?:\.\d+)?s$/)
  const response = z.object({ results: z.array(z.object({ alternatives: z.array(z.object({ words: z.array(z.object({ word: z.string().min(1), startTime: timestamp.default('0s'), endTime: timestamp })) })).min(1) })).min(1) }).parse(value)
  const words = response.results.flatMap(result => result.alternatives[0].words.map(word => ({ text: word.word, startMs: Number(word.startTime.slice(0, -1)) * 1000, endMs: Number(word.endTime.slice(0, -1)) * 1000 })))
  let previous = 0
  for (const word of words) {
    if (word.startMs < previous || word.endMs <= word.startMs || word.endMs > durationMs + .01) throw new Error('Recognition returned invalid word boundaries; review the recording.')
    previous = word.endMs
  }
  if (!words.length) throw new Error('No spoken words were recognized.')
  return words
}
