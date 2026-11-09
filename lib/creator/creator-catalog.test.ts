import {chooseCreatorTake} from './creator-catalog'
import { creatorStoryOptions } from './creator-stories'
import { isVideoCta } from './video-branding'
import { portraitEffectsLab, subjectStudies } from './video-subject-studies'
import { videoSize } from './video-layout'
import { expect, test } from 'bun:test'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles, creatorContentStyles, creatorContentStyle, contentStyleSupportsScript, creatorStyleDirections, customVideoExample, validateCreatorPhotos } from './creator-catalog'
import { compileAnalysisVideo, parseComposition, type VideoComposition } from './video-composition'
import { scriptToPlan } from './script-edit'
import { scriptWords } from './video-script'
import { alignVideoVoiceover, assembleSpeech, narrationText, retainVideoVoiceover } from './video-voiceover'
import { reportCategories } from './mock-report-data'
import type { AnalysisPostInput } from './analysis-post'

const input: AnalysisPostInput = { formatId: 'feature-audit', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' }
const existingStyles = creatorVideoStyles.filter(style => style.id !== 'documentary-studio' && style.id !== 'editorial-story' && style.id !== 'sculpture-study')
const compile = (script: string, recipe: VideoComposition['recipe']) => compileAnalysisVideo(scriptToPlan(script, 165), input, ['face'], 'brand', reportCategories, { recipe })

test('Full HD validates both orientations and rejects small, invalid or excessive uploads', () => {
  for (const dimensions of [{ width: 1080, height: 1920 }, { width: 1920, height: 1080 }, { width: 3000, height: 3000 }]) expect(() => validateCreatorPhotos([dimensions])).not.toThrow()
  for (const photos of [[], Array(4).fill({ width: 3000, height: 3000 }), [{ width: 1920, height: 1079 }], [{ width: 1080, height: 1919 }], [{ width: NaN, height: 3000 }]]) expect(() => validateCreatorPhotos(photos)).toThrow()
})

test('all launch subjects and the custom draft compile in the five preset styles', () => {
  expect(creatorSubjects.map(subject => subject.id)).toEqual(expect.arrayContaining(['marlon', 'v', 'jordan-barrett', 'tom-holland', 'zeta', 'clavicular', 'johnson', 'trump', 'zendaya']))
  expect(new Set(creatorVideoStyles.map(style => style.id)).size).toBe(8)
  for (const example of [...creatorSubjects.map(subject => subject.example), customVideoExample('Custom')]) {
    for (const style of existingStyles) {
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
  for (const style of existingStyles) {
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
  for (const style of existingStyles) {
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
  for (const example of subjectStudies.slice(0, 2)) {
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
  for (const style of existingStyles) {
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
  const base = creatorSubjects.find(subject => subject.id === 'clavicular')!.example
  const angled = ['front','three-quarter','profile'].map(view=>({id:`clavicular-studio-${view}-20261027`,name:view,dataUrl:`/creator/examples/clavicular-studio-20261027/clavicular-${view}-4k.jpg`,width:2160,height:3840,status:'ready' as const,landmarks:null}))
  const example = {...base,images:angled,script:'Start with the whole face in the front portrait. Now compare the cheek and jaw contours. The side profile shows how head angle and camera distance affect the outline.'}
  for (const style of existingStyles) {
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
    const catalog = read(`/creator/stories/${subject.id}/story.json`)
    if(!catalog.analysis){expect(catalog.editorialRatings).toBeDefined();continue}
    const analysis = creatorSubjectAnalysisSchema.parse(read(catalog.analysis))
    expect(analysis.subjectId).toBe(subject.id)
    const options=creatorStoryOptions(catalog)
    expect(options[0].id).toBe(catalog.id)
    const recording = ['johnson', 'trump', 'zendaya'].includes(subject.id) ? 'recording.json' : 'round3-recording.json'
    const legacy = options.find(option => option.recording === `/creator/stories/${subject.id}/${recording}`)!
    const story = { ...catalog, ...legacy, featureOpening: legacy.featureOpening, directions: legacy.directions, editorialRatings: legacy.editorialRatings }
    const saved = restoreProductionRecording(read(legacy.recording!))
    expect(analysis.source.imageId).toBe(story.images[0].id)
    expect(productionWritingBrief(saved.script, analysis).subjectAnalysis?.source.sha256).toBe(analysis.source.sha256)
    const reports = creatorAnalysisReports(analysis), actual = creatorAnalysisInput(input, subject.name, analysis)
    const clocks = new Set<string>(), recordings = new Set<string>()
    for (const style of existingStyles) {
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
      if (style.id === 'feature-study') expect(video.scenes.some(scene => scene.featureStudy?.layout === 'detail' || scene.presentation)).toBe(true)
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
  for (const subject of [{id:'marlon',name:'Marlon'},{id:'johnson',name:'The Rock'},{id:'trump',name:'Trump'},{id:'tom-holland',name:'Tom Holland'},{id:'zendaya',name:'Zendaya'},{id:'clavicular',name:'Clavicular'}]) {
    const manifest = read(`/creator/stories/${subject.id}/story.json`)
    const options = creatorStoryOptions(manifest)
    expect(options[0].id).toBe(manifest.id)
    expect(options.some(option => option.kind === 'feature-story')).toBe(true)
    const next = options.find(option => option.kind === 'score-walkthrough')!
    expect(next.recording).toBeTruthy()
    const draft = read(`/creator/stories/${subject.id}/report-story.json`)
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
    for (const style of existingStyles) {
      const story = { ...manifest, ...next, featureOpening: next.featureOpening }
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
        const categoryId = (['editorial-story','feature-study'].includes(style.id) && scene.source.kind==='report' && (isVideoCta(video,scene) || cue.section!.role==='takeaway')) ? scene.source.categoryId : cue.section!.visuals[0].categoryId
        expect(scene.source.categoryId).toBe(categoryId)
        expect(scene.source.report!.score).toBe(reports.find(report => report.id === categoryId)!.score)
        expect(scene.source.report!.assessmentId).toBe(analysis.source.sha256)
        for (const item of scene.graphic?.items ?? []) if (item.metric?.id) expect(scene.source.report!.features.some(feature => feature.id === item.metric!.id)).toBe(true)
        expect(scene.photoStudy).toBeUndefined()
        expect(scene.featureStudy?.edit ?? 0).toBe(0)
        if (isVideoCta(video, scene)) { expect(scene.source.kind).toBe(['editorial-story','feature-study'].includes(style.id)?'report':'portrait'); expect(scene.source.overlay).toBe('none') }
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
  const current = [{ id:'jaw',title:'Jaw & chin',score:8 },{ id:'cheeks',title:'Cheek area',score:8 },{ id:'eyes',title:'Eye area',score:7.5 }] as typeof reportCategories
  expect(spokenScoreCallouts('His jaw and cheek area each get eight out of ten.',current,'jaw')?.map(cue=>[cue.label,cue.value])).toEqual([['Cheek area',8],['Jaw & chin',8]])
  expect(spokenScoreCallouts('The eye area gets seven point five out of ten.',current,'eyes')?.map(cue=>[cue.label,cue.value])).toEqual([['Eye area',7.5]])

  const scene = { scoreCallouts:cues, words:Array.from({length:13},(_,i)=>({text:'word',startMs:i*200,endMs:i*200+150})) } as VideoComposition['scenes'][number]
  expect(activeSpokenScore(scene,799)).toBeUndefined()
  expect(activeSpokenScore(scene,800)?.value).toBe(7)
  expect(activeSpokenScore(scene,2200)?.value).toBe(6)
})


test('approved editorial images and crop reveals survive all five styles without unspoken rulers', async () => {
  const {readFileSync}=await import('node:fs')
  const {creatorAnalysisInput,creatorAnalysisReports,creatorStoryDirections}=await import('./creator-stories')
  const {restoreProductionRecording,compileProductionVideo,productionCut}=await import('./video-production')
  const {showsFeatureMetric}=await import('./report-choreography')
  const read=(url:string)=>JSON.parse(readFileSync(`public${url}`,'utf8'))
  for(const subject of creatorSubjects.slice(0,6)){
    const manifest=read(`/creator/stories/${subject.id}/story.json`)
    const round3=manifest.alternatives?.find((option:{id:string})=>option.id.endsWith('-round3'))
    const base=round3 ? {...manifest,...round3,featureOpening:round3.featureOpening,directions:round3.directions,editorialRatings:round3.editorialRatings} : manifest
    const saved=restoreProductionRecording(read(base.recording)),analysis=read(base.analysis)
    const images=base.imageIds.map((id:string)=>base.images.find((image:{id:string})=>image.id===id))
    const reports=creatorAnalysisReports(analysis),actual=creatorAnalysisInput(input,subject.name,analysis)
    expect(productionCut(saved.script,45).cues.map(cue=>cue.text)).toEqual(saved.script.cues.map(cue=>cue.text))
    for(const style of existingStyles){
      const directions=creatorStoryDirections(base,saved.script,actual,images,reports,style.id,0)
      const comp=compileProductionVideo(saved.script,actual,images,reports,style.id,saved.voice,0,'philtrum',1,directions)
      for(const scene of comp.scenes){
        for (const action of scene.portraitProgram?.actions ?? []) {
          expect(/[.:]/.test(action.guide)).toBe(true)
          expect(action.label).not.toMatch(/[0-9]/)
          expect(action.word).toBeLessThan(scene.portraitProgram!.wordCount)
        }
        const noseChange = subject.id === 'clavicular' && (scene.featureStudy?.revealWord !== undefined || scene.photoStudy?.startWord !== undefined)
        if (['portrait','report'].includes(scene.source.kind) && !scene.presentation && !noseChange && !(style.id==='feature-study' && scene.source.kind==='report')) expect(scene.portraitProgram).toBeDefined()
        if (scene.source.kind==='portrait' && /profile|three-quarter/.test(scene.source.imageId??'')) {
          expect(scene.profileStudy).toBeDefined()
          expect(scene.featureStudy).toBeUndefined()
          if (scene.portraitProgram) {
            expect(scene.portraitProgram.view).toBeDefined()
            expect(scene.portraitProgram.actions[0].word).toBe(0)
            expect(scene.portraitProgram.actions.every(action=>action.labelWord!==undefined)).toBe(true)
            expect(scene.portraitProgram.actions.every(action=>action.guide.startsWith('profile:'))).toBe(true)
          }
        }
        if (!noseChange) expect(scene.photoStudy).toBeUndefined()
        expect(scene.featureStudy?.edit??0).toBe(0)
        if(scene.scoreCallouts?.length)expect(scene.source.imageId).toBe(analysis.source.imageId)
        if(scene.source.kind==='portrait'&&!scene.scoreCallouts?.length)expect(showsFeatureMetric(scene)).toBe(false)
      }
      expect(comp.scenes.some(scene=>scene.portraitProgram?.actions.length)).toBe(true)
      if(subject.id==='v'){
        const zoom=comp.scenes.find(scene=>scene.narration.startsWith('Zooming'));expect(Boolean(zoom?.portraitCrop || zoom?.presentation?.kind==='reference-inset')).toBe(true)
        expect(comp.scenes.find(scene=>scene.narration.startsWith('Pull back'))?.portraitCrop).toBeUndefined()
      }
    }
  }
})

test('Clavicular reveals the original photos and morphs the before photo on the recorded words across formats', async () => {
  const { restoreProductionRecording, compileProductionVideo, assembleProductionAudio } = await import('./video-production')
  const { creatorSubjectAnalysisSchema, creatorAnalysisInput, creatorAnalysisReports } = await import('./creator-stories')
  const { photoStudyClock, photoStudyGesture, photoStudyRegions } = await import('./video-photo-study')
  const manifest = await Bun.file('public/creator/stories/clavicular/story.json').json()
  const saved = restoreProductionRecording(await Bun.file('public' + manifest.recording).json())
  const analysis = creatorSubjectAnalysisSchema.parse(await Bun.file('public' + manifest.analysis).json())
  const actual = creatorAnalysisInput(input, 'Clavicular', analysis)
  const images = manifest.imageIds.map((id: string) => manifest.images.find((image: {id: string}) => image.id === id))
  const reports = creatorAnalysisReports(analysis)
  for (const recipe of ['feature-study', 'editorial-story', 'portrait-audit', 'documentary-studio'] as const) {
    const film = compileProductionVideo(saved.script, actual, images, reports, recipe, saved.voice, 2)
    const { composition } = assembleProductionAudio(film, saved.clips)
    const comparison = composition.scenes.find(scene => scene.featureStudy?.revealWord !== undefined)!
    expect(comparison.featureStudy?.images).toEqual(['clavicular-june-before-source', 'clavicular-june-after-source'])
    expect(comparison.words?.[comparison.featureStudy!.revealWord!]).toMatchObject({ text: 'Now', startMs: 2100 })
    const morph = composition.scenes.find(scene => scene.photoStudy?.startWord !== undefined)!
    expect(morph.source.imageId).toBe('clavicular-june-before-source')
    expect(morph.words?.[morph.photoStudy!.startWord!]?.text).toBe('less')
    const clock = photoStudyClock(composition.scenes, morph, 0)
    expect(clock.cueMs).toBe(morph.words![morph.photoStudy!.startWord!].startMs)
    const landmarks = images.find((image: { id: string }) => image.id === morph.source.imageId).landmarks
    const regions = photoStudyRegions(landmarks, 'nose')
    const strength = (time: number) => photoStudyGesture(morph.photoStudy!, regions, time, clock.durationMs, false, landmarks, clock.cueMs).warp.strengths[0]
    expect(strength(clock.cueMs! - 1)).toBe(0)
    expect(strength(clock.cueMs! + 400)).toBeGreaterThan(0)
    expect(strength(clock.cueMs! + 400)).toBeLessThan(strength(clock.durationMs - 1))
    expect(strength(clock.durationMs - 1)).toBe(morph.photoStudy!.amount)
  }
  const film = compileProductionVideo(saved.script, actual, images, reports, 'documentary-studio', saved.voice)
  const assembled = assembleProductionAudio(film, saved.clips)
  expect(creatorVideoStyles.some(style => style.id === film.recipe)).toBe(true)
  expect(assembled.composition.script).toEqual(saved.script)
  expect(assembled.composition.voice).toEqual(saved.voice)
  expect(assembled.composition.scenes.map(scene => scene.documentary?.kind)).toEqual(['comparison', 'inspection', 'inspection', 'relations', 'conclusion'])
  const comparison = assembled.composition.scenes[0]
  const { documentaryShots } = await import('./video-documentary')
  const shots = documentaryShots(assembled.composition)
  expect(shots.every((shot, i) => i === 0 || shot.startMs === shots[i - 1].startMs + shots[i - 1].durationMs)).toBe(true)
  expect(shots.filter(shot => shot.scene.id === comparison.id)).toHaveLength(1)
  expect(shots.some(shot => shot.kind === 'anatomy')).toBe(false)
  expect([comparison.source.imageId, comparison.source.secondaryImageId]).toEqual(['clavicular-june-after-source', 'clavicular-june-before-source'])
  expect(assembled.composition.scenes[2].scoreCallouts?.map(score => [score.label, score.value])).toEqual([['Nose', 7], ['Jaw & chin', 8]])
  expect(assembled.composition.timing).toBe('words')
  expect(assembled.file.size).toBeGreaterThan(1_000_000)
  // A generated study or an unrelated before/after set must not become change evidence.
  const unmatched = manifest.images.map((photo: any) => ({ ...photo, comparison: photo.comparison ? { ...photo.comparison, feature: 'brows' } : undefined }))
  expect(compileProductionVideo(saved.script, actual, unmatched, creatorAnalysisReports(analysis), 'documentary-studio', saved.voice).scenes.some(scene => scene.documentary?.kind === 'comparison')).toBe(false)
})

test('media crop checks account for portrait extraction, feature crops and camera zoom', async () => {
  const { mediaCropFit, requireUsableMedia } = await import('./media-asset')
  expect(mediaCropFit({ width: 3840, height: 2160 }, { width: 1080, height: 1920 }, undefined, 1.5)).toMatchObject({ native: false, width: 810, height: 1440 })
  expect(mediaCropFit({ width: 2160, height: 3840 }, { width: 1080, height: 1920 }, undefined, 2).native).toBe(true)
  expect(mediaCropFit({ width: 2160, height: 3840 }, { width: 1080, height: 1920 }, { width: .2, height: .2 }).native).toBe(false)
  expect(() => mediaCropFit({ width: 0, height: 2160 }, { width: 1080, height: 1920 })).toThrow()
  const asset = { id: 'private-source', kind: 'image' as const, url: 'https://public.example.com/source.jpg', width: 2160, height: 3840, role: 'evidence' as const, scope: { kind: 'private' as const, ownerId: 'creator' }, source: { provider: 'upload', url: 'https://www.mogging.com/creator', license: 'Creator upload', usage: 'owned' as const } }
  expect(() => requireUsableMedia(asset)).toThrow('authenticated creator URL')
  expect(() => requireUsableMedia({ ...asset, url: '/api/creator/media/source' })).not.toThrow()
  expect(() => requireUsableMedia({ ...asset, url: '/api/creator/media/source', source: { ...asset.source, usage: 'review' } })).toThrow('Review usage rights')
})

test('authored cue annotations remain valid when the narrator section splits into caption scenes', async () => {
  const { readFileSync } = await import('node:fs')
  const { creatorAnalysisInput, creatorAnalysisReports, creatorStoryDirections } = await import('./creator-stories')
  const { editorialRatingInput, editorialRatingReports } = await import('./private-character')
  const { restoreProductionRecording, compileProductionVideo } = await import('./video-production')
  const { scriptTokens } = await import('./video-script')
  const read = (url: string) => JSON.parse(readFileSync(`public${url}`, 'utf8'))
  for (const person of ['v', 'kareem-shami']) {
    const story = read(`/creator/stories/${person}/story.json`)
    const saved = restoreProductionRecording(read(story.recording))
    const analysis = story.analysis ? read(story.analysis) : undefined
    const actual = story.editorialRatings ? editorialRatingInput(input, person, story.editorialRatings) : creatorAnalysisInput(input, person, analysis)
    const reports = story.editorialRatings ? editorialRatingReports(story.editorialRatings, story.images[0].id) : creatorAnalysisReports(analysis)
    const images = story.imageIds.map((id: string) => story.images.find((image: {id: string}) => image.id === id))
    const directions = creatorStoryDirections(story, saved.script, actual, images, reports, 'feature-study', 0)
    const video = compileProductionVideo(saved.script, actual, images, reports, 'feature-study', saved.voice, 0, 'philtrum', 1, directions)
    expect(video.scenes.length).toBeGreaterThan(saved.script.cues.length)
    for (const scene of video.scenes) for (const action of scene.portraitProgram?.actions ?? []) {
      expect(action.word).toBeLessThan(scriptTokens(scene.narration).length)
    }
  }
})


test('content styles partition editing recipes and Qoves supports all recorded portrait scripts',()=>{
  expect(creatorContentStyles.map(style=>style.name)).toEqual(['Mogging Editorial','Qoves','Cephra','Fern'])
  expect(creatorContentStyles.flatMap(style=>[...style.recipes]).toSorted()).toEqual(creatorVideoStyles.map(style=>style.id).toSorted())
  expect(creatorContentStyle('report-led').id).toBe('mogging-editorial')
  expect(creatorContentStyle('feature-study').id).toBe('qoves')
  expect(creatorContentStyle('documentary-studio').id).toBe('fern')
  const choices=[{kind:'feature-story'},{kind:'score-walkthrough'},{}]
  expect(choices.filter(story=>contentStyleSupportsScript('qoves',story))).toEqual(choices)
  for(const id of ['mogging-editorial','fern'] as const)expect(choices.every(story=>contentStyleSupportsScript(id,story))).toBe(true)
})

test('all content style recipes retain a saved story and its photo edits without overriding ordinary shot grammar',async()=>{
  const {editorialRatingInput,editorialRatingReports}=await import('./private-character')
  const {creatorStoryDirections}=await import('./creator-stories')
  const {restoreProductionRecording,compileProductionVideo}=await import('./video-production')
  const story=await Bun.file('public/creator/stories/kareem-shami/story.json').json()
  const saved=restoreProductionRecording(await Bun.file('public'+story.recording).json())
  const actual=editorialRatingInput(input,'Kareem Shami',story.editorialRatings),reports=editorialRatingReports(story.editorialRatings,story.images[0].id)
  for(const recipe of creatorVideoStyles.map(style=>style.id)){
    const directions=creatorStoryDirections(story,saved.script,actual,story.images,reports,recipe,0)
    const video=compileProductionVideo(saved.script,actual,story.images,reports,recipe,saved.voice,0,'philtrum',1,directions)
    expect(video.recipe).toBe(recipe);expect(video.script).toEqual(saved.script)
    if(recipe==='report-led'){
      expect(video.scenes.some(scene=>scene.source.kind==='report')).toBe(true)
      expect(video.scenes.some(scene=>scene.scriptRange?.cueId===saved.script.cues.find(cue=>cue.sourceId==='hair')?.id&&scene.featureStudy?.edit===1)).toBe(true)
    }
    if(recipe==='feature-study')expect(video.scenes.some(scene=>scene.featureStudy?.editorial)).toBe(true)
  }
})


test('Fern holds an assessed portrait for scores and cuts on a narrated change of angle', async () => {
  const { restoreProductionRecording, compileProductionVideo, assembleProductionAudio } = await import('./video-production')
  const { creatorSubjectAnalysisSchema, creatorAnalysisReports } = await import('./creator-stories')
  const { documentaryShots } = await import('./video-documentary')
  const manifest = await Bun.file('public/creator/stories/v/story.json').json()
  const saved = restoreProductionRecording(await Bun.file('public/creator/stories/v/round3-recording.json').json())
  const analysis = creatorSubjectAnalysisSchema.parse(await Bun.file('public' + manifest.analysis).json())
  const reports = creatorAnalysisReports(analysis)
  const make = (variation: number) => assembleProductionAudio(compileProductionVideo(
    saved.script, input, manifest.images, reports, 'documentary-studio', saved.voice, variation,
  ), saved.clips).composition
  const composition = make(0)
  const score = composition.scenes.find(scene => scene.narration.includes('each get eight'))!
  expect(score.source.imageId).toBe('v-front')
  expect(score.scoreCallouts?.map(callout => callout.value)).toEqual([8, 8])
  const angles = composition.scenes.find(scene => scene.narration.startsWith('At three-quarter'))!
  expect([angles.source.imageId, angles.source.secondaryImageId]).toEqual(['v-three-quarter', 'v-profile'])
  const shots = documentaryShots(composition)
  const profile = shots.find(shot => shot.scene.id === angles.id && shot.alternateView)
  expect(profile?.startMs).toBe(angles.startMs + angles.words![angles.documentary!.cutWord!].startMs)
  const { sharesDocumentaryPortrait } = await import('./video-documentary-motion')
  const firstAngle = shots.find(shot => shot.scene.id === angles.id && !shot.alternateView)!
  expect(sharesDocumentaryPortrait(firstAngle, profile!)).toBe(false)
  const first = shots[0]
  expect(sharesDocumentaryPortrait(first, { ...first, layout: 'optical-bench' })).toBe(true)
  expect(sharesDocumentaryPortrait(first, { ...first, kind: 'comparison' })).toBe(false)
  const alternates = Array.from({ length: 7 }, (_, i) => make(i + 1))
  for (const alternate of alternates) {
    const timedAngle = documentaryShots(alternate).find(shot => shot.scene.id === angles.id && shot.alternateView)
    expect(timedAngle?.startMs).toBe(profile?.startMs)
    expect(alternate.scenes.some(scene => scene.portraitProgram)).toBe(false)
    const scored = alternate.scenes.find(scene => scene.id === score.id)
    expect(scored?.source.imageId).toBe('v-front')
    expect(scored?.scoreCallouts).toEqual(score.scoreCallouts)
  }
  expect(new Set([composition, ...alternates].map(take => take.scenes[0].documentary?.kind))).toEqual(new Set(['stage', 'projection', 'contact', 'marquee']))
  const { documentaryEditions, documentaryLayoutIds } = await import('./video-documentary-editions')
  const editionCompositions = [composition, ...alternates].slice(0, 4)
  for (const take of editionCompositions) {
    const layouts = take.scenes.map(scene => scene.documentary?.layout)
    expect(layouts.some((layout, index) => layout && (layout === layouts[index - 1] || layout === layouts[index - 2]))).toBe(false)
  }
  const visualSequences = [composition, ...alternates].map(take =>
    documentaryShots(take).slice(1).map(shot => shot.layout ?? shot.kind).join('/'))
  expect(new Set(visualSequences).size).toBe(visualSequences.length)
  const editions = editionCompositions.map(documentaryShots)
  expect(editions.map(shots => shots[0].layout)).toEqual(documentaryEditions.map(edition => edition.layouts[0]))
  const coverage = Array.from({ length: 16 }, (_, variation) => documentaryShots(make(variation)))
  expect(new Set(coverage.flatMap(shots => shots.flatMap(shot => shot.layout ? [shot.layout] : [])))).toEqual(new Set(documentaryLayoutIds))
  for (const shots of editions) {
    expect(shots.every((shot, index) => !index || shot.startMs === shots[index - 1].startMs + shots[index - 1].durationMs)).toBe(true)
    expect(shots.every(shot => !shot.scene.photoStudy || !shot.layout)).toBe(true)
  }
  const treatments = [composition, ...alternates].flatMap(take => documentaryShots(take).map(shot => shot.kind))
  expect(treatments).toEqual(expect.arrayContaining(['specimen', 'registration', 'blueprint', 'locator', 'relations', 'ink', 'ledger']))
  const { documentaryRegistration } = await import('./video-documentary-registration')
  const { decodeVisualBeat } = await import('./video-semantics')
  const profilePhoto = manifest.images.find((image: { id: string }) => image.id === 'v-profile')
  const jaw = decodeVisualBeat('From the side, follow the jawline.')
  expect(documentaryRegistration(profilePhoto, jaw).paths[0].length).toBeGreaterThan(4)
  expect(documentaryRegistration({ ...profilePhoto, dataUrl: '/different-image.jpg', landmarks: null }, jaw).paths).toEqual([])
})

test('automatic Studio takes use compatible recordings and avoid the immediately preceding combination',()=>{
  const stories=[{id:'story',kind:'feature-story',recording:'/story.json'},{id:'report',kind:'score-walkthrough',recording:'/report.json'},{id:'unrecorded',kind:'feature-story'}]
  for(const style of ['mogging-editorial','qoves','fern'] as const){
    const first=chooseCreatorTake(style,stories,undefined,()=>0)
    const next=chooseCreatorTake(style,stories,first,()=>0)
    expect(first.storyId).not.toBe('unrecorded');expect(next.storyId).not.toBe('unrecorded')
    expect([next.recipe,next.storyId]).not.toEqual([first.recipe,first.storyId])
    if(style==='qoves'){expect(first.storyId).toBe('story');expect(next.storyId).toBe('report')}
  }
  const only=chooseCreatorTake('fern',[stories[0]],{storyId:'story',recipe:'documentary-studio',variation:0},()=>0)
  expect(only.variation).toBe(1)
  const families = new Set([only.variation])
  let previous = only
  for (let i = 1; i < 28; i++) {
    previous = chooseCreatorTake('fern', [stories[0]], previous, () => 0)
    families.add(previous.variation)
  }
  expect(families.size).toBe(28)
  expect(chooseCreatorTake('fern', [stories[0]], previous, () => 0).variation).toBe(only.variation)
  const third={id:'another',recording:'/another.json'}
  const options=[...stories,third]
  const first=chooseCreatorTake('qoves',options,undefined,()=>0)
  const second=chooseCreatorTake('qoves',options,first,()=>0)
  const last=chooseCreatorTake('qoves',options,second,()=>0)
  expect([first.storyId,second.storyId,last.storyId]).toEqual(['story','report','another'])
  expect(chooseCreatorTake('qoves',options,last,()=>0).storyId).not.toBe(last.storyId)
  expect(chooseCreatorTake('qoves',[stories[1]]).storyId).toBe('report')
})

test('Qoves recorded takes change compositions across six families and end on saved native report data', async()=>{
  const {readFileSync,readdirSync}=await import('node:fs')
  const {creatorStoryDirections,creatorAnalysisInput,creatorAnalysisReports}=await import('./creator-stories')
  const {editorialRatingInput,editorialRatingReports}=await import('./private-character')
  const {restoreProductionRecording,compileProductionVideo}=await import('./video-production')
  const read=(path:string)=>JSON.parse(readFileSync('public'+path,'utf8'))
  const coverage=new Set<string>()
  for(const person of readdirSync('public/creator/stories')){
    const base=read('/creator/stories/'+person+'/story.json')
    for(const option of creatorStoryOptions(base).filter(story=>story.recording && contentStyleSupportsScript('qoves',story))){
      const images=option.imageIds?.map(id=>base.images.find((image:{id:string})=>image.id===id))??base.images
      const story={...base,...option,featureOpening:option.featureOpening,directions:option.directions,editorialRatings:option.editorialRatings,images}
      const saved=restoreProductionRecording(read(option.recording!)),analysis=base.analysis?read(base.analysis):undefined
      const actual=story.editorialRatings?editorialRatingInput(input,person,story.editorialRatings):creatorAnalysisInput(input,person,analysis)
      const reports=story.editorialRatings?editorialRatingReports(story.editorialRatings,images[0].id):creatorAnalysisReports(analysis)
      for(const recipe of ['editorial-story','feature-study'] as const){
        const signatures=new Set<string>()
        for(let variant=0;variant<6;variant++){
          const directions=creatorStoryDirections(story,saved.script,actual,images,reports,recipe,variant)
          const video=compileProductionVideo(saved.script,actual,images,reports,recipe,saved.voice,variant,'philtrum',1,directions)
          expect(narrationText(video)).toBe(saved.script.cues.map(cue=>cue.text).join('\n\n'))
          signatures.add(JSON.stringify(video.scenes.map(scene=>({
            presentation:scene.presentation?.kind,image:scene.source.imageId,kind:scene.source.kind,
            layout:scene.featureStudy?.layout,comparison:scene.featureStudy?.comparison,
            motion:scene.featureStudy?.motion,program:scene.portraitProgram?.actions.map(action=>[action.guide,action.treatment]),
          }))))
          for(const scene of video.scenes)if(scene.presentation)coverage.add(scene.presentation.kind)
          const ending=video.scenes.at(-1)!
          expect(ending.source.kind).toBe('report')
          expect(ending.framing).toBe('full')
          expect(ending.focus).toMatch(/^(category-score|feature:)/)
          expect(ending.source.report).toEqual(reports.find(report=>report.id===ending.source.categoryId))
          expect(ending.source.report?.assessmentId).toBeDefined()
        }
        expect(signatures.size,`${person} / ${option.id} / ${recipe}`).toBe(6)
      }
    }
  }
  expect(coverage.size).toBeGreaterThanOrEqual(12)
})
