import { expect, test } from 'bun:test'
import { alignSpeechWords, geminiWordTimes, deliverySchema, geminiSpeechRequest, pcmWave, voiceDirection, voiceDirectionSchema } from './video-speech'
import { assembleSpeech, speechBrief } from './video-voiceover'
import { compileAnalysisVideo, parseComposition } from './video-composition'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import { scriptRevision } from './video-script'
import { compileMobileFaceStudy } from './mobile-face-study'

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

test('private portrait chapters retain measured speech cues on the local audio clock', () => {
  const composition = compileMobileFaceStudy({
    version: 1, source: 'apple-vision', confidence: .9, image: { width: 600, height: 800 },
    anchors: { leftPupil: { x: .3, y: .4 }, rightPupil: { x: .7, y: .4 } },
  }, 'portrait', { goals: ['eyes', 'jaw'], returning: false, protocolTaskKeys: ['brow-set', 'unrecognized', 'gentle-cleanser'], checkIn: { change: 'same', effort: 'too-much' } })
  const segments = composition.scenes.map((scene, index) => ({
    sceneId: scene.id, pcm: new Uint8Array(48000 * (index + 1)),
    words: index === 0 ? [{ text: 'Before', startMs: 100, endMs: 250 }] : undefined,
  }))
  const { composition: narrated } = assembleSpeech(composition, segments)
  expect(narrated.scenes.every(scene => scene.source.kind === 'portrait' && scene.source.hideScores)).toBe(true)
  expect(narrated.scenes[1].startMs).toBe(1500)
  expect(narrated.scenes[2].startMs).toBe(4000)
  expect(narrated.scenes[0].words).toEqual(segments[0].words)
  expect(narrated.scenes[1].words).toBeUndefined()
  expect(narrated.scenes[0].portraitProgram?.actions[0].labelWord).toBeGreaterThan(0)
  expect(narrated.scenes.at(-1)?.narration).toContain('spoolie step in your Protocol')
  expect(narrated.scenes[0].narration).toContain('the frame around your eyes and your jawline')
  expect(narrated.scenes.at(-1)?.narration).toContain('starting to feel like too much')
  expect(narrated.scenes.at(-1)?.narration).not.toContain('gentle cleanser step')
  expect(narrated.scenes.at(-1)?.narration).not.toContain('unrecognized')
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


test('measured captions preserve approved decimal and brand tokens across ASR word splits',()=>{
  const raw=['Mugging','dot','com','rates','it','seven','point','five'].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}))
  expect(alignSpeechWords('Mogging.com rates it 7.5.',raw)).toEqual([{text:'Mogging.com',startMs:0,endMs:300},{text:'rates',startMs:300,endMs:400},{text:'it',startMs:400,endMs:500},{text:'7.5',startMs:500,endMs:800}])
  expect(()=>alignSpeechWords('Mogging.com rates it 8.',raw)).toThrow('differ')
})


test('rounded transcription endpoints stop at real audio duration without accepting unrelated timestamps',()=>{
  const words=[{text:'Hello',start_offset:'0s',end_offset:'1.0s'}]
  expect(geminiWordTimes(words,960,'Hello')).toEqual([{text:'Hello',startMs:0,endMs:960}])
  expect(()=>geminiWordTimes(words,600,'Hello')).toThrow('outside the audio')
})


test('the verified brand ASR spelling keeps the approved caption word',()=>{
  expect(alignSpeechWords('Mogging gives this example 7.5 out of ten.',[
    {text:'Marging',startMs:200,endMs:600},{text:'gives',startMs:600,endMs:800},{text:'this',startMs:800,endMs:900},{text:'example',startMs:900,endMs:1400},{text:'7.5',startMs:1400,endMs:2200},{text:'out',startMs:2200,endMs:2300},{text:'of',startMs:2300,endMs:2400},{text:'10.',startMs:2400,endMs:2600}
  ]).map(word=>word.text)).toEqual(['Mogging','gives','this','example','7.5','out','of','ten'])
})


test('forced alignment tolerates only a small brand spelling error, never a different score or ordinary word',()=>{
  expect(alignSpeechWords('Mogging scores 7.5.',[{text:'Mocking',startMs:0,endMs:300},{text:'scores',startMs:300,endMs:600},{text:'7.5',startMs:600,endMs:1100}])[0]).toEqual({text:'Mogging',startMs:0,endMs:300})
  expect(()=>alignSpeechWords('Jaw scores 7.5.',[{text:'Saw',startMs:0,endMs:300},{text:'scores',startMs:300,endMs:600},{text:'7.5',startMs:600,endMs:1100}])).toThrow('differ')
  expect(()=>alignSpeechWords('Mogging scores 7.5.',[{text:'Mocking',startMs:0,endMs:300},{text:'scores',startMs:300,endMs:600},{text:'8',startMs:600,endMs:1100}])).toThrow('differ')
})
