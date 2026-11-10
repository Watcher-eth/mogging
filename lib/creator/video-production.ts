import { isVideoInvitation } from './video-branding'
import type { CreatorSubjectAnalysis } from './creator-stories'
import { mentionsVisualFeature } from './video-semantics'
import { type FeatureTopic } from './feature-study'
import { directVisualBeats, type VisualDecision } from './video-director'
import { z } from 'zod'
import { scriptSchema, scriptRevision, scriptTokens, scriptVisualSeed, createVideoScript, type VideoScript } from './video-script'
import { compileAnalysisVideo, parseComposition, spokenWordSchema, type VideoComposition, type VideoDirection, type VideoRecipe } from './video-composition'
import { voiceDirection, voiceDirectionSchema, type VoiceDirection } from './video-speech'
import { alignVideoVoiceover, assembleSpeech, retainVideoVoiceover } from './video-voiceover'
import type { AnalysisPostInput, AnalysisPostPlan } from './analysis-post'
import type { GeneratorImage } from './content-generator'
import { bindScriptScenes } from './video-script'
import type { ReportCategory } from './mobile-overlay-engine/report-data'

export const productionLengths = [30, 45, 60, 75] as const
export type ProductionLength = typeof productionLengths[number]
export const productionPolicy = { maxSeconds: 75, ctaDeadlineSeconds: 20, ctaTargetSeconds: 3, wordsPerMinute: 165, mentions: '2 in 30/45-second cuts; 3 in 60/75-second cuts', timing: 'Whole sections, never truncate a sentence or speed audio to fit.' } as const
export const sectionDurationMs = (cue: VideoScript['cues'][number], pace = productionPolicy.wordsPerMinute) => Math.round(scriptTokens(cue.text).length / pace * 60000) + (cue.delivery?.pauseAfterMs ?? 120)
const earlyScorePromotion = (script: VideoScript) => script.promotion !== 'contextual'
const mentionsBrand = (text: string) => /\bMogging(?:\.com)?\b/i.test(text)

export function validateProductionScript(value: unknown): VideoScript {
  const script = scriptSchema.parse(value)
  if (script.cues.some(cue => !cue.section)) throw new Error('Every production cue needs an editorial section.')
  if (script.cues.some(cue => cue.sourceId !== cue.section!.id || cue.text.length > 1200)) throw new Error('Each section must own its cue and stay below 1,200 characters.')
  if (script.cues.at(-1)!.section!.role !== 'takeaway') throw new Error('End with a complete takeaway.')
  const ids = script.cues.map(cue => cue.section!.id)
  if (new Set(ids).size !== ids.length) throw new Error('Section IDs must be unique.')
  if (script.cues.filter(cue => cue.section!.role === 'hook').length !== 1 || script.cues[0].section!.role !== 'hook') throw new Error('Start with one self-contained hook.')
  const earlyScore = earlyScorePromotion(script), ctaCount = script.cues.filter(cue => cue.section!.role === 'cta').length
  if (earlyScore ? ctaCount !== 1 : ctaCount > 1) throw new Error(earlyScore ? 'Include exactly one direct CTA section.' : 'Use at most one invitation section.')
  if (!script.cues.some(cue => cue.section!.role === 'takeaway')) throw new Error('Include a complete takeaway.')
  let elapsed = 0
  for (const cue of script.cues) {
    const section = cue.section!
    if (section.dependsOn.some(id => !ids.slice(0, ids.indexOf(section.id)).includes(id))) throw new Error(`${section.title}: required context must appear earlier in this cut.`)
    if (earlyScore && section.role === 'cta') {
      if (elapsed > 20000) throw new Error('The direct CTA must start within 20 seconds.')
      if (!/Mogging\.com/i.test(cue.text) || !/score/i.test(cue.text)) throw new Error('The direct CTA must invite viewers to find their score at Mogging.com.')
      if (sectionDurationMs(cue) < 2000 || sectionDurationMs(cue) > 4000) throw new Error('Keep the direct CTA around three seconds (2–4 seconds estimated).')
    }
    elapsed += sectionDurationMs(cue)
  }
  if (elapsed > 75000) throw new Error('The master script must fit within 75 seconds at a natural reading pace.')
  const mentions = script.cues.filter(cue => mentionsBrand(cue.text)).length
  const required = elapsed > 45000 ? 3 : 2
  if (earlyScore && mentions < required) throw new Error(`This cut needs ${required} distinct, natural Mogging mentions, including its CTA.`)
  if (!earlyScore && (mentions < 1 || mentions > 2)) throw new Error('Use one or two contextual Mogging mentions, tied to useful evidence or the closing invitation.')
  return script
}

// Approval changes content identity only when wording or performance changes.
export function reviseProductionScript(script: VideoScript, cues: VideoScript['cues']): VideoScript {
  if (cues.some(cue => !cue.text.trim())) throw new Error('Write a complete thought for every section, or remove the section from the cut.')
  const approved = createVideoScript(cues.map(cue => ({ id: cue.sourceId, narration: cue.text, delivery: cue.delivery })))
  return validateProductionScript({ ...approved, promotion: script.promotion, references: script.references, cues: approved.cues.map((cue, index) => ({ ...cue, section: cues[index].section ? { ...cues[index].section!, semantic: cues[index].section!.semantic?.sourceText === cue.text ? cues[index].section!.semantic : undefined } : undefined })) })
}

export function productionCut(master: VideoScript, seconds: ProductionLength, sectionIds?: string[]): VideoScript {
  validateProductionScript(master)
  const byId = new Map(master.cues.map(cue => [cue.section!.id, cue]))
  let cues: VideoScript['cues']
  if (sectionIds) {
    if (new Set(sectionIds).size !== sectionIds.length || sectionIds.some(id => !byId.has(id))) throw new Error('Choose unique sections from this master script.')
    cues = sectionIds.map(id => byId.get(id)!)
  } else {
    const required = new Set(master.cues.filter(cue => ['hook', 'cta', 'takeaway'].includes(cue.section!.role)).map(cue => cue.section!.id))
    // Keep product proof in every cut and a second contextual mention in longer cuts.
    if (earlyScorePromotion(master) && seconds > 45) { const mention = master.cues.find(cue => cue.section!.role === 'explanation' && mentionsBrand(cue.text)); if (mention) required.add(mention.section!.id) }
    const product = master.cues.find(cue => cue.section!.role === 'product')
    if (product && earlyScorePromotion(master)) required.add(product.section!.id)
    if (!earlyScorePromotion(master) && !master.cues.some(cue => required.has(cue.section!.id) && mentionsBrand(cue.text))) {
      const mention = master.cues.find(cue => mentionsBrand(cue.text))
      if (mention) required.add(mention.section!.id)
    }
    const include = (id: string) => { if (required.has(id)) return; required.add(id); byId.get(id)!.section!.dependsOn.forEach(include) }
    for (const id of [...required]) byId.get(id)!.section!.dependsOn.forEach(include)
    const duration = () => master.cues.filter(cue => required.has(cue.section!.id)).reduce((ms, cue) => ms + sectionDurationMs(cue), 0)
    for (const cue of [...master.cues].sort((a, b) => b.section!.priority - a.section!.priority)) {
      const before = new Set(required)
      include(cue.section!.id)
      const selected = master.cues.filter(cue => required.has(cue.section!.id))
      const ctaIndex = selected.findIndex(cue => cue.section!.role === 'cta')
      if (duration() > seconds * 1000 || earlyScorePromotion(master) && selected.slice(0, ctaIndex).reduce((ms, cue) => ms + sectionDurationMs(cue), 0) > 20000) { required.clear(); before.forEach(id => required.add(id)) }
    }
    cues = master.cues.filter(cue => required.has(cue.section!.id))
  }
  if (cues.reduce((ms, cue) => ms + sectionDurationMs(cue), 0) > seconds * 1000) throw new Error(`These complete sections exceed ${seconds} seconds. Remove a section or shorten its wording.`)
  return validateProductionScript({ ...master, cues, revision: scriptRevision(cues) })
}

export function productionTimeline(script: VideoScript) {
  let startMs = 0
  return script.cues.map(cue => { const durationMs = sectionDurationMs(cue), start = startMs; startMs += durationMs; return { ...cue.section!, cueId: cue.id, text: cue.text, startMs: start, durationMs } })
}

export function productionVisualPlan(script: VideoScript, input: AnalysisPostInput, images: GeneratorImage[], reports: ReportCategory[], recipe: VideoRecipe, variant = 0, topic: FeatureTopic = 'philtrum', amount = 1) {
  const history: VisualDecision[] = []
  const hook = script.cues.find(cue => cue.section?.role === 'hook')?.text ?? ''
  const context = recipe === 'feature-study' && mentionsVisualFeature(hook, topic) ? topic : 'whole'
  return script.cues.flatMap(cue => directVisualBeats(cue.section!, cue.text, recipe, images, reports, input, variant, history, context, amount).map((shot, index) => ({ ...shot, cue, id: `${cue.sourceId}/beat:${index}` })))
}
export function compileProductionVideo(script: VideoScript, input: AnalysisPostInput, images: GeneratorImage[], reports: ReportCategory[], recipe: VideoRecipe, voice: VoiceDirection, variant = 0, featureTopic: FeatureTopic = 'philtrum', featureAmount = 1, authoredDirections: Record<string, VideoDirection> = {}): VideoComposition {
  validateProductionScript(script)
  const shots = productionVisualPlan(script, input, images, reports, recipe, variant, featureTopic, featureAmount).map(shot => {
    const direction = { ...shot.direction, ...authoredDirections[shot.id] }
    // A direct invitation has its own quiet portrait stage instead of stamping
    // an app-store lockup over a report's measurements and values.
    return { ...shot, direction: isVideoInvitation(shot.cue) ? { kind: 'portrait' as const, imageId: direction.imageId ?? images[0]?.id, categoryId: direction.categoryId, focus: 'hero', editorial: 'context' as const } : direction }
  })
  const assetIds = new Set(images.map(image => image.id))
  for (const direction of Object.values(authoredDirections)) {
    for (const id of [direction.imageId, ...(direction.featureStudy?.images ?? [])]) if (id && !assetIds.has(id)) throw new Error(`Authored visual references a missing image: ${id}`)
  }
  const timeline = productionTimeline(script)
  let start = 0
  const plan: AnalysisPostPlan = { title: 'Mogging · Modular editorial', duration: timeline.at(-1)!.startMs / 1000 + timeline.at(-1)!.durationMs / 1000, formatLabel: 'Semantic visual edit', strategy: 'Exact narration beats, asset-backed evidence and format grammar.', caption: '', scenes: shots.map(shot => {
    const sectionMs = sectionDurationMs(shot.cue), totalWords = scriptTokens(shot.cue.text).length
    const durationMs = sectionMs * scriptTokens(shot.beat.quote).length / totalWords
    const begin = start; start += durationMs
    return { id: shot.id, start: begin / 1000, end: start / 1000, label: shot.cue.section!.title, narration: shot.beat.quote, onScreen: shot.beat.quote, purpose: shot.decision.reason, visual: shot.decision.primitive, pace: 'hold' }
  }) }
  const projection = createVideoScript(shots.map(shot => ({ id: shot.id, narration: shot.beat.quote, delivery: shot.cue.delivery })))
  projection.cues = projection.cues.map((cue, index) => ({ ...cue, section: { ...shots[index].cue.section!, semantic: undefined } }))
  const directions = Object.fromEntries(shots.map(shot => [shot.id, { ...shot.direction, delivery: shot.cue.delivery }]))
  const variation = (scriptVisualSeed(images[0]?.id ?? input.subject, recipe) % 10000 + variant) % 10000
  const compiled = compileAnalysisVideo(plan, input, images.map(image => image.id), 'brand', reports, { recipe, variation, directions, script: projection })
  const originalIds = new Map(shots.map(shot => [shot.id, shot.cue.sourceId]))
  const unscored = ![input.overallScore, input.strongestScore, input.opportunityScore].some(value => value?.trim())
  const scenes = bindScriptScenes(script, compiled.scenes.map(scene => ({ ...scene, source: { ...scene.source, ...(unscored ? { hideScores: true } : {}) }, cueId: originalIds.get(scene.cueId)! }))).map(scene => {
    const invitation = isVideoInvitation(script.cues.find(cue => cue.sourceId === scene.cueId))
    return { ...scene, ...(invitation ? { source: { ...scene.source, overlay: 'none' as const }, portraitProgram: undefined, portraitFX: undefined, featureStudy: undefined, photoStudy: undefined, profileStudy: undefined, study: undefined, scoreCallouts: [] } : {}),
      tracks: scene.tracks.filter(track => !invitation || track.target !== 'overlay').map(track => ({ ...track, ...(track.wordId ? { wordId: `${scene.scriptRange.cueId}/word:${scene.scriptRange.startWord + (track.wordIndex ?? 0)}` } : {}) })) }
  })
  return parseComposition({ ...compiled, voice, script, scenes })
}

export type SectionAudio = { key: string; cueId: string; pcm: Uint8Array; words?: Array<{ text: string; startMs: number; endMs: number }> }
export const sectionAudioKey = (cue: VideoScript['cues'][number], voice: VoiceDirection) => JSON.stringify([cue.id, cue.text, cue.delivery, voice])
export function assembleProductionAudio(composition: VideoComposition, clips: ReadonlyMap<string, SectionAudio>) {
  const cues = composition.script!.cues
  const groups = cues.map(cue => {
    const scenes = composition.scenes.filter(scene => scene.scriptRange?.cueId === cue.id)
    if (!scenes.length) throw new Error('A recorded section has no visual projection.')
    return { cue, scenes }
  })
  const canonical = parseComposition({ ...composition, timing: 'estimated', recording: undefined, scenes: bindScriptScenes(composition.script!, groups.map(({ cue, scenes }) => ({ ...scenes[0], cueId: cue.sourceId, narration: cue.text, durationMs: scenes.reduce((sum, scene) => sum + scene.durationMs, 0), words: undefined }))) })
  const assembled = assembleSpeech(canonical, groups.map(({ cue }, index) => {
    const clip = clips.get(sectionAudioKey(cue, composition.voice ?? voiceDirection('editorial')))
    if (!clip) throw new Error(`Record “${cue.section?.title ?? cue.text}” before auditioning this cut.`)
    return { sceneId: canonical.scenes[index].id, pcm: clip.pcm, words: clip.words }
  }))
  let timed = assembled.composition
  let alignmentError: string | undefined
  if (assembled.alignment) {
    try { timed = alignVideoVoiceover(timed, assembled.alignment, timed.durationMs) }
    catch (error) { alignmentError = error instanceof Error ? error.message : 'Review the recognized transcript.' }
  }
  const final = retainVideoVoiceover(timed, composition, timed.durationMs)
  return { ...assembled, composition: final, alignmentError }
}

export function productionTimingIssues(composition: VideoComposition, limit: ProductionLength) {
  const issues: string[] = []
  if (composition.durationMs > limit * 1000) issues.push(`Recorded cut is ${(composition.durationMs / 1000).toFixed(1)}s; shorten or remove a section to fit ${limit}s.`)
  const cta = composition.scenes.find(scene => composition.script?.cues.find(cue => cue.id === scene.scriptRange?.cueId)?.section?.role === 'cta')
  const earlyScore = !composition.script || earlyScorePromotion(composition.script)
  if (earlyScore && !cta) issues.push('Restore the direct CTA section before exporting a recorded cut.')
  if (earlyScore && cta && cta.startMs > 20000) issues.push('The recorded CTA starts after 20 seconds. Move it earlier.')
  if (earlyScore && cta && (cta.durationMs < 2000 || cta.durationMs > 4000)) issues.push('Audition the CTA: its recorded length should be about three seconds.')
  if (composition.script) { try { validateProductionScript(composition.script) } catch (error) { issues.push(error instanceof Error ? error.message : 'Review the script structure.') } }
  return issues
}

export function productionWritingBrief(script: VideoScript, subjectAnalysis?: CreatorSubjectAnalysis) {
  return {
    policy: { ...productionPolicy, ...(script.promotion === 'contextual' ? { promotion: 'contextual', ctaDeadlineSeconds: null, ctaTargetSeconds: null, mentions: 'One useful contextual mention; at most one additional closing invitation. No forced early interruption.' } : { promotion: 'early-score' }) },
    subjectAnalysis, scoreUse: 'Use a saved category score occasionally when it directly advances the argument, with its photo source and /8 or /10 scale. Weave it into the observation naturally, for example On Mogging, followed by the relevant finding. Do not force a score into every story, reveal a mystery early, or rerate edited and profile images as the baseline. Changed narration needs a newly approved recording.',
    status: 'draft-needs-editorial-approval', script, references: script.references ?? [],
    // Story structure describes the argument; a format describes its visual presentation.
    storyStructures: [
      { id: 'controlled-change', sequence: ['Show the original and one changed variable', 'Ask what changed in the impression', 'Explain the visible mechanism', 'Restore the original and resolve the question'], proof: 'Registered original/edit pair; unchanged crop, expression, light and neighboring features.' },
      { id: 'viewer-choice', sequence: ['Offer a visible choice', 'Let the viewer form a prediction', 'Reveal a counterexample', 'Explain the distinction and return to the choice'], proof: 'Identify both examples; do not present a different person or photograph as a controlled edit.' },
      { id: 'single-feature', sequence: ['Point to an overlooked detail', 'Show its relationship to a neighboring feature', 'Test one change or show a contrasting example', 'Return to the whole face'], proof: 'Exact anchors and an appropriate close-up; terminology alone is not evidence.' },
      { id: 'data-reveal', sequence: ['Ask a concrete question', 'Introduce the study and what it measured', 'Reveal the relevant chart relationship', 'Explain the result and its limits'], proof: 'Primary source, genuine values, axes and population; never substitute an illustrative score dial.' },
      { id: 'tradeoff', sequence: ['Establish a familiar benefit', 'Introduce the overlooked cost or exception', 'Show two pieces of evidence', 'Resolve when the claim applies'], proof: 'Evidence for both sides; distinguish perception, association and causation.' },
      { id: 'example-series', sequence: ['State one visual theme', 'Compare distinct named examples', 'Explain the difference within the theme', 'Close with the shared principle'], proof: 'Actual example assets and independent observations; no ancestry or personality inference from a face.' },
    ],
    guidance: [
      'Start with an asset-backed observation, choice or reversible experiment that can be seen immediately. Write several different hook mechanisms, not synonyms of one question.',
      'Write the answer to the hook before expanding the middle. Each sentence must add evidence, explain a mechanism, answer an objection or advance the resolution.',
      'Use spoken clauses, contractions and concrete verbs: follow, lift, trace, compare. Introduce anatomy only when it helps, and translate it into plain language.',
      'Use this/that/these only when the exact referent is visible. Make clipped sections self-contained or declare dependsOn. No orphaned setup or missing payoff in short cuts.',
      'Choose one story structure independently of the five visual formats. Variations preserve claim, source, edit operation and comparison conditions; vary only evidence-equivalent framing, guide style, reveal and cut.',
      'For every exact narration beat, specify claim, evidence source, asset IDs, protected features, operation and axis, crop, anchor geometry, short label phrase, reveal word and exit destination. Mark missing assets rather than inventing proof.',
      'Distinguish brow translation from brow arch, lip thickness from lip width, natural eye corner from eyeliner, beard edge from jaw anatomy, and expression change from image warping.',
      'Prefer establish → inspect → demonstrate → restore. Use registered toggles/wipes for edits, paired views for angles, and grids only when adding genuinely distinct evidence. A decorative overlay does not prove a transformation.',
      'Keep the same image alive through compatible reframing. Hold captions and their fade stationary when their position is unchanged. Cut direction follows the incoming evidence; use a hard cut when identity changes.',
      'One main action at a time. Reveal a guide from an anchor, then its short script-derived label; reserve label footprint before letter animation. Use dotted/dashed contours and restrained neutral frosted strokes. Morph only adjacent compatible geometry.',
      'Keep overlays readable for at least 1.5–2 seconds. During a longer sentence, progress the evidence with a meaningful trace, crop or comparison; do not switch effects merely to fill time.',
      'Treat overlay timing as word-aligned events within existing cues, never a second narration clock. Retain neck/shoulders under the bottom fade; protect the feature and label from captions and platform UI.',
      'Use one original narrator performance across formats. Emphasize the operative contrast; keep connecting clauses conversational. Avoid an announcing voice, dramatic pauses after every sentence or copying a reference narrator.',
      'For contextual promotion, mention Mogging when its actual UI helps explain the point; allow one short invitation after value is delivered. Do not make a neutral claim cut to report UI solely because the brand appears.',
      'Keep supplied transcripts as reference evidence, not scripts to paraphrase sentence by sentence. Separate directly observed visuals, transcript language, scientific sources and proposed motion; do not claim retention or audio performance measurements without evidence.',
      'Keep illustrative transformations and report values labeled in metadata. Do not present them as measured facts about the pictured person.',
      'Record only after editorial approval. Audition complete modular sections and validate measured duration, stitched cadence and word alignment before release.',
    ],
    review: ['Can the opening claim be understood with the sound off?', 'Does each explanation have visible evidence at its operative word?', 'Does every short cut retain its question, proof and resolution?', 'Are unsupported edits and missing footage explicit?', 'Would another subject tell a different argument, rather than just swap a name?', 'Is the product mention useful to this explanation?'],
    beatWorksheet: script.cues.map(cue => ({ sourceId: cue.sourceId, exactText: cue.text, role: cue.section?.role, dependsOn: cue.section?.dependsOn ?? [], proposedVisuals: cue.section?.visuals ?? [], semantic: cue.section?.semantic, evidenceStatus: 'needs-asset-and-claim-review' })),
  }
}

const recordingBundleSchema = z.object({
  format: z.literal('mogging-recording-v1'), script: scriptSchema, voice: voiceDirectionSchema,
  clips: z.array(z.object({ cueId: z.string(), pcmBase64: z.string().max(2600000), words: z.array(spokenWordSchema).max(1000).optional() }).strict()).max(250),
}).strict()
export function packProductionRecording(script: VideoScript, voice: VoiceDirection, clips: ReadonlyMap<string, SectionAudio>) {
  return { format: 'mogging-recording-v1', script, voice, clips: script.cues.flatMap(cue => {
    const clip = clips.get(sectionAudioKey(cue, voice))
    if (!clip) return []
    let binary = ''
    for (let offset = 0; offset < clip.pcm.length; offset += 8192) binary += String.fromCharCode(...clip.pcm.subarray(offset, offset + 8192))
    return [{ cueId: cue.id, pcmBase64: btoa(binary), words: clip.words }]
  }) }
}
export function restoreProductionRecording(value: unknown) {
  const bundle = recordingBundleSchema.parse(value), script = validateProductionScript(bundle.script)
  const clips = new Map<string, SectionAudio>()
  let bytes = 0
  for (const clip of bundle.clips) {
    const cue = script.cues.find(cue => cue.id === clip.cueId)
    if (!cue) throw new Error('A recorded section does not belong to this script.')
    const key = sectionAudioKey(cue, bundle.voice), pcm = Uint8Array.from(atob(clip.pcmBase64), character => character.charCodeAt(0))
    bytes += pcm.length
    if (clips.has(key) || !pcm.length || pcm.length % 2 || pcm.length > 1920000 || bytes > 48000 * 90) throw new Error('The recording bundle contains invalid or oversized section audio.')
    clips.set(key, { key, cueId: cue.id, pcm, words: clip.words })
  }
  return { script, voice: bundle.voice, clips }
}
