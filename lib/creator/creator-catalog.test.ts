import { isVideoCta } from './video-branding'
import { portraitEffectsLab } from './video-subject-studies'
import { videoSize } from './video-layout'
import { expect, test } from 'bun:test'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles, creatorStyleDirections, customVideoExample, validateCreatorPhotos } from './creator-catalog'
import { compileAnalysisVideo, parseComposition, type VideoComposition } from './video-composition'
import { scriptToPlan } from './script-edit'
import { scriptWords } from './video-script'
import { alignVideoVoiceover, assembleSpeech, narrationText, retainVideoVoiceover } from './video-voiceover'
import { reportCategories } from './mock-report-data'
import type { AnalysisPostInput } from './analysis-post'

const input: AnalysisPostInput = { formatId: 'feature-audit', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' }
const compile = (script: string, recipe: VideoComposition['recipe']) => compileAnalysisVideo(scriptToPlan(script, 165), input, ['face'], 'brand', reportCategories, { recipe })

test('Full HD validates both orientations and rejects small, invalid or excessive uploads', () => {
  for (const dimensions of [{ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, { width: 3000, height: 3000 }]) expect(() => validateCreatorPhotos([dimensions])).not.toThrow()
  for (const photos of [[], Array(4).fill({ width: 3000, height: 3000 }), [{ width: 1920, height: 1079 }], [{ width: 1080, height: 1919 }], [{ width: NaN, height: 3000 }]]) expect(() => validateCreatorPhotos(photos)).toThrow()
})

test('all launch subjects and the custom draft compile in the five preset styles', () => {
  expect(creatorSubjects.map(subject => subject.id)).toEqual(['marlon', 'johnson', 'trump', 'tom-holland', 'zendaya', 'clavicular'])
  expect(new Set(creatorVideoStyles.map(style => style.id)).size).toBe(5)
  for (const example of [...creatorSubjects.map(subject => subject.example), customVideoExample('Custom')]) {
    for (const style of creatorVideoStyles) {
      const video = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images?.map(image => image.id) ?? ['face'], 'brand', reportCategories, { recipe: style.id, directions: creatorStyleDirections(example, style.id) })
      expect(narrationText(video).replace(/\s+/g, ' ')).toBe(example.script.replace(/\s+/g, ' '))
      expect(video.recipe).toBe(style.id)
      expect(video.width / video.height).toBeCloseTo(9 / 16, 3)
    }
  }
})

test('all styles retain measured recording identity, duration, pauses and exact word timing', () => {
  const script = creatorSubjects[0].example.script
  const initial = compile(script, 'portrait-audit')
  const words = scriptWords(initial.script!).map((word, index) => ({ text: word.text, startMs: 150 + index * 210, endMs: 280 + index * 210 }))
  const duration = words.at(-1)!.endMs + 700
  const source = alignVideoVoiceover(initial, { words }, duration)
  for (const style of creatorVideoStyles) {
    const target = retainVideoVoiceover(source, compile(script, style.id), duration)
    expect(target.timing).toBe('words')
    expect(target.durationMs).toBe(duration)
    expect(target.recording!.words.map(word => [word.startMs, word.endMs])).toEqual(source.recording!.words.map(word => [word.startMs, word.endMs]))
    expect(narrationText(target)).toBe(narrationText(source))
  }
  expect(() => retainVideoVoiceover(source, compile('Different spoken words.', 'portrait-audit'), duration)).toThrow()
})

test('speech without measured words survives style changes without claiming measured timing', () => {
  const script = creatorSubjects[1].example.script
  const initial = compile(script, 'portrait-audit')
  const source = assembleSpeech(initial, initial.scenes.map(scene => ({ sceneId: scene.id, pcm: new Uint8Array(Math.ceil(scene.durationMs / 1000) * 48000) }))).composition
  for (const style of creatorVideoStyles) {
    const target = retainVideoVoiceover(source, compile(script, style.id), source.durationMs)
    expect(target.durationMs).toBe(source.durationMs)
    expect(target.timing).toBe('segments')
    expect(target.recording).toBeUndefined()
    expect(target.scenes.every(scene => !scene.words)).toBe(true)
    expect(narrationText(target)).toBe(narrationText(source))
  }
})


test('legacy projects migrate to the wider tall layout without changing their script or timing', () => {
  const current = compile(creatorSubjects[0].example.script, 'portrait-audit')
  const migrated = parseComposition({ ...current, width: 1080, height: 1920 })
  expect([migrated.width, migrated.height]).toEqual([1316, 2340])
  expect(migrated.script).toEqual(current.script)
  expect(migrated.scenes.map(scene => [scene.startMs, scene.durationMs])).toEqual(current.scenes.map(scene => [scene.startMs, scene.durationMs]))
  expect(() => parseComposition({ ...current, height: 2000 })).toThrow()
})

test('last two styles have visual content on every beat and keep their distinct grammar', () => {
  for (const subject of creatorSubjects.slice(0, 2)) {
    const example = subject.example
    const make = (recipe: VideoComposition['recipe']) => compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe, directions: creatorStyleDirections(example, recipe) })
    const kinetic = make('minimal-explainer'), story = make('hybrid-story')
    expect(kinetic.scenes.filter(scene => scene.source.kind === 'explainer').every(scene => scene.graphic!.items.length > 0)).toBe(true)
    expect(kinetic.scenes.some(scene => scene.graphic?.items.some(item => item.diagram))).toBe(true)
    expect(story.scenes.some(scene => scene.study?.operation === 'recap')).toBe(true)
    expect(story.scenes.filter(scene => scene.study?.operation === 'recap').flatMap(scene => scene.tracks).some(track => track.elementId === 'subject')).toBe(false)
    expect(story.scenes.some(scene => scene.portraitFX?.lighting)).toBe(true)
    expect(story.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
    for (const video of [kinetic, story]) {
      expect(video.scenes.flatMap(scene => scene.tracks.filter(track => track.target === 'content')).every(track => track.durationMs <= 420)).toBe(true)
      expect(narrationText(video).replace(/\s+/g, ' ')).toBe(example.script.replace(/\s+/g, ' '))
    }
  }
})


test('authored lighting and reversible photo edits survive all five creator styles', () => {
  for (const style of creatorVideoStyles) {
    const e = portraitEffectsLab
    const composition = compileAnalysisVideo(scriptToPlan(e.script, e.readingPace), input, e.images!.map(image => image.id), 'brand', reportCategories, { recipe: style.id, directions: creatorStyleDirections(e, style.id) })
    expect(composition.scenes.some(scene => scene.photoStudy)).toBe(true)
    expect(composition.scenes.some(scene => scene.portraitFX?.lighting)).toBe(true)
    const continuous = composition.scenes.filter((scene, index) => index && scene.source.kind === 'portrait' && composition.scenes[index - 1].source.kind === 'portrait' && scene.source.imageId === composition.scenes[index - 1].source.imageId)
    expect(continuous.length).toBeGreaterThan(0)
    expect(continuous.every(scene => scene.tracks.some(track => track.primitive === 'cinematic-flow'))).toBe(true)
  }
})


test('authored feature boards stay focused without injecting generic report grids', () => {
  for (const subject of creatorSubjects.slice(0, 2)) for (const style of creatorVideoStyles.filter(style => style.id !== 'report-led')) {
    const example = subject.example
    const video = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: style.id, directions: creatorStyleDirections(example, style.id) })
    const grids = video.scenes.filter(scene => scene.graphic?.layout === 'dashboard' && scene.graphic.items.every(item => item.value && !item.diagram))
    expect(grids.length).toBeLessThanOrEqual(3)
    expect(video.scenes.filter(scene => scene.featureStudy).every(scene => !scene.graphic)).toBe(true)
    expect(video.scenes.filter(scene => scene.graphic?.items.some(item => item.diagram)).every(scene => scene.graphic!.items.length === 1)).toBe(true)
  }
})


test('alternate angles remain available across presets and Clavicular uses all three views for narrated context', () => {
  const example = creatorSubjects.find(subject => subject.id === 'clavicular')!.example
  for (const style of creatorVideoStyles) {
    const video = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: style.id, directions: creatorStyleDirections(example, style.id) })
    for (const photo of example.images!) expect(video.scenes.some(scene => scene.source.imageId === photo.id)).toBe(true)
    expect(video.scenes.some(scene => scene.profileStudy && /head angle|camera distance/i.test(scene.narration))).toBe(true)
  }
})


test('dark wardrobe variants retain clip image identities and leave light portraits untouched', () => {
  for (const subject of creatorSubjects) {
    const light = creatorSubjectPhotos(subject)
    const dark = creatorSubjectPhotos(subject, 'dark')
    if (subject.id === 'marlon' || subject.id === 'johnson') {
      expect(dark?.map(image => image.id)).toEqual(light?.map(image => image.id))
      expect(dark).toHaveLength(3)
      expect(dark?.every(image => image.dataUrl.includes('studio-dark-20261027'))).toBe(true)
      expect(light?.every(image => !image.dataUrl.includes('studio-dark-20261027'))).toBe(true)
    } else expect(dark).toBe(light)
  }
})

test('recorded stories retain measured audio and saved photo scores across the existing five formats', async () => {
  const { readFileSync } = await import('node:fs')
  const { creatorAnalysisInput, creatorAnalysisReports, creatorStoryDirections, creatorSubjectAnalysisSchema } = await import('./creator-stories')
  const { restoreProductionRecording, compileProductionVideo, assembleProductionAudio, productionWritingBrief } = await import('./video-production')
  const { createHash } = await import('node:crypto')
  const read = (path: string) => JSON.parse(readFileSync(`public${path}`, 'utf8'))
  for (const subject of creatorSubjects) {
    const story = read(`/creator/stories/${subject.id}/story.json`), saved = restoreProductionRecording(read(story.recording))
    const analysis = creatorSubjectAnalysisSchema.parse(read(story.analysis))
    expect(analysis.subjectId).toBe(subject.id)
    expect(analysis.source.imageId).toBe(story.images[0].id)
    expect(productionWritingBrief(saved.script, analysis).subjectAnalysis?.source.sha256).toBe(analysis.source.sha256)
    const reports = creatorAnalysisReports(analysis), actual = creatorAnalysisInput(input, subject.name, analysis)
    const clocks = new Set<string>(), recordings = new Set<string>()
    for (const style of creatorVideoStyles) {
      const directions = creatorStoryDirections(story, saved.script, actual, story.images, reports, style.id, 0)
      const video = compileProductionVideo(saved.script, actual, story.images, reports, style.id, saved.voice, 0, 'philtrum', 1, directions)
      expect(video.scenes.some(scene => scene.featureStudy?.layout === 'compare')).toBe(false)
      if (story.evidence.revealEdit === 0 && ['portrait-audit','feature-study'].includes(style.id)) expect(video.scenes.filter(scene => scene.cueId === 'reveal').every(scene => scene.featureStudy?.edit === 0)).toBe(true)
      const assembled = assembleProductionAudio(video, saved.clips)
      expect(assembled.alignmentError).toBeUndefined()
      expect(assembled.composition.timing).toBe('words')
      expect(narrationText(assembled.composition)).toBe(saved.script.cues.map(cue => cue.text).join('\n\n'))
      expect(assembled.composition.scenes.every(scene => !scene.source.hideScores)).toBe(true)
      for (const scene of assembled.composition.scenes.filter(scene => scene.source.report?.id === 'overall')) {
        expect(scene.source.report!.assessmentId).toBe(analysis.source.sha256)
        for (const item of scene.graphic?.items ?? []) if (item.metric?.id) expect(scene.source.report!.features.some(feature => feature.id === item.metric!.id)).toBe(true)
        expect(scene.source.report!.score).toBe(analysis.webReport.overallScore)
        expect(scene.source.hidePotential).toBe(!actual.potentialScore)
        if (actual.potentialScore) {
          expect(scene.source.potentialScale).toBe(8)
          expect(scene.source.potentialScore).toBe(analysis.result.report!.potential!.score)
          expect(scene.source.potentialCurrentScore).toBe(analysis.result.pslScore!)
        }
      }
      const { replaceCustomSlide } = await import('./custom-video')
      const edited = replaceCustomSlide(video, video.scenes[0].id, 'overlay-eyes', actual, reports).scenes[0]
      expect(edited.source.report!.assessmentId).toBe(analysis.source.sha256)
      expect(edited.source.report!.score).toBe(analysis.webReport.categories.find(category => category.id === 'eyes')!.score)
      if (style.id === 'report-led') expect(video.scenes.some(scene => scene.graphic?.layout === 'dashboard' || scene.source.kind === 'report')).toBe(true)
      if (style.id === 'feature-study') expect(video.scenes.some(scene => scene.featureStudy?.layout === 'detail')).toBe(true)
      clocks.add(JSON.stringify(assembled.composition.recording!.words))
      recordings.add(createHash('sha256').update(Buffer.from(await assembled.file.arrayBuffer())).digest('hex'))
    }
    expect(clocks.size).toBe(1)
    expect(recordings.size).toBe(1)
    if (['marlon', 'johnson', 'clavicular'].includes(subject.id)) expect(story.images.filter((image: { id: string }) => /profile|three-quarter/.test(image.id))).toHaveLength(2)
  }
})


test('new score stories bind narrated categories to saved scores and keep all four modular lengths', async () => {
  const { readFileSync } = await import('node:fs')
  const { creatorStoryOptions, creatorAnalysisInput, creatorAnalysisReports, creatorStoryDirections, creatorSubjectAnalysisSchema } = await import('./creator-stories')
  const { validateProductionScript, productionCut, compileProductionVideo, restoreProductionRecording, assembleProductionAudio } = await import('./video-production')
  const read = (url: string) => JSON.parse(readFileSync(`public${url}`, 'utf8'))
  for (const subject of creatorSubjects) {
    const manifest = read(`/creator/stories/${subject.id}/story.json`)
    const options = creatorStoryOptions(manifest)
    expect(options).toHaveLength(2)
    expect(options[0].recording).toBeTruthy()
    const next = options[1], draft = read(`/creator/stories/${subject.id}/report-story.json`)
    expect(next.draft).toBeUndefined()
    const saved = restoreProductionRecording(read(next.recording!))
    expect(saved.clips.size).toBe(draft.script.cues.length)
    expect(draft.audioStatus).toBe('word-aligned')
    const analysis = creatorSubjectAnalysisSchema.parse(read(manifest.analysis))
    expect(draft.assessmentId).toBe(analysis.source.sha256)
    const script = validateProductionScript(draft.script), reports = creatorAnalysisReports(analysis)
    const actual = creatorAnalysisInput(input, subject.name, analysis)
    const numberWords = ['zero','one','two','three','four','five','six','seven','eight','nine','ten']
    for (const cue of script.cues.filter(cue => !['hook','invitation','takeaway','result'].includes(cue.sourceId))) {
      const category = reports.find(report => report.id === cue.section!.visuals[0].categoryId)!
      expect(cue.text.toLowerCase()).toContain(numberWords[category.score])
    }
    expect(script.cues.at(-1)!.text).toBe('Get your face analysis.')
    for (const seconds of [30,45,60,75] as const) {
      const cut = productionCut(script, seconds)
      expect(cut.cues[0].sourceId).toBe('hook')
      expect(cut.cues.at(-2)!.sourceId).toBe('invitation')
      expect(cut.cues.at(-1)!.sourceId).toBe('takeaway')
    }
    const signatures = new Set<string>()
    for (const style of creatorVideoStyles) {
      const story = { ...manifest, ...next }
      const directions = creatorStoryDirections(story, script, actual, manifest.images, reports, style.id, 0)
      const video = compileProductionVideo(script, actual, manifest.images, reports, style.id, draft.voice, 0, 'philtrum', 1, directions)
      expect(narrationText(video)).toBe(script.cues.map(cue => cue.text).join('\n\n'))
      if(style.id==='hybrid-story') expect(video.scenes.filter(scene=>scene.portraitFX?.instrument).length).toBeLessThanOrEqual(Math.ceil(video.scenes.filter(scene=>scene.source.kind==='portrait').length/4))
      if(style.id==='feature-study') {
        expect(video.scenes.filter(scene=>scene.portraitFX?.instrument).length).toBeLessThanOrEqual(Math.ceil(video.scenes.filter(scene=>scene.source.kind==='portrait').length/4))
        expect(video.scenes.some(scene=>scene.source.kind==='portrait' && !scene.portraitFX?.instrument)).toBe(true)
      }
      const audible = assembleProductionAudio(video, saved.clips)
      expect(audible.alignmentError).toBeUndefined()
      expect(audible.composition.timing).toBe('words')
      expect(audible.composition.durationMs).toBeLessThanOrEqual(75000)
      signatures.add(JSON.stringify(video.scenes.map(scene => [scene.source.kind, scene.featureStudy?.layout, scene.graphic?.layout, scene.study?.operation])))
      for (const scene of video.scenes) {
        if(scene.source.kind === 'portrait') expect(scene.scoreCallouts).toBeDefined()
        if(subject.id === 'marlon' && style.id === 'measurement-explainer' && scene.narration.includes("Marlon's a seven")) {
          expect(scene.source.kind).toBe('portrait')
          expect(scene.scoreCallouts?.[0]).toMatchObject({label:'Overall',value:7})
        }
        const cue = script.cues.find(cue => cue.sourceId === scene.cueId)!
        const categoryId = cue.section!.visuals[0].categoryId
        expect(scene.source.categoryId).toBe(categoryId)
        expect(scene.source.report!.score).toBe(reports.find(report => report.id === categoryId)!.score)
        expect(scene.source.report!.assessmentId).toBe(analysis.source.sha256)
        for (const item of scene.graphic?.items ?? []) if (item.metric?.id) expect(scene.source.report!.features.some(feature => feature.id === item.metric!.id)).toBe(true)
        expect(scene.photoStudy).toBeUndefined()
        expect(scene.featureStudy?.edit ?? 0).toBe(0)
        if (isVideoCta(video, scene)) { expect(scene.source.kind).toBe('portrait'); expect(scene.source.overlay).toBe('none') }
        else if (style.id === 'report-led') expect(scene.source.kind).toBe('report')
      }
    }
    expect(signatures.size).toBeGreaterThanOrEqual(3)
  }
})


test('portrait score cues follow spoken numbers without revealing an unnamed category', async () => {
  const { spokenScoreCallouts, activeSpokenScore } = await import('./spoken-score')
  const reports = [{ id:'overall', title:'Overall', score:7 }, { id:'jaw', title:'Jaw & chin', score:6 }] as typeof reportCategories
  const text = 'Tom Holland gets a seven overall, while his jaw gets a six.'
  const cues = spokenScoreCallouts(text, reports, 'overall')!
  expect(cues.map(cue => [cue.label,cue.value,cue.word])).toEqual([['Overall',7,4],['Jaw & chin',6,11]])
  expect(spokenScoreCallouts('One category comes in two points higher. Can you tell which?', reports, 'overall')).toBeUndefined()
  expect(spokenScoreCallouts('His jaw gets nine.', reports, 'jaw')).toBeUndefined()
  expect(spokenScoreCallouts("Marlon's a seven in this report.", reports, 'overall')?.[0]).toMatchObject({label:'Overall',value:7,word:2})
  expect(spokenScoreCallouts('His PSL score is seven.', reports, 'overall')).toBeUndefined()
  const scene = { scoreCallouts:cues, words:Array.from({length:13},(_,i)=>({text:'word',startMs:i*200,endMs:i*200+150})) } as VideoComposition['scenes'][number]
  expect(activeSpokenScore(scene,799)).toBeUndefined()
  expect(activeSpokenScore(scene,800)?.value).toBe(7)
  expect(activeSpokenScore(scene,2200)?.value).toBe(6)
})
