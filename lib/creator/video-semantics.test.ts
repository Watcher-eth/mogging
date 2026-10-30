import { expect, test } from 'bun:test'
import { decodeVisualBeat, decodeVisualSection, validateSemanticSection } from './video-semantics'
import { applySemanticModel } from './video-semantic-model'
import { createProductionDraft } from './production-drafts'
import { compileProductionVideo, productionVisualPlan, reviseProductionScript, sectionAudioKey } from './video-production'
import { featureVariantPhotos } from './feature-study-assets'
import { creatorSubjects, creatorSubjectPhotos } from './creator-catalog'
import { createFeatureStudyDraft } from './feature-study-script'
import { reportCategories } from './mock-report-data'
import { voiceDirection } from './video-speech'
import { featureWipeProgress } from './feature-study'
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
