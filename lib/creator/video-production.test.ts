import { expect, test } from 'bun:test'
import { moveCustomClip, customLibraryComposition, customSlides } from './custom-video'
import { createProductionDraft } from './production-drafts'
import { productionCut, productionTimeline, validateProductionScript, reviseProductionScript, compileProductionVideo, productionVisualPlan, sectionAudioKey, assembleProductionAudio, productionTimingIssues, packProductionRecording, restoreProductionRecording, productionWritingBrief } from './video-production'
import { creatorSubjects, creatorSubjectPhotos, creatorVideoStyles } from './creator-catalog'
import { reportCategories } from './mock-report-data'
import { voiceDirection } from './video-speech'
import { scriptTokens, scriptRevision } from './video-script'
import { narrationText } from './video-voiceover'
import type { AnalysisPostInput } from './analysis-post'

const input: AnalysisPostInput = { formatId: 'feature-audit', subject: 'Marlon', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eye area', strongestScore: '8.1', opportunityFeature: 'Jaw definition', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' }
const voice = voiceDirection('editorial')
const master = createProductionDraft('Marlon')
const compile = (seconds = 75 as 30 | 45 | 60 | 75, recipe = 'portrait-audit' as typeof creatorVideoStyles[number]['id'], variation = 0) => compileProductionVideo(productionCut(master, seconds), input, creatorSubjects[0].example.images!, reportCategories, recipe, voice, variation)

test('every launch scaffold has complete 30/45/60/75-second cuts, an early CTA and spaced brand mentions', () => {
  for (const name of ['Marlon', 'The Rock', 'Obama', 'Clavicular', 'Your person']) for (const cap of [30, 45, 60, 75] as const) {
    const script = productionCut(createProductionDraft(name), cap)
    const timeline = productionTimeline(script)
    expect(timeline.at(-1)!.startMs + timeline.at(-1)!.durationMs).toBeLessThanOrEqual(cap * 1000)
    expect(timeline[0].role).toBe('hook')
    expect(timeline.at(-1)!.role).toBe('takeaway')
    expect(timeline.some(section => section.role === 'explanation')).toBe(true)
    expect(timeline.find(section => section.role === 'cta')!.startMs).toBeLessThanOrEqual(20000)
    expect(timeline.find(section => section.role === 'cta')!.durationMs).toBeGreaterThanOrEqual(2000)
    expect(timeline.filter(section => /Mogging/.test(section.text))).toHaveLength(cap <= 45 ? 2 : 3)
    expect(script.cues.every(cue => master.cues.some(original => original.section!.id === cue.section!.id))).toBe(true)
  }
})

test('manual cuts reject missing hooks, CTA, duplicate sections, incomplete context and oversized cuts', () => {
  expect(() => productionCut(master, 30, ['hook', 'product', 'takeaway'])).toThrow('CTA')
  expect(() => productionCut(master, 75, ['cta', 'hook', 'product', 'takeaway'])).toThrow('hook')
  expect(() => productionCut(master, 75, ['hook', 'cta', 'cta', 'product', 'takeaway'])).toThrow('unique')
  expect(() => productionCut(master, 30, master.cues.map(cue => cue.section!.id))).toThrow('exceed')
  const dependent = structuredClone(master)
  dependent.cues.find(cue => cue.section!.id === 'light')!.section!.dependsOn = ['contour']
  expect(() => productionCut(dependent, 45, ['hook', 'cta', 'product', 'light', 'takeaway'])).toThrow('required context')
  const late = structuredClone(master)
  const cue = late.cues.splice(late.cues.findIndex(cue => cue.section!.role === 'cta'), 1)[0]
  late.cues.splice(6, 0, cue); late.revision = scriptRevision(late.cues)
  expect(() => validateProductionScript(late)).toThrow('within 20 seconds')
})

test('section identity and approved words survive all visual styles and alternatives; chosen evidence stays authoritative', () => {
  const videos = creatorVideoStyles.flatMap(style => [0, 1].map(variation => compile(75, style.id, variation)))
  for (const video of videos) {
    expect(narrationText(video)).toBe(master.cues.map(cue => cue.text).join('\n\n'))
    expect(video.script!.cues.map(cue => cue.id)).toEqual(master.cues.map(cue => cue.id))
    expect([...new Set(video.scenes.map(scene => scene.cueId))]).toEqual(master.cues.map(cue => cue.sourceId))
    const cta = video.scenes.find(scene => scene.cueId === 'cta')!
    expect(cta.source.kind).toBe('portrait')
    expect(cta.source.overlay).toBe('none')
    expect(cta.portraitProgram).toBeUndefined()
    expect(cta.focus).toBe('hero')
  }
  const portrait = compile()
  expect(portrait.scenes.find(scene => scene.cueId === 'contour')!.source.kind).toBe('portrait')
  expect(portrait.scenes.find(scene => scene.cueId === 'light')!.portraitFX?.lighting?.target).toBe('whole')
  expect(compile(75, 'hybrid-story').scenes.some(scene => scene.graphic?.layout === 'dashboard')).toBe(true)
})

function recordings(measured = false) {
  return new Map(master.cues.map((cue, cueIndex) => {
    const words = scriptTokens(cue.text).map((word, index) => ({ text: word.text, startMs: index * 350, endMs: index * 350 + 300 }))
    const length = (words.at(-1)!.endMs + 100) * 48
    const key = sectionAudioKey(cue, voice)
    return [key, { key, cueId: cue.id, pcm: new Uint8Array(length).fill(cueIndex + 1), words: measured ? words : undefined }]
  }))
}

test('one recorded master supplies every cut/style without changing the performance or pretending estimated words are measured', async () => {
  for (const measured of [false, true]) {
    const clips = recordings(measured)
    for (const seconds of [30, 45, 60, 75] as const) {
      let bytes: Uint8Array<ArrayBuffer> | undefined
      for (const style of creatorVideoStyles) {
        const result = assembleProductionAudio(compile(seconds, style.id), clips)
        expect(result.composition.timing).toBe(measured ? 'words' : 'segments')
        const pcm = new Uint8Array(await result.file.arrayBuffer())
        if (bytes) expect(pcm).toEqual(bytes)
        bytes = pcm
        expect(result.composition.durationMs).toBe((pcm.length - 44) / 48)
        expect(productionTimingIssues(result.composition, seconds)).toEqual([])
        if (measured) expect(result.composition.recording!.words.length).toBe(result.composition.script!.cues.reduce((sum, cue) => sum + scriptTokens(cue.text).length, 0))
      }
    }
  }
})

test('wording/delivery/narrator changes invalidate affected audio; visual-only edits preserve reusable audio keys', () => {
  const changed = structuredClone(master)
  changed.cues[3].text = 'In the Mogging app, the explanation stays beside the image.'
  const next = reviseProductionScript(changed, changed.cues)
  expect(sectionAudioKey(master.cues[0], voice)).toBe(sectionAudioKey(next.cues[0], voice))
  expect(sectionAudioKey(master.cues[3], voice)).not.toBe(sectionAudioKey(next.cues[3], voice))
  expect(sectionAudioKey(master.cues[0], voice)).not.toBe(sectionAudioKey(master.cues[0], voiceDirection('expert')))
  const layout = structuredClone(master.cues[0]); layout.section!.visuals.reverse()
  expect(sectionAudioKey(layout, voice)).toBe(sectionAudioKey(master.cues[0], voice))
  expect(() => assembleProductionAudio(compile(), new Map())).toThrow('Record')
})

test('measured runtime and CTA placement are release checks, never silently accelerated', () => {
  const video = compile(30)
  const clips = recordings()
  const cue = master.cues[0], key = sectionAudioKey(cue, voice)
  clips.set(key, { key, cueId: cue.id, pcm: new Uint8Array(24000 * 2 * 30), words: undefined })
  const result = assembleProductionAudio(video, clips)
  expect(productionTimingIssues(result.composition, 30).join(' ')).toContain('shorten or remove')
  expect(productionTimingIssues(result.composition, 30).join(' ')).toContain('after 20 seconds')
})


test('recording bundles restore exact section bytes and reject stale, duplicate or invalid audio', async () => {
  const clips = recordings(true)
  const bundle = JSON.parse(JSON.stringify(packProductionRecording(master, voice, clips)))
  const restored = restoreProductionRecording(bundle)
  for (const [key, clip] of clips) expect(restored.clips.get(key)!.pcm).toEqual(clip.pcm)
  const first = assembleProductionAudio(compile(30), clips)
  const resumed = assembleProductionAudio(compile(30), restored.clips)
  expect(new Uint8Array(await resumed.file.arrayBuffer())).toEqual(new Uint8Array(await first.file.arrayBuffer()))
  expect(() => restoreProductionRecording({ ...bundle, clips: [bundle.clips[0], bundle.clips[0]] })).toThrow('invalid')
  expect(() => restoreProductionRecording({ ...bundle, clips: [{ ...bundle.clips[0], cueId: 'stale' }] })).toThrow('does not belong')
  expect(() => restoreProductionRecording({ ...bundle, clips: [{ ...bundle.clips[0], pcmBase64: 'AQ==' }] })).toThrow('invalid')
  const blank = structuredClone(master); blank.cues[0].text = '   '
  expect(() => reviseProductionScript(blank, blank.cues)).toThrow('complete thought')
})

test('reordering complete independent sections keeps their exact recorded PCM and spoken word identities', async () => {
  const ids = master.cues.map(cue => cue.section!.id)
  const light = ids.indexOf('light'), perspective = ids.indexOf('perspective')
  ;[ids[light], ids[perspective]] = [ids[perspective], ids[light]]
  const script = productionCut(master, 75, ids)
  const video = compileProductionVideo(script, input, creatorSubjects[0].example.images!, reportCategories, 'portrait-audit', voice)
  const clips = recordings(true), result = assembleProductionAudio(video, clips)
  const wave = new Uint8Array(await result.file.arrayBuffer())
  let offset = 44
  for (const cue of script.cues) {
    const clip = clips.get(sectionAudioKey(cue, voice))!
    expect(wave.slice(offset, offset + clip.pcm.length)).toEqual(clip.pcm)
    offset += clip.pcm.length + (cue.delivery!.pauseAfterMs * 48)
  }
  expect(result.composition.recording!.words.map(word => word.wordId)).toEqual(script.cues.flatMap(cue => scriptTokens(cue.text).map((_, index) => `${cue.id}/word:${index}`)))
})


test('the clip editor preserves modular section identity on drag without assigning it to repeated library previews', () => {
  const video = compile()
  const from = video.scenes.find(scene => scene.cueId === 'light')!, to = video.scenes.find(scene => scene.cueId === 'perspective')!
  const moved = moveCustomClip(video, from.id, to.id)
  expect(() => validateProductionScript(moved.script)).not.toThrow()
  expect(assembleProductionAudio(moved, recordings(true)).composition.timing).toBe('words')
  const gallery = customLibraryComposition(video, from.id, input, customSlides.slice(0, 3))
  expect(gallery.scenes).toHaveLength(3)
  expect(gallery.script!.cues.every(cue => !cue.section)).toBe(true)
})

test('every creator format varies actual visual decisions across people without changing approved narration', () => {
  for (const style of creatorVideoStyles) {
    const signatures = new Set<string>()
    for (const subject of creatorSubjects) {
      const script = createProductionDraft(subject.name)
      const images = creatorSubjectPhotos(subject)!
      const make = () => compileProductionVideo(script, input, images, reportCategories, style.id, voice)
      const video = make()
      expect(make()).toEqual(video)
      expect(narrationText(video)).toBe(script.cues.map(cue => cue.text).join('\n\n'))
      signatures.add(JSON.stringify(video.scenes.map(scene => ({
        layout: scene.featureStudy?.layout ?? scene.layout,
        motion: scene.featureStudy?.motion,
        kind: scene.source.kind,
        view: /profile/.test(scene.source.imageId ?? '') ? 'profile' : /three-quarter|angle/.test(scene.source.imageId ?? '') ? 'angle' : 'front',
        focus: scene.focus,
        editorial: scene.editorial,
        photoStudy: scene.photoStudy,
        print: scene.portraitFX?.print,
        lighting: scene.portraitFX?.lighting,
        graphic: scene.graphic && [scene.graphic.layout, scene.graphic.variant],
      }))))
      expect(video.scenes.find(scene => scene.cueId === 'cta')!.focus).toBe('hero')
    }
    // Compare decisions, excluding subject IDs, text and numerical variation metadata.
    expect(signatures.size).toBeGreaterThanOrEqual(3)
  }
})


test('contextual stories keep an integrated mention without a forced early score advert across cuts and recordings', () => {
  const draft = structuredClone(master)
  draft.promotion = 'contextual'
  draft.cues = draft.cues.filter(cue => !['cta', 'comparison'].includes(cue.sourceId))
  draft.revision = scriptRevision(draft.cues)
  expect(() => validateProductionScript(draft)).not.toThrow()
  for (const seconds of [30, 45, 60, 75] as const) {
    const cut = productionCut(draft, seconds)
    expect(cut.promotion).toBe('contextual')
    expect(cut.cues.filter(cue => /Mogging/.test(cue.text))).toHaveLength(1)
    const video = compileProductionVideo(cut, input, creatorSubjects[0].example.images!, reportCategories, 'portrait-audit', voice)
    expect(productionTimingIssues(assembleProductionAudio(video, recordings(true)).composition, seconds)).toEqual([])
  }
  const revised = reviseProductionScript(draft, draft.cues)
  expect(revised.promotion).toBe('contextual')
  const bundle = packProductionRecording(draft, voice, recordings())
  expect(restoreProductionRecording(bundle).script.promotion).toBe('contextual')
  const unbranded = { ...draft, cues: draft.cues.filter(cue => cue.sourceId !== 'product') }
  unbranded.revision = scriptRevision(unbranded.cues)
  expect(() => validateProductionScript(unbranded)).toThrow('one or two')
})

test('the exported generation brief separates story arguments from formats and carries exact narration into evidence review', () => {
  const brief = productionWritingBrief({ ...master, promotion: 'contextual' })
  expect(brief.policy.ctaDeadlineSeconds).toBeNull()
  expect(new Set(brief.storyStructures.map(structure => structure.id)).size).toBe(6)
  expect(brief.beatWorksheet.map(beat => beat.exactText)).toEqual(master.cues.map(cue => cue.text))
  expect(brief.beatWorksheet.every(beat => beat.evidenceStatus === 'needs-asset-and-claim-review')).toBe(true)
  expect(brief.status).toBe('draft-needs-editorial-approval')
})

test('authored source bindings reach the actual composition and missing assets fail before rendering', () => {
  const script = productionCut(master, 30), images = creatorSubjects[0].example.images!
  const shot = productionVisualPlan(script, input, images, reportCategories, 'portrait-audit')[0]
  const chosen = images.at(-1)!.id
  const composition = compileProductionVideo(script, input, images, reportCategories, 'portrait-audit', voice, 0, 'philtrum', 1, { [shot.id]: { kind: 'portrait', imageId: chosen } })
  expect(composition.scenes[0].source.imageId).toBe(chosen)
  expect(() => compileProductionVideo(script, input, images, reportCategories, 'portrait-audit', voice, 0, 'philtrum', 1, { [shot.id]: { kind: 'portrait', imageId: 'missing-reference' } })).toThrow('missing image')
})


test('unscored reports keep native preview layouts without fabricating visible numbers', () => {
  const unscored = { ...input, overallScore: '', potentialScore: '', strongestScore: '', opportunityScore: '' }
  const preview = compileProductionVideo(master, unscored, creatorSubjects[0].example.images!, reportCategories, 'report-led', voice)
  expect(preview.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
  expect(preview.scenes.every(scene => scene.source.hideScores)).toBe(true)
  for (const scene of preview.scenes.filter(scene => scene.graphic?.layout === 'dashboard')) expect(scene.graphic!.items.every(item => !item.value && !item.detail)).toBe(true)
})

test('format projection retains native reports, measurement components and evidence grids', () => {
  const report = compile(75, 'report-led'), measurement = compile(75, 'measurement-explainer'), visual = compile(75, 'hybrid-story'), portrait = compile(75, 'portrait-audit')
  expect(report.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
  expect(measurement.scenes.some(scene => scene.source.kind === 'component')).toBe(true)
  expect(visual.scenes.some(scene => scene.study?.operation === 'recap')).toBe(true)
  expect(portrait.scenes.some(scene => scene.portraitProgram?.actions.length)).toBe(true)
  const signature = (video: ReturnType<typeof compile>) => JSON.stringify(video.scenes.map(scene => [scene.source.kind, scene.study?.operation, scene.featureStudy?.layout, scene.graphic?.layout]))
  expect(new Set([report, measurement, visual, portrait].map(signature)).size).toBe(4)
})


test('reassembling an already measured video replaces its clock after restoring section audio', async () => {
  const clips = recordings(true), first = assembleProductionAudio(compile(), clips)
  const second = assembleProductionAudio(first.composition, clips)
  expect(second.alignmentError).toBeUndefined()
  expect(second.composition.timing).toBe('words')
  expect(await second.file.arrayBuffer()).toEqual(await first.file.arrayBuffer())
  expect(second.composition.recording).toEqual(first.composition.recording)
})
