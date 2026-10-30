import { z } from 'zod'
import { arrangeVideoScenes, ensureEarlyAppProof, parseComposition, retimeVideoScene, spokenWordSchema, type VideoComposition, type VideoScene } from './video-composition'
import { pcmWave, voiceDirection } from './video-speech'
import { normalizedScriptWord, scriptTokens, scriptWords } from './video-script'

const alignmentSchema = z.object({ words: z.array(spokenWordSchema).min(1).max(5000), scriptRevision: z.string().optional(), audioSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), provider: z.enum(['google-stt', 'imported']).optional() }).strict()
const tokens = (text: string) => scriptTokens(text).map(word => word.text)
const normalized = normalizedScriptWord

export type VideoVoiceover = { file: Blob; name: string; url: string; buffer: AudioBuffer }

export function sceneSpeechWords(scene: Pick<VideoScene, 'words' | 'narration' | 'durationMs'>) {
  if (scene.words?.length) return scene.words
  const words = scene.narration.split(/\s+/).filter(Boolean), step = Math.max(1, scene.durationMs - 300) / Math.max(1, words.length)
  return words.map((text, index) => ({ text, startMs: 150 + index * step, endMs: 150 + (index + 1) * step }))
}

export function captionWordCues(scene: Pick<VideoScene, 'words' | 'narration' | 'durationMs'>, text: string) {
  const speech = sceneSpeechWords(scene), words = text.split(/\s+/).filter(Boolean)
  let cursor = 0, previousStart = 0
  return words.map((text, index) => {
    const count = Math.max(1, tokens(text).length)
    const match = speech.findIndex((_, position) => position >= cursor && normalized(speech.slice(position, position + count).map(word => word.text).join(' ')) === normalized(text))
    const first = speech[match >= 0 ? match : Math.floor(index / Math.max(1, words.length) * speech.length)]
    const spoken = first && match >= 0 ? { ...first, endMs: speech[Math.min(speech.length - 1, match + count - 1)].endMs } : first
    if (match >= 0) cursor = match + count
    const startMs = Math.max(previousStart, spoken?.startMs ?? index * scene.durationMs / Math.max(1, words.length))
    previousStart = startMs
    return { text, startMs, endMs: Math.max(startMs + 100, spoken?.endMs ?? startMs + 400), matched: match >= 0 && Boolean(scene.words?.length) }
  })
}

export function actionMentionEnd(scene: Pick<VideoScene, 'words' | 'narration' | 'durationMs'>, text: string): number | null {
  const meaningful = (value: string) => tokens(value).map(normalized).filter(word => word.length > 3 && !['your', 'with', 'this', 'that', 'each', 'every', 'have', 'into', 'from', 'keep'].includes(word))
  const wanted = new Set(meaningful(text)), speech = sceneSpeechWords(scene)
  const matched = speech.filter(word => wanted.has(normalized(word.text)))
  const distinct = new Set(matched.map(word => normalized(word.text)))
  return distinct.size >= Math.min(2, wanted.size) && wanted.size > 0 ? matched.at(-1)!.endMs : null
}

export async function decodeVoiceover(file: Blob, name: string): Promise<VideoVoiceover> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a voiceover below 20 MB')
  const context = new OfflineAudioContext(2, 1, 48000)
  const buffer = await context.decodeAudioData(await file.arrayBuffer())
  if (buffer.duration <= 0 || buffer.duration > 180 || buffer.numberOfChannels > 2) throw new Error('Use a mono or stereo voiceover under three minutes')
  return { file, name, buffer, url: URL.createObjectURL(file) }
}

export function alignVideoVoiceover(composition: VideoComposition, value: unknown, durationMs: number, audioSha256?: string): VideoComposition {
  if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 180000) throw new Error('Voiceover must be between 0.1 and 180 seconds')
  if (!composition.script) composition = arrangeVideoScenes(composition, composition.scenes)
  const alignment = alignmentSchema.parse(value), original = scriptWords(composition.script!)
  if (alignment.scriptRevision && alignment.scriptRevision !== composition.script!.revision) throw new Error('This transcript belongs to a stale script revision. Transcribe the current recording again.')
  if (alignment.audioSha256 && alignment.audioSha256 !== audioSha256) throw new Error('These timestamps belong to a different audio file.')
  if (alignment.words.some(word => tokens(word.text).length !== 1)) throw new Error('Supply one spoken word per timestamp, not sentence spans.')
  if (alignment.words.some((word, index) => word.wordId && word.wordId !== original[index]?.id)) throw new Error('Transcript word IDs do not match the original script.')
  const words = alignment.words.map((word, index) => ({ ...word, wordId: original[index]?.id }))
  let previousEnd = 0
  for (const word of words) {
    if (!normalized(word.text) || word.startMs < previousEnd || word.endMs <= word.startMs || word.endMs > durationMs) throw new Error('Word timestamps must be ordered, non-overlapping and within the audio')
    previousEnd = word.endMs
  }
  let cursor = 0
  const groups = composition.scenes.map(scene => {
    const expected = tokens(scene.narration).map(normalized)
    if (!expected.length) throw new Error(`Add narration to ${scene.label} before aligning`)
    const start = cursor
    const spoken: string[] = []
    while (spoken.length < expected.length && cursor < words.length) spoken.push(...tokens(words[cursor++].text).map(normalized))
    if (spoken.join(' ') !== expected.join(' ')) throw new Error(`Voiceover does not match the script at “${scene.narration.slice(0, 60)}”. Recut from the spoken script first.`)
    return words.slice(start, cursor)
  })
  if (cursor !== words.length) throw new Error('The voiceover contains words after the end of this script')
  return parseComposition(ensureEarlyAppProof({ ...composition, recording: { scriptRevision: composition.script!.revision, audioSha256, provider: alignment.provider ?? 'imported', words: words.map(word => ({ wordId: word.wordId!, startMs: word.startMs, endMs: word.endMs })) }, timing: 'words', durationMs, scenes: composition.scenes.map((scene, index) => {
    const startMs = index === 0 ? 0 : groups[index][0].startMs
    const endMs = groups[index + 1]?.[0].startMs ?? durationMs
    if (endMs - startMs < 100) throw new Error('Two scene cuts are less than 100 ms apart. Combine the short script cues first.')
    const retimed = retimeVideoScene(scene, endMs - startMs)
    const localWords = groups[index].map(word => ({ ...word, startMs: word.startMs - startMs, endMs: word.endMs - startMs }))
    return { ...retimed, startMs, words: localWords, tracks: retimed.tracks.map(track => {
      const wordIndex = track.wordIndex ?? (['text', 'overlay', 'report'].includes(track.target) ? 0 : undefined)
      if (wordIndex === undefined) return track
      const word = localWords[wordIndex]
      if (!word) throw new Error(`A spoken cue in ${scene.label} points beyond its narration`)
      return { ...track, wordIndex, wordId: word.wordId, startMs: word.startMs, durationMs: Math.min(track.durationMs, endMs - startMs - word.startMs) }
    }) }
  }) }))
}

export function narrationText(composition: VideoComposition) {
  if (composition.script) return composition.script.cues.map(cue => cue.text).join('\n\n')
  const cues: string[] = []
  let previousCue = ''
  for (const scene of composition.scenes) {
    if (!scene.narration) continue
    if (scene.cueId && scene.cueId === previousCue) cues[cues.length - 1] += ` ${scene.narration}`
    else cues.push(scene.narration)
    previousCue = scene.cueId
  }
  return cues.join('\n\n')
}

export function speechBrief(composition: VideoComposition) {
  return { version: 1, model: 'gemini-3.8-flash-tts', script: composition.script, scriptWords: composition.script ? scriptWords(composition.script) : undefined, recording: composition.recording, voice: composition.voice ?? voiceDirection('editorial'), timing: composition.timing ?? 'estimated', note: 'Script is authoritative; scenes are projections. Recorded word IDs drive all aligned timing.', scenes: composition.scenes.map(scene => ({ id: scene.id, cueId: scene.cueId, scriptRange: scene.scriptRange, text: scene.narration, delivery: scene.delivery, imageId: scene.source.imageId, category: scene.source.categoryId, startMs: scene.startMs, endMs: scene.startMs + scene.durationMs, words: scene.words })) }
}

export function assembleSpeech(composition: VideoComposition, segments: Array<{ sceneId: string; pcm: Uint8Array; words?: Array<{ text: string; startMs: number; endMs: number }> }>) {
  if (segments.length !== composition.scenes.length) throw new Error('Speech segments must match the complete scene list')
  const chunks: Uint8Array[] = []
  let startMs = 0
  const observed: Array<{ text: string; startMs: number; endMs: number }> = []
  const scenes = composition.scenes.map((scene, index) => {
    const segment = segments[index]
    if (segment.sceneId !== scene.id || !segment.pcm.length || segment.pcm.length % 2) throw new Error('Speech segment identity or PCM data does not match')
    const pause = new Uint8Array(Math.round((scene.delivery?.pauseAfterMs ?? 120) * 48))
    const durationMs = (segment.pcm.length + pause.length) / 48
    if (durationMs < 100 || durationMs > 40000) throw new Error('Speech segment duration is outside the supported range')
    chunks.push(segment.pcm, pause)
    for (const word of segment.words ?? []) observed.push({ ...word, startMs: startMs + word.startMs, endMs: startMs + word.endMs })
    const retimed = retimeVideoScene(scene, durationMs)
    const next = { ...retimed, startMs, words: undefined, tracks: retimed.tracks.map(track => ({ ...track, wordId: undefined })) }
    startMs += durationMs
    return next
  })
  const next = parseComposition(ensureEarlyAppProof({ ...composition, recording: undefined, scenes, durationMs: startMs, timing: 'segments' }))
  return { composition: next, file: new Blob([pcmWave(chunks)], { type: 'audio/wav' }), transcript: speechBrief(next), alignment: segments.every(segment => segment.words?.length) ? { scriptRevision: composition.script?.revision, provider: 'google-stt' as const, words: observed } : undefined }
}

// Change the visual recipe without throwing away the recording's clock.
export function retainVideoVoiceover(source: VideoComposition, target: VideoComposition, durationMs: number): VideoComposition {
  if (!source.script || !target.script || narrationText(source) !== narrationText(target)) throw new Error('Approve and record the changed script before reusing its voiceover.')
  if (source.recording) {
    const words = scriptWords(source.script)
    return alignVideoVoiceover(target, { words: source.recording.words.map((word, index) => ({ text: words[index].text, startMs: word.startMs, endMs: word.endMs })), provider: source.recording.provider }, durationMs, source.recording.audioSha256)
  }
  if (source.timing !== 'segments') throw new Error('Align this recording before changing its visual style.')
  const starts = new Map<string, number>()
  for (const scene of source.scenes) {
    const range = scene.scriptRange
    if (!range?.wordCount) throw new Error('This recording has no script clock. Align it before changing styles.')
    for (let index = 0; index < range.wordCount; index++) starts.set(`${range.cueId}/${range.startWord + index}`, scene.startMs + index / range.wordCount * scene.durationMs)
  }
  const cuts = target.scenes.map((scene, index) => index === 0 ? 0 : starts.get(`${scene.scriptRange?.cueId}/${scene.scriptRange?.startWord}`))
  if (cuts.some(cut => cut === undefined)) throw new Error('This recording does not cover every scene in the selected style.')
  return parseComposition(ensureEarlyAppProof({ ...target, recording: undefined, timing: 'segments', durationMs, scenes: target.scenes.map((scene, index) => {
    const startMs = cuts[index]!, length = (cuts[index + 1] ?? durationMs) - startMs
    if (length < 100) throw new Error('A new shot is too short for this recording. Combine its script cues first.')
    return { ...retimeVideoScene(scene, length), startMs, words: undefined }
  }) }))
}
