import { expect, test } from 'bun:test'
import { bindScriptScenes, createVideoScript, scriptRevision, scriptWords } from './video-script'
import { compileAnalysisVideo, parseComposition } from './video-composition'
import { alignVideoVoiceover, assembleSpeech, captionWordCues } from './video-voiceover'
import { googleWordTimes } from './video-speech'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import { subjectStudies } from './video-subject-studies'

const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample', hook: '', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: '' }
const build = () => compileAnalysisVideo(scriptToPlan('The cheeks create width. The jaw narrows.'), input, ['face'], 'brand', [], { recipe: 'portrait-audit' })

test('subject narration explains relationships rather than reading production directions', () => {
  for (const study of subjectStudies) {
    expect(study.script).not.toMatch(/\b(camera|zoom|crop|pan|cut to|fade|return to the photo|our report demo)\b/i)
    expect(study.durationSeconds).toBeGreaterThanOrEqual(40)
    expect(study.durationSeconds).toBeLessThanOrEqual(70)
    expect(new Set(Object.values(study.directions ?? {}).map(direction => direction.imageId).filter(Boolean)).size).toBe(3)
  }
})

test('unchanged cues retain original word IDs across preceding edits; script edits invalidate the revision', () => {
  const original = createVideoScript([{ id: 'a', narration: 'The cheeks create width.' }])
  const revised = createVideoScript([{ id: 'intro', narration: 'An entirely new introduction.' }, { id: 'b', narration: 'The cheeks create width.' }])
  expect(scriptWords(original).map(word => word.id)).toEqual(scriptWords(revised).slice(-4).map(word => word.id))
  expect(original.revision).not.toBe(revised.revision)
  expect(scriptRevision(original.cues)).toBe(original.revision)
  expect(() => bindScriptScenes(original, [{ cueId: 'a', narration: 'The cheeks are different.' }])).toThrow('approved script')
})

test('one measured recording binds original words to captions, cuts and spoken motion without rewriting the script', () => {
  const composition = build(), original = structuredClone(composition.script)
  const words = scriptWords(composition.script!).map((word, index) => ({ text: word.text, startMs: 200 + index * 400, endMs: 400 + index * 400 }))
  const hash = 'a'.repeat(64), durationMs = words.at(-1)!.endMs + 300
  const result = alignVideoVoiceover(composition, { scriptRevision: composition.script!.revision, audioSha256: hash, provider: 'google-stt', words }, durationMs, hash)
  expect(result.script).toEqual(original)
  expect(result.recording!.words.map(word => word.wordId)).toEqual(scriptWords(original!).map(word => word.id))
  expect(result.scenes[1].startMs).toBe(words[4].startMs)
  for (const scene of result.scenes) for (const track of scene.tracks.filter(track => track.wordId)) {
    expect(track.startMs).toBe(scene.words!.find(word => word.wordId === track.wordId)!.startMs)
  }
  expect(() => alignVideoVoiceover(composition, { words, scriptRevision: 'old' }, durationMs)).toThrow('stale script')
  expect(() => alignVideoVoiceover(composition, { words, audioSha256: hash }, durationMs, 'b'.repeat(64))).toThrow('different audio')
  const tampered = structuredClone(result)
  tampered.scenes[0].words![0].startMs += 10
  expect(() => parseComposition(tampered)).toThrow('word clock')
  const changed = structuredClone(composition)
  changed.scenes[0].narration += ' Extra.'
  expect(() => parseComposition(changed)).toThrow('original script')
})

test('Google audio offsets are merged on the actual sample clock, including authored pauses', () => {
  const composition = build()
  const segments = composition.scenes.map(scene => ({ sceneId: scene.id, pcm: new Uint8Array(96000), words: googleWordTimes({ results: [{ alternatives: [{ words: scene.narration.match(/[A-Za-z]+/g)!.map((word, index) => ({ word, startTime: `${index * .2}s`, endTime: `${index * .2 + .1}s` })) }] }] }, 2000) }))
  const generated = assembleSpeech(composition, segments)
  const result = alignVideoVoiceover(generated.composition, generated.alignment, generated.composition.durationMs)
  expect(result.timing).toBe('words')
  expect(result.recording!.words[4].startMs).toBe(2120)
  expect(() => googleWordTimes({ results: [] }, 2000)).toThrow()
})

test('hyphenated display words span the measured original words rather than using a guessed fallback', () => {
  const cues = captionWordCues({ narration: 'The lower-face contour.', durationMs: 3000, words: [{ text: 'The', startMs: 0, endMs: 200 }, { text: 'lower', startMs: 300, endMs: 600 }, { text: 'face', startMs: 650, endMs: 900 }, { text: 'contour', startMs: 1000, endMs: 1300 }] }, 'The lower-face contour.')
  expect(cues[1]).toMatchObject({ matched: true, startMs: 300, endMs: 900 })
})

test('fast recorded cues retain a continuous early app-proof window without rewriting original words', () => {
  const composition = compileAnalysisVideo(scriptToPlan(Array.from({ length: 12 }, () => 'The cheeks frame the face.').join('\n')), input, ['face'], 'brand', [], { recipe: 'portrait-audit' })
  const words = scriptWords(composition.script!).map((word, index) => ({ text: word.text, startMs: index * 250, endMs: index * 250 + 200 }))
  const aligned = alignVideoVoiceover(composition, { words }, words.at(-1)!.endMs + 100)
  expect(aligned.script).toEqual(composition.script)
  let proofMs = 0
  for (const scene of aligned.scenes) {
    if (scene.source.kind !== 'report') break
    proofMs += scene.durationMs
  }
  expect(proofMs).toBeGreaterThanOrEqual(2600)
  expect(proofMs).toBeLessThan(10000)
  expect(aligned.recording!.words).toHaveLength(words.length)
})
