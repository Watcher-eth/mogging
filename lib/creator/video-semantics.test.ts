import { expect, test } from 'bun:test'
import { decodeVisualBeat, decodeVisualSection, validateSemanticSection } from './video-semantics'
import { applySemanticModel } from './video-semantic-model'
import { createProductionDraft } from './production-drafts'
import { compileProductionVideo, productionCut, productionVisualPlan, reviseProductionScript, sectionAudioKey } from './video-production'
import { featureVariantPhotos } from './feature-study-assets'
import { creatorSubjects, creatorSubjectPhotos } from './creator-catalog'
import { createFeatureStudyDraft } from './feature-study-script'
import { reportCategories } from './mock-report-data'
import { voiceDirection } from './video-speech'
import { narratedEvidenceClock, narratedEvidenceLayouts, featureWipeProgress } from './feature-study'
import { directVisualBeats } from './video-director'
import type { AnalysisPostInput } from './analysis-post'
const input: AnalysisPostInput = { formatId:'feature-audit',subject:'Marlon',hook:'',overallScore:'7.1',potentialScore:'8.2',strongestFeature:'Eye area',strongestScore:'8.1',opportunityFeature:'Jaw',opportunityScore:'6.2',recommendation:'',productFeatures:[],cta:'' }
const voice = voiceDirection('editorial')
const images = [...creatorSubjectPhotos(creatorSubjects[0])!, ...featureVariantPhotos('marlon')]
const master = createFeatureStudyDraft('Marlon', 'philtrum')
const withText = (text: string) => reviseProductionScript(master, master.cues.map(cue => cue.sourceId === 'contour' ? { ...cue, text } : cue))

test('meaning distinguishes opposite operations, nearby targets, negation and lower-face nouns', () => {
  for (const [text, feature, intent, operation] of [
    ['Shorten the philtrum while the eyes stay fixed.', 'philtrum', 'edit', 'shorten'],
    ['Lengthen the philtrum while the eyes stay fixed.', 'philtrum', 'edit', 'lengthen'],
    ["Do not shorten the philtrum to change this face.", 'philtrum', 'context', 'none'],
    ['Keep the eyes fixed and widen the jaw.', 'jaw', 'edit', 'widen'],
    ['The lower face follows the visible jaw outline.', 'jaw', 'observe', 'none'],
    ['Compare the original and edited versions side by side.', 'whole', 'compare', 'none'],
    ['Remove the freckles from the cheeks.', 'freckles', 'edit', 'remove'],
    ['This photograph cannot establish hormones or personality.', 'whole', 'context', 'none'],
  ] as const) {
    const beat = decodeVisualBeat(text)
    expect([beat.feature, beat.intent, beat.operation]).toEqual([feature, intent, operation])
  }
})
test('beats preserve URLs, punctuation and every original word exactly once', () => {
  for (const text of ['Want your score? Go to Mogging.com.', 'Keep the eyes fixed. Shorten the philtrum while watching the mouth position. Then compare both versions at the same scale.']) {
    const section = decodeVisualSection(text)
    expect(section.beats.map(beat => beat.quote).join(' ')).toBe(text)
    expect(() => validateSemanticSection(section, text)).not.toThrow()
  }
})
test('model proposals cannot rewrite scripts, omit sections, duplicate beats or override negation', () => {
  const script = createProductionDraft('Marlon')
  const sections = script.cues.map(cue => ({ sourceId: cue.sourceId, beats: decodeVisualSection(cue.text).beats }))
  const planned = applySemanticModel(script, { sections })
  expect(planned.revision).toBe(script.revision)
  expect(planned.cues.map(cue => sectionAudioKey(cue, voice))).toEqual(script.cues.map(cue => sectionAudioKey(cue, voice)))
  expect(() => applySemanticModel(script, { sections: sections.slice(1) })).toThrow('every original')
  const duplicate = structuredClone(sections); duplicate[0].beats.push(duplicate[0].beats[0])
  expect(() => applySemanticModel(script, { sections: duplicate })).toThrow('exact narration')
  const wrong = decodeVisualSection('Do not shorten the philtrum while editing this image.')
  wrong.beats[0].intent = 'edit'; wrong.beats[0].operation = 'shorten'
  expect(() => validateSemanticSection(wrong, wrong.sourceText)).toThrow('negated')
})
test('wording edits discard stale model metadata without invalidating untouched recordings', () => {
  const sections = master.cues.map(cue => ({ sourceId: cue.sourceId, beats: decodeVisualSection(cue.text, 'philtrum').beats }))
  const planned = applySemanticModel(master, { sections })
  const revised = reviseProductionScript(planned, planned.cues.map(cue => cue.sourceId === 'contour' ? { ...cue, text: 'Watch the profile from the side while following the jaw.' } : cue))
  expect(revised.cues.find(cue => cue.sourceId === 'contour')!.section!.semantic).toBeUndefined()
  expect(revised.cues[0].section!.semantic).toBeDefined()
  expect(sectionAudioKey(revised.cues[0], voice)).toBe(sectionAudioKey(planned.cues[0], voice))
})
test('each transformation targets its spoken feature and direction, with no default jaw stretch', () => {
  for (const [text, sign] of [['Shorten the philtrum while keeping the nose and eyes fixed.', -1], ['Lengthen the philtrum while keeping the nose and eyes fixed.', 1]] as const) {
    for (let variant = 0; variant < 6; variant++) {
      const plan = productionVisualPlan(withText(text), input, images, reportCategories, 'feature-study', variant, 'philtrum')
      const shot = plan.find(shot => shot.cue.sourceId === 'contour')!
      expect(shot.direction.featureStudy?.topic).toBe('philtrum')
      expect(Math.sign(shot.direction.featureStudy!.edit)).toBe(sign)
    }
  }
})
test('unsupported texture removal and ear replacement expose missing evidence instead of faking a comparison', () => {
  for (const text of ['Remove the freckles across the nose and cheeks.', 'Replace the ears with another pair for this comparison.']) {
    const shots = productionVisualPlan(withText(text), input, images, reportCategories, 'feature-study')
    const shot = shots.find(shot => shot.cue.sourceId === 'contour')!
    expect(shot.decision.missing.length).toBeGreaterThan(0)
    expect(['edit', 'wipe', 'compare', 'grid']).not.toContain(shot.decision.primitive)
    expect(shot.direction.featureStudy?.edit ?? 0).toBe(0)
  }
})
test('registered uploaded ear replacements and removals unlock photo comparisons only for the matching instruction', () => {
  for (const [feature, operation, text] of [['ears', 'replace', 'Replace the ears and compare the edited version with the original.'], ['freckles', 'remove', 'Remove the freckles from the cheeks and compare both versions.']] as const) {
    const edited = { ...images[0], id: `uploaded-${feature}`, retouch: { feature, operation, baselineImageId: images[0].id } }
    const plan = productionVisualPlan(withText(text), input, [...images, edited], reportCategories, 'feature-study')
    const shot = plan.find(shot => shot.cue.sourceId === 'contour')!
    expect(shot.decision.missing).toHaveLength(0)
    expect(shot.direction.featureStudy?.editMode).toBe('photo')
    expect(shot.direction.featureStudy?.images[0]).toBe(edited.id)
  }
})
test('every frame in a multi-beat section projects to the original word identities and no words are lost', () => {
  const script = withText('Look at the small space below the nose and above the upper lip. Shorten the philtrum while keeping the eyes fixed. Compare the original and edited versions at the same scale.')
  const video = compileProductionVideo(script, input, images, reportCategories, 'feature-study', voice)
  const shots = video.scenes.filter(scene => scene.cueId === 'contour')
  expect(shots.length).toBe(3)
  expect(shots.map(scene => scene.narration).join(' ')).toBe(script.cues.find(cue => cue.sourceId === 'contour')!.text)
  for (const scene of shots) for (const track of scene.tracks) if (track.wordId) expect(track.wordId).toStartWith(`${scene.scriptRange!.cueId}/word:`)
})
test('format grammars use distinct real primitives while narration and subject stay fixed', () => {
  const script = createFeatureStudyDraft('Marlon', 'philtrum')
  const sequences = new Set(['portrait-audit', 'report-led', 'measurement-explainer', 'hybrid-story', 'feature-study'].map(recipe => productionVisualPlan(script, input, images, reportCategories, recipe as 'feature-study').map(shot => shot.decision.primitive).join(',')))
  expect(sequences.size).toBe(5)
})
test('an alternate-view beat uses the actual three-quarter source instead of resetting to front for its topic', () => {
  const script = withText('Then look from another angle before deciding which details catch your attention.')
  const shot = productionVisualPlan(script, input, images, reportCategories, 'feature-study').find(shot => shot.cue.sourceId === 'contour')!
  expect(shot.direction.imageId).toContain('three-quarter')
  expect(shot.direction.featureStudy).toBeUndefined()
})
test('the comparison wipe is monotonic, eased, bounded and deterministic in reduced motion', () => {
  let previous = 0
  for (let ms = 0; ms <= 4000; ms += 20) { const next = featureWipeProgress(ms, 4000); expect(next).toBeGreaterThanOrEqual(previous); expect(next).toBeLessThanOrEqual(1); previous = next }
  expect(featureWipeProgress(0, 4000)).toBe(0)
  expect(featureWipeProgress(4000, 4000)).toBe(1)
  expect(featureWipeProgress(0, 4000, true)).toBe(.5)
})


test('specific brow changes never become a generic horizontal stretch and comparison variants keep the registered pair', () => {
  for (const text of ['Move the brows up and compare both versions.', 'Raise the brows in the edited version.', 'Make the brow arch higher in the edited version.']) {
    const shot = productionVisualPlan(withText(text), input, images, reportCategories, 'feature-study').find(shot => shot.cue.sourceId === 'contour')!
    expect(shot.decision.missing.length).toBeGreaterThan(0)
    expect(shot.direction.photoStudy).toBeUndefined()
  }
  for (let variant = 0; variant < 12; variant++) {
    const shot = productionVisualPlan(withText('Compare the original and shortened philtrum at the same scale.'), input, images, reportCategories, 'hybrid-story', variant).find(shot => shot.cue.sourceId === 'contour')!
    expect(['compare', 'wipe']).toContain(shot.decision.primitive)
    expect(shot.decision.alternatives).not.toContain('grid')
  }
  const shot = productionVisualPlan(withText('Widen the lips while keeping the jaw fixed.'), input, images, reportCategories, 'feature-study').find(shot => shot.cue.sourceId === 'contour')!
  expect(shot.direction.photoStudy?.axis).toBe('x')
})


test('a contextual brand mention does not force app UI while an actual report explanation does', () => {
  expect(decodeVisualBeat('For Mogging comparisons, keep the same expression.').intent).not.toBe('report')
  expect(decodeVisualBeat('Mogging separates brow position from eye shape.').intent).toBe('report')
  expect(decodeVisualBeat('In the app, the report keeps the feature beside its explanation.').intent).toBe('report')
})


test('an authored product category remains a report when narration says together', () => {
  const section = structuredClone(master.cues.find(cue => cue.section?.role === 'product')!.section!)
  section.visuals = [{ treatment: 'report', categoryId: 'eyes', focus: 'feature:eyes.opening', view: 'front', reason: 'Show the eye-opening category observation.' }]
  const text = 'On Mogging, eye opening is one part of this comparison. Here, expression and photography changed together.'
  section.semantic = { sourceText: text, decoder: 'rules-v1', beats: [{ quote: text, feature: 'whole', intent: 'report', operation: 'none', view: 'front', confidence: 1, rationale: 'Show the authored category.' }] }
  for (const recipe of ['portrait-audit', 'report-led', 'measurement-explainer', 'feature-study', 'hybrid-story'] as const) {
    const shot = directVisualBeats(section, text, recipe, images, reportCategories, input, 0, [])[0]
    expect(shot.direction.kind).toBe('report')
    expect(shot.direction.categoryId).toBe('eyes')
    expect(shot.direction.focus).toBe('feature:eyes.opening')
  }
})

test('a spoken pair keeps its sources across style variations, then expands the photo named in the recording', () => {
  const script = withText('Compare these two photos at the same scale. Now look at the second photo and follow the cheekbone.')
  const originals = images.filter(photo => !photo.retouch && !photo.comparison)
  const layouts = new Set<string>()
  for (const recipe of ['portrait-audit', 'report-led', 'measurement-explainer', 'feature-study', 'documentary-studio'] as const) {
    for (let variant = 0; variant < 6; variant++) {
      const video = compileProductionVideo(script, input, originals, reportCategories, recipe, voice, variant)
      const shots = video.scenes.filter(scene => scene.cueId === 'contour')
      const pair = shots[0].featureStudy!
      expect(pair.images[0]).toBe(originals[0].id)
      expect(new Set(pair.images).size).toBe(2)
      expect(pair.evidence?.initial).toBeUndefined()
      const focus = shots.at(-1)!.featureStudy!
      expect(focus.images).toEqual(pair.images)
      expect(focus.evidence?.events[0].photo).toBe(1)
      expect(shots.at(-1)!.narration.split(/\s+/)[focus.evidence!.events[0].word]).toBe('look')
      layouts.add(pair.evidence!.layout)
    }
  }
  expect(layouts).toEqual(new Set(narratedEvidenceLayouts))
  const single = compileProductionVideo(script, input, originals.slice(0, 1), reportCategories, 'feature-study', voice)
  expect(single.scenes.filter(scene => scene.cueId === 'contour').every(scene => !scene.featureStudy?.evidence && !scene.featureStudy?.edit && !scene.photoStudy)).toBe(true)

  const roundTrip = compileProductionVideo(withText('Compare these two photos at the same scale. Now look at the second photo and follow the cheekbone. Back to both pictures, and notice the difference.'), input, originals, reportCategories, 'feature-study', voice, 4)
  const pairedShots = roundTrip.scenes.filter(scene => scene.cueId === 'contour' && scene.featureStudy?.evidence)
  const restored = pairedShots.find(scene => scene.narration.startsWith('Back to both'))!
  expect(restored.featureStudy?.images).toEqual(pairedShots[0].featureStudy?.images)
  expect(restored.featureStudy?.evidence).toMatchObject({ layout: pairedShots[0].featureStudy?.evidence?.layout, initial: 1, events: [{ photo: null, word: 0 }] })

  // A very short speech fragment can end while its visual zoom is still in motion.
  const focusShot = pairedShots.find(scene => scene.featureStudy?.evidence?.events.some(event => event.photo === 1))!
  const boundary = { ...restored, startMs: focusShot.startMs + 120, words: [{ text: 'Back', startMs: 150, endMs: 260 }] }
  const focusAtStart = { ...focusShot, words: [{ text: 'Look', startMs: 0, endMs: 90 }], featureStudy: {
    ...focusShot.featureStudy!, evidence: { ...focusShot.featureStudy!.evidence!, events: [{ photo: 1, word: 0 }] },
  } }
  expect(narratedEvidenceClock([focusAtStart, boundary], boundary, 0)).toMatchObject({
    events: [{ photo: 1, at: -120 }, { photo: null, at: 150 }],
  })

  const namedRight = withText('Compare these two photos at the same scale. Now look at the right photo and follow the cheekbone.')
  for (let variant = 0; variant < 3; variant++) {
    const video = compileProductionVideo(namedRight, input, originals, reportCategories, 'feature-study', voice, variant)
    expect(video.scenes.find(scene => scene.cueId === 'contour')?.featureStudy?.evidence?.layout).not.toBe('stacked')
  }

  const separateSections = reviseProductionScript(master, master.cues.map(cue => cue.sourceId === 'contour'
    ? { ...cue, text: 'Compare these two photos at the same scale.' }
    : cue.sourceId === 'light' ? { ...cue, text: 'Now look at the second photo and follow the cheekbone.' } : cue))
  expect(() => productionCut(separateSections, 75, ['hook', 'cta', 'light', 'takeaway'])).toThrow('Keep the comparison')
})

test('score changes, registered morphs and quoted reactions only appear when their narration supports them', () => {
  const compileText = (text: string, recipe: 'feature-study' | 'documentary-studio', variant = 1) =>
    compileProductionVideo(withText(text), input, images, reportCategories, recipe, voice, variant).scenes.find(scene => scene.cueId === 'contour')!
  const text = 'Imagine the jaw score going from six point two to seven point four.'
  for (const recipe of ['feature-study', 'documentary-studio'] as const) {
    const score = compileText(text, recipe).scoreCallouts?.[0]
    expect(score).toMatchObject({ label: 'Example score', from: 6.2, value: 7.4 })
    expect(text.split(/\s+/)[score!.word]).toBe('four.')
    expect(compileText('The jaw score went from six point two to seven point four.', recipe).scoreCallouts?.some(cue => cue.from !== undefined)).toBeFalsy()
    const morph = compileText('Watch as we narrow the nose while keeping the eyes fixed.', recipe)
    expect(morph.featureStudy?.editWord ?? morph.photoStudy?.startWord).toBe(3)
    expect(morph.featureStudy?.topic ?? morph.photoStudy?.feature).toBe('nose')
  }
  const assessed = reportCategories.find(report => report.id === 'jaw')!
  const measured = compileProductionVideo(withText('The jaw score went from six point two to seven point four.'), input, images,
    [{ ...assessed, score: 6.2, assessmentImageId: images[0].id }, { ...assessed, score: 7.4, assessmentImageId: images[1].id }],
    'feature-study', voice).scenes.find(scene => scene.cueId === 'contour')!
  expect(measured.featureStudy?.images).toEqual([images[0].id, images[1].id])
  expect(measured.featureStudy?.evidence?.events).toEqual([{ photo: 1, word: measured.scoreCallouts![0].word }])

  const reply = compileText('One comment asked, “Is that the same photo?” That question gets to the point.', 'feature-study')
  expect(reply.presentation).toMatchObject({ kind: 'conversation', dialogue: ['Is that the same photo?'] })
  expect(reply.presentation?.claim).toBeUndefined()
  const question = compileText('Here is the question: why does the same face read so differently in this light?', 'feature-study')
  expect(question.presentation).toMatchObject({ kind: 'question-slate', dialogue: ['why does the same face read so differently in this light?'] })
  const illustration = compileText('Imagine we narrow the nose and the score goes from six to seven.', 'feature-study')
  expect(illustration.photoStudy?.feature).toBe('nose')
  expect(illustration.scoreCallouts?.[0]).toMatchObject({ label: 'Example score', from: 6, value: 7 })
})

test('Qoves can reveal the requested camera angle or revise a premise on its spoken correction', () => {
  const compile = (text: string, sources = images) => compileProductionVideo(withText(text), input, sources, reportCategories, 'feature-study', voice, 4)
  const angle = 'The three-quarter view makes the jaw contour easier to see from another angle.'
  const front = images.find(image => image.id === 'marlon-front')!
  const turned = images.find(image => image.id.includes('three-quarter') && !image.retouch)!
  const filmstrip = compile(angle).scenes.find(scene => scene.cueId === 'contour' && scene.presentation?.kind === 'view-filmstrip')!
  expect(filmstrip.source.imageId).toBe(front.id)
  expect(filmstrip.presentation?.imageIds[0]).toBe(turned.id)
  expect(filmstrip.presentation?.beats?.[0].anchor).toBe('three-quarter view')
  expect(compile(angle, [front]).scenes.some(scene => scene.presentation?.kind === 'view-filmstrip')).toBe(false)

  const premise = 'People assume symmetry explains this portrait, but the lighting changes how strong the features look.'
  const revision = compile(premise).scenes.find(scene => scene.cueId === 'contour' && scene.presentation?.kind === 'premise-revision')!
  expect(revision.presentation?.beats?.map(beat => beat.anchor)).toEqual([
    'symmetry explains this portrait', 'but the lighting changes how strong the features look',
  ])
  expect(revision.narration).toBe(premise)
})

test('describing a tapered face never requests a procedural morph', () => {
  const quote = 'The face shape comes from the whole outline, where the cheekbones narrow into the jaw.'
  expect(decodeVisualBeat(quote).intent).not.toBe('edit')
  expect(decodeVisualBeat(quote).operation).toBe('none')
  for (let variant = 0; variant < 6; variant++) {
    const video = compileProductionVideo(withText(quote), input, images, reportCategories, 'feature-study', voice, variant)
    for (const scene of video.scenes.filter(scene => scene.cueId === 'contour')) {
      expect(scene.photoStudy).toBeUndefined()
      expect(scene.featureStudy?.edit ?? 0).toBe(0)
    }
  }
})

test('a narrated view sequence can roll or orbit real sources across caption cuts', () => {
  const quote = 'From the front you see the whole outline. At three-quarter you see more cheek depth. In profile the chin adds the last piece.'
  const script = withText(quote)
  const expected = ['marlon-front', ...images.filter(image => !image.retouch && /three-quarter|profile/.test(image.id)).map(image => image.id)]
  for (const [variant, kind] of [[1, 'example-deck'], [2, 'example-constellation']] as const) {
    const video = compileProductionVideo(script, input, images, reportCategories, 'feature-study', voice, variant)
    const scenes = video.scenes.filter(scene => scene.cueId === 'contour')
    expect(scenes.length).toBeGreaterThan(1)
    for (const scene of scenes) {
      expect(scene.presentation?.kind).toBe(kind)
      expect([scene.source.imageId, ...scene.presentation!.imageIds]).toEqual(expected)
      expect(scene.presentation?.beats?.map(beat => beat.anchor.toLowerCase())).toEqual(['from the front', 'three-quarter', 'profile'])
    }
  }
  const onePhoto = compileProductionVideo(script, input, images.slice(0, 1), reportCategories, 'feature-study', voice, 1)
  expect(onePhoto.scenes.some(scene => ['example-deck','example-constellation'].includes(scene.presentation?.kind ?? ''))).toBe(false)
})

test('full-screen Qoves treatments reach generated videos on their matching narration', () => {
  const cases = [
    ['chapter-defocus', 'Next, the jawline. Its angle is the part to watch.', 0],
    ['statement-slit', 'The point is the outline changes the whole impression.', 2],
    ['contour-matte', 'Focus just on the lip outline for a moment.', 1],
  ] as const
  for (const [kind, narration, variation] of cases) {
    const script = withText(narration)
    for (const recipe of ['feature-study', 'editorial-story'] as const) {
      const video = compileProductionVideo(script, input, images, reportCategories, recipe, voice, variation)
      const scene = video.scenes.find(item => item.cueId === 'contour' && item.presentation?.kind === kind)
      expect(scene?.presentation?.beats?.every(item => narration.includes(item.anchor))).toBe(true)
      expect(video.script?.revision).toBe(script.revision)
    }
  }
})
