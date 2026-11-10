import { expect, test } from 'bun:test'
import { deliverySchema, geminiSpeechRequest, pcmWave, voiceDirection, voiceDirectionSchema } from './video-speech'
import { assembleSpeech, speechBrief } from './video-voiceover'
import { compileAnalysisVideo, parseComposition } from './video-composition'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import { scriptRevision } from './video-script'

const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample', hook: '', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: '' }

test('Gemini style metadata never contaminates the verbatim transcript or transmits images', () => {
  const request = geminiSpeechRequest('Follow the jaw.', voiceDirection('expert'), deliverySchema.parse({ direction: 'Quiet confidence', emphasis: ['jaw'], pauseAfterMs: 180 }))
  expect(request.input[0].content[0].text).toBe('Follow the jaw.')
  expect(request.input[0].content[0].annotations[0].style).toContain('Quiet confidence')
  expect(request.generation_config.speech_config).toEqual([{ voice: 'Charon' }])
  expect(JSON.stringify(request)).not.toContain('image')
  expect(request.store).toBe(false)
})

test('speech clips retime scenes from PCM sample counts and keep words explicitly estimated', async () => {
  const composition = compileAnalysisVideo(scriptToPlan('Open the eyes. Follow the jaw.'), input, ['face'], 'brand', [])
  composition.voice = voiceDirection('editorial')
  composition.scenes[0].delivery = deliverySchema.parse({ pauseAfterMs: 200 })
  composition.script!.cues[0].delivery = composition.scenes[0].delivery
  composition.script!.revision = scriptRevision(composition.script!.cues)
  const segments = composition.scenes.map(scene => ({ sceneId: scene.id, pcm: new Uint8Array(48000) }))
  const result = assembleSpeech(composition, segments)
  expect(result.composition.scenes[0].durationMs).toBe(1200)
  expect(result.composition.scenes[1].startMs).toBe(1200)
  expect(result.composition.scenes.every(scene => !scene.words)).toBe(true)
  expect(result.composition.timing).toBe('segments')
  expect(parseComposition(result.composition).voice).toEqual(composition.voice)
  const wave = new DataView(await result.file.arrayBuffer())
  expect(wave.getUint32(24, true)).toBe(24000)
  expect(wave.getUint32(40, true) / 48).toBe(result.composition.durationMs)
  expect(speechBrief(result.composition).scenes[0].text).toBe(composition.scenes[0].narration)
  expect(() => assembleSpeech(composition, [])).toThrow('complete scene list')
  expect(() => assembleSpeech(composition, segments.map(segment => ({ ...segment, sceneId: 'wrong' })))).toThrow('identity')
})

test('invalid audio and out-of-range delivery controls fail closed', () => {
  expect(() => pcmWave([new Uint8Array(3)])).toThrow()
  expect(() => pcmWave([])).toThrow()
  expect(() => deliverySchema.parse({ pauseAfterMs: 2000 })).toThrow()
})

// Production voices selected in live auditions must survive recording restore.
test('selected catalog voices survive validation and keep verbatim speech', () => {
  for (const voice of ['Puck', 'Orus', 'Iapetus', 'Kore', 'en-us-koda', 'en-us-brio', 'en-us-knox', 'en-us-fola', 'en-us-zali'] as const) {
    const direction = voiceDirectionSchema.parse({ ...voiceDirection('editorial'), voice })
    const request = geminiSpeechRequest('One feature. One story.', direction)
    expect(request.generation_config.speech_config).toEqual([{ voice }])
    expect(request.input[0].content[0].text).toBe('One feature. One story.')
  }
})
