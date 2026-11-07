import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getStroke } from 'perfect-freehand'
import { drawEditorialLeader, editorialHatchStrokes } from './editorial-motion'
import { applyGlassInk } from './glass-overlay'
import { originalVideoContext } from './video-theme'
import { sampleCaptionAppearance, annotationAppearance } from './caption-contrast'
import { z } from 'zod'
import { scriptTokens, scriptVisualSeed } from './video-script'
import { visualFeatures, decodeVisualBeat, type SemanticBeat } from './video-semantics'
import { jawOutline, jawSides, visibleFaceSides, facialDetailGuides } from './facial-detail-guides'
import { faceMetricGuides, metricFaceOverlay, narratedFaceMetric, faceContourPaths, faceContourEdge } from './face-metric-guides'
import { morphFaceOverlay } from './face-overlay-morph'
import { drawSkinNetwork } from './mobile-overlay-engine/skin-network'
import { revealContour, faceRegionContours, glassSurface, glassMarker } from './video-face-treatment'
import { profileGeometry, anglePaths, type ProfileStudy } from './video-profile'
import { smoothMotion } from './video-layout'
import type { VideoScene } from './video-composition'
import type { GeneratorImage } from './content-generator'
import type { ReportOverlay } from './report-overlay'
import type { PortraitWarp } from './video-portrait-effects'
import { warpDestinationPoint } from './video-portrait-effects'

export const portraitProgramSchema = z.object({
  wordCount: z.number().int().min(1).max(5000),
  view: z.enum(['three-quarter','profile']).optional(),
  actions: z.array(z.object({ word: z.number().int().min(0), feature: z.enum(visualFeatures), guide: z.string().max(100),
    labelWord: z.number().int().min(0).optional(), stroke: z.enum(['solid', 'dotted', 'dashed']).optional(), treatment: z.enum(['trace', 'bracket', 'callout', 'landmarks', 'inset', 'arrow', 'highlight', 'scribble', 'note', 'ribbon', 'caliper', 'mesh', 'ink-callout', 'ink-hatch']), label: z.string().max(45) }).strict()).min(1).max(96),
}).strict()
export type PortraitProgram = z.infer<typeof portraitProgramSchema>
const portraitTreatments: Record<string, PortraitProgram['actions'][number]['treatment'][]> = {
  'portrait-audit': ['trace', 'landmarks', 'highlight', 'trace'],
  'report-led': ['callout', 'inset', 'callout'],
  'measurement-explainer': ['mesh', 'caliper', 'landmarks', 'mesh', 'highlight', 'bracket'],
  'feature-study': ['ink-callout', 'scribble', 'mesh', 'arrow', 'landmarks', 'ribbon', 'highlight', 'trace'],
  'hybrid-story': ['arrow', 'note', 'arrow'],
  'documentary-studio': ['trace', 'callout', 'landmarks'],
}
type Point = { x: number; y: number }
type ReportDetail = { contours: Point[][]; guides: Point[][]; anchors: Point[]; markers: Point[] }
const networkNodes = new WeakMap<Point[], Point[]>()
type SubjectMask = {width:number;height:number;alpha:Uint8ClampedArray}
const subjectMasks = new WeakMap<HTMLCanvasElement|HTMLImageElement,SubjectMask>()
function portraitSubjectMask(image?: HTMLCanvasElement|HTMLImageElement): SubjectMask|undefined {
  if(!image || typeof document==='undefined')return
  const cached=subjectMasks.get(image);if(cached)return cached
  try {const canvas=document.createElement('canvas');canvas.width=64;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,64,96);const pixels=ctx.getImageData(0,0,64,96).data;const mask={width:64,height:96,alpha:Uint8ClampedArray.from({length:64*96},(_,i)=>pixels[i*4+3])};subjectMasks.set(image,mask);return mask}catch{return}
}
export type PreparedPortraitProgram = { holdShortShot?: boolean; view?: 'three-quarter'|'profile'; mask?:SubjectMask; wordCount: number; actions: Array<PortraitProgram['actions'][number] & { overlay: ReportOverlay; reportDetail?: ReportDetail }>; width: number; height: number }
export type PortraitActivity = { reportDetail?: ReportDetail; guide?: string; feature?: string; index?: number; view?: 'three-quarter'|'profile'; mask?:SubjectMask; from?: ReportOverlay; to: ReportOverlay; treatment: PortraitProgram['actions'][number]['treatment']; label: string; stroke?: 'solid' | 'dotted' | 'dashed'; focus?: ReportOverlay; previousFocus?: ReportOverlay; labelPhase: number; elapsedMs: number; phase: number; blend: number; first: boolean; reduced: boolean }
const categories: Record<SemanticBeat['feature'], string[]> = { whole: ['face-shape', 'proportions'], philtrum: [], freckles: [], 'facial-hair': ['mouth', 'jaw'], ears: [], symmetry: ['symmetry'], dimorphism: ['jaw', 'brows', 'face-shape'], eyes: ['eyes'], brows: ['brows'], nose: ['nose'], lips: ['mouth'], jaw: ['jaw'], cheeks: ['cheeks'] }
const customGuides: Partial<Record<SemanticBeat['feature'], string[]>> = {
  philtrum: ['philtrum:bracket', 'philtrum:axis', 'philtrum:lip'], freckles: ['skin:bridge', 'skin:left-cheek', 'skin:right-cheek'],
  ears: ['ears:left', 'ears:right'], brows: ['detail:brow-outline', 'detail:brow-gap', 'brows.arch', 'brows.tail'], lips: ['detail:lip-bracket', 'mouth.contour', 'mouth.cupid-bow'], nose: ['nose.bridge', 'detail:nose-axis', 'nose.nostril-visibility'],
}
const browShapes = ['detail:brow-outline','detail:brow-outline-left','detail:brow-outline-right','detail:brow-upper']
const browGaps = ['detail:brow-gap','detail:brow-gap-left','detail:brow-gap-right','detail:eye-brow-left','detail:eye-brow-right']
const eyeShapes = ['eyes.shape','detail:eye-left','detail:eye-right','detail:eye-brow-left','detail:eye-brow-right']
const jawShapes = ['jaw.jaw-shape','detail:jaw-left','detail:jaw-right','jaw.chin-shape','detail.jaw-offset','detail.gonial']
function relatedGuides(id: string): string[] {
  if (id === 'brows.arch') return browShapes
  if (id === 'brows.eye-distance') return browGaps
  if (id === 'eyes.shape' || id === 'eyes.upper-lid') return eyeShapes
  if (id === 'jaw.jaw-shape' || id === 'detail.jaw-offset') return jawShapes
  return [id]
}
function guidesForFeature(feature: SemanticBeat['feature'], view: string): string[] {
  if (view === 'profile') {
    if (feature === 'nose') return ['profile:nose']
    if (feature === 'lips' || feature === 'philtrum') return ['profile:lips']
    if (feature === 'cheeks') return ['profile:cheek', 'profile:jaw']
    return ['profile:jaw', 'profile:angle', 'profile:chin']
  }
  if (view === 'three-quarter') {
    const outlines: Partial<Record<SemanticBeat['feature'], string[]>> = {
      cheeks: ['cheeks.contour'], jaw: ['jaw.jaw-shape', 'jaw.chin-shape'], eyes: ['eyes.shape', 'eyes.upper-lid'],
      brows: ['brows.arch', 'brows.tail'], nose: ['nose.bridge', 'nose.nostril-visibility'], lips: ['mouth.contour', 'mouth.cupid-bow'], whole: ['face.shape', 'face.taper'],
    }
    if (outlines[feature]) return outlines[feature]!
  }
  return customGuides[feature] ?? faceMetricGuides.filter(guide => categories[feature].includes(guide.category)).map(guide => guide.id)
}
// Labels quote the narration; they never infer an anatomical judgement from pixels.
export function portraitAnnotation(text: string, feature: SemanticBeat['feature'], nearWord = 0): { label: string; labelWord: number } | undefined {
  const patterns = [
    /\b(?:slightly |a little )?(?:higher|lower|wider|narrower|shorter|longer)\b/gi,
    /\b(?:arched|straight|dense|thick(?:er)?|thin(?:ner)?|full(?:er)?|wide(?:r)?|narrow(?:er)?|high(?:er)?|low(?:er)?|soft(?:er)?|sharp(?:er)?|rounded|defined)\s+(?:eyebrows?|brows?|lips?|jaw(?:line)?|chin|nose|bridge|cheeks?|eyes?)\b/gi,
    /\b(?:sits? (?:high|low)|projects? (?:less|more)|brow ridge|upper lip|lower lip|brow arch|cheek contour|jaw outline|nose bridge|eye spacing|philtrum)\b/gi,
  ]
  const tokens = scriptTokens(text)
  const matches = patterns.flatMap(pattern => [...text.matchAll(pattern)].flatMap(match => {
    const labelWord = scriptTokens(text.slice(0, match.index)).length
    const nearby = tokens.slice(Math.max(0,labelWord-5),labelWord+7).map(word=>word.text).join(' ')
    const named = decodeVisualBeat(match[0], feature).feature
    return named === feature && decodeVisualBeat(nearby, feature).feature === feature ? [{label:match[0],labelWord}] : []
  }))
  return matches.toSorted((a,b)=>Math.abs(a.labelWord-nearWord)-Math.abs(b.labelWord-nearWord))[0]
}

export function planPortraitProgram(text: string, feature: SemanticBeat['feature'], format: string, variant: number, view: string): PortraitProgram {
  const words = scriptTokens(text), seed = scriptVisualSeed(text, format) + variant
  const named = narratedFaceMetric(text)
  const guides = guidesForFeature(feature, view)
  const intent = decodeVisualBeat(text, feature).intent
  const litGuides = feature === 'nose' ? ['plane:nose', 'nose.bridge'] : feature === 'jaw' ? ['plane:chin', 'jaw.jaw-shape'] : ['plane:left-cheek', 'plane:right-cheek', 'cheeks.contour']
  const explicit = named && categories[feature].includes(named.category) ? [named] : []
  const choices = view !== 'front' ? guides : intent === 'lighting' ? litGuides : explicit.length ? explicit.flatMap(metric => relatedGuides(metric.id)) : guides.length ? guides : ['face.shape']
  const styles: PortraitProgram['actions'][number]['treatment'][] = intent === 'lighting' ? ['trace','landmarks','callout'] : portraitTreatments[format] ?? portraitTreatments['portrait-audit']
  // Explicit feature words own focus changes; cadence fills the space between them.
  const locked = ['philtrum', 'freckles', 'facial-hair', 'ears'].includes(feature)
  const mentions = locked ? [] : words.flatMap((token, word) => {
    const target = decodeVisualBeat(token.text).feature
    const context = words.slice(Math.max(0, word - 2), word + 3).map(word => word.text).join(' ')
    return target !== 'whole' && !/\b(?:fixed|unchanged|keep(?:ing)?|without|reference|not|above|below|beneath)\b/i.test(context) ? [{ word, feature: target }] : []
  })
  const firstFeature: SemanticBeat['feature'] = mentions.length ? mentions[0].feature : feature
  let focus = firstFeature
  const focusChanges = mentions.filter(mention => { if (mention.feature === focus) return false; focus = mention.feature; return true })
  const starts = [...new Set([...Array.from({ length: Math.max(1, Math.ceil(words.length / 6)) }, (_, i) => i * 6), ...focusChanges.map(mention => mention.word)])].sort((a, b) => a - b)
  const actions = starts.map((word, index) => {
    const local = words.slice(word, word + 6).map(word => word.text).join(' ')
    const localFeature = focusChanges.findLast(mention => mention.word <= word)?.feature ?? firstFeature
    const localGuides = guidesForFeature(localFeature, view)
    let actionChoices = localFeature !== feature && localGuides.length && intent !== 'lighting' ? localGuides : choices
    if (view === 'front' && intent !== 'lighting' && (!named || relatedGuides(named.id).length>1)) {
      const vocabulary: Partial<Record<SemanticBeat['feature'], string[]>> = format === 'measurement-explainer'
        ? { brows:['brows.eye-distance','brows.length','brows.thickness'], eyes:['eyes.spacing','eyes.canthal-tilt','eyes.aspect'], jaw:['jaw.width','detail.gonial','jaw.height'] }
        : format === 'feature-study'
          ? { brows:browShapes, eyes:['detail:eye-left','detail:eye-right','eyes.upper-lid','detail.under-eyes','eyes.lower-sclera'], jaw:['detail:jaw-left','detail:jaw-right','detail.jaw-offset'] }
          : format === 'hybrid-story'
            ? { brows:['detail:brow-upper','detail:eye-brow-left','detail:eye-brow-right'], eyes:['eyes.shape','detail.eye-creases','detail.under-eyes'], jaw:['detail.jaw-offset','detail.gonial','jaw.jaw-shape'] } : {}
      actionChoices = vocabulary[localFeature] ?? actionChoices
    }
    const mentioned = narratedFaceMetric(local)
    let guide = mentioned && relatedGuides(mentioned.id).length === 1 && actionChoices.includes(mentioned.id) ? mentioned.id : actionChoices[(seed + index) % actionChoices.length]
    const annotation = portraitAnnotation(text, localFeature, word)
    if (view === 'front' && intent !== 'lighting') {
      if (localFeature === 'brows' && /arch|dense|thick|straight/i.test(annotation?.label ?? local)) guide = browShapes[(seed+index)%browShapes.length]
      else if (localFeature === 'brows' && /higher|lower|sits|distance|gap/i.test(annotation?.label ?? local)) guide = browGaps[(seed+index)%browGaps.length]
      else if (localFeature === 'eyes' && !named && format === 'portrait-audit') guide = eyeShapes[(seed+index)%eyeShapes.length]
      else if (localFeature === 'jaw' && !named && format === 'portrait-audit') guide = jawShapes[(seed+index)%jawShapes.length]
      else if (localFeature === 'lips' && /thin|full|height/i.test(annotation?.label ?? local)) guide = 'detail:lip-bracket'
    }
    const metric = faceMetricGuides.find(metric => metric.id === guide)
    const regionLabel = guide.startsWith('plane:') ? guide.slice(6).replace('-', ' ') : undefined
    const treatment = ['detail:brow-outline','eyes.shape','mouth.contour','nose.nostril-visibility'].includes(guide) && (Math.floor(seed/4) + index) % 3 === 0 ? 'inset' as const : styles[(seed + index) % styles.length]
    return { word, feature: localFeature, guide, labelWord: annotation?.labelWord, stroke: facialDetailGuides.find(detail => detail.id === guide)?.stroke ?? (['solid', 'dotted', 'dashed'] as const)[(seed + index) % 3], treatment, label: annotation?.label ?? regionLabel ?? metric?.label ?? (localFeature === 'whole' ? 'Face outline' : localFeature.replace('-', ' ')) }
  })
  return { wordCount: Math.max(1, words.length), actions }
}
// Editorial guides follow named features without adding inferred measurements.
const editorialGuides: Record<string, { label: string; stroke?: 'solid' | 'dotted' | 'dashed' }> = {
  'detail:jaw-outline': { label: 'Jawline' }, 'detail:jaw-frame': { label: 'Jawline frame' },
  'detail:jaw-offset': { label: 'Bilateral jaw trace', stroke: 'dotted' }, 'detail:gonial': { label: 'Gonial angle' },
  'detail:cheek-area': { label: 'Upper cheek area' }, 'detail:cheeks': { label: 'Cheekbone arcs' }, 'detail:cheek-frame': { label: 'Cheekbone frame' },
  'detail:under-cheekbones': { label: 'Under cheekbone', stroke: 'dashed' }, 'detail:cheek-levels': { label: 'Cheekbone / lower contour', stroke: 'dotted' },
  'detail:eyes': { label: 'Eye contours' }, 'detail:eye-left': { label: 'Eye contour' }, 'detail:eye-right': { label: 'Eye contour' },
  'detail:eye-brow-left': { label: 'Eye and brow' }, 'detail:eye-brow-right': { label: 'Eye and brow' },
  'detail:brow-upper': { label: 'Brow line' }, 'detail:brow-outline': { label: 'Brow contours' },
  'detail:brow-outline-left': { label: 'Brow contour' }, 'detail:brow-outline-right': { label: 'Brow contour' },
  'detail:nose-axis': { label: 'Nose bridge' }, 'detail:nose-base': { label: 'Nostril base' },
  'philtrum:lip': { label: 'Lip contour' }, 'detail:lip-bracket': { label: 'Lip frame' },
}
const editorialFeatures: Array<{ pattern: RegExp; feature: SemanticBeat['feature']; guides: string[] }> = [
  { pattern: /^(?:jaw|jawline|gonial)$/, feature: 'jaw', guides: ['detail:jaw-outline','detail:jaw-frame','detail:gonial','detail:jaw-offset'] },
  { pattern: /^chin$/, feature: 'jaw', guides: ['jaw.chin-shape','jaw.height'] },
  { pattern: /^(?:cheek|cheeks|cheekbone|cheekbones)$/, feature: 'cheeks', guides: ['detail:cheeks','detail:cheek-frame','detail:under-cheekbones','detail:cheek-levels','detail:cheek-area'] },
  { pattern: /^(?:eye|eyes|gaze|glance)$/, feature: 'eyes', guides: ['detail:eyes','detail:eye-left','detail:eye-right','detail:eye-brow-left','detail:eye-brow-right'] },
  { pattern: /^(?:brow|brows|eyebrow|eyebrows)$/, feature: 'brows', guides: ['detail:brow-upper','detail:brow-outline','detail:brow-outline-left','detail:brow-outline-right'] },
  { pattern: /^(?:nose|bridge|tip)$/, feature: 'nose', guides: ['detail:nose-axis'] },
  { pattern: /^(?:nostril|nostrils)$/, feature: 'nose', guides: ['detail:nose-base'] },
  { pattern: /^(?:lip|lips|mouth)$/, feature: 'lips', guides: ['philtrum:lip','detail:lip-bracket'] },
]
export function narratedPortraitProgram(text: string, format: string, variant = 0, fallbackFeature = 'whole'): PortraitProgram {
  const words = scriptTokens(text), seed = scriptVisualSeed(text,format) + variant
  const treatments = portraitTreatments[format] ?? portraitTreatments['portrait-audit']
  const mentions = words.flatMap((token,word) => {
    const named = editorialFeatures.find(item=>item.pattern.test(token.text.toLowerCase().replace(/[^a-z]/g,'')))
    return named ? [{word,...named}] : []
  })
  const fallback = editorialFeatures.find(item=>item.feature === (fallbackFeature === 'mouth' ? 'lips' : fallbackFeature))
  const starts = [...new Set([0,...mentions.map(item=>item.word),...Array.from({length:Math.ceil(words.length/8)},(_,i)=>i*8)])].sort((a,b)=>a-b)
  const actions: PortraitProgram['actions'] = starts.map((word,index)=>{
    const named = mentions.findLast(item=>item.word<=word) ?? mentions[0] ?? fallback
    const feature = named?.feature ?? 'whole'
    const local = words.slice(word,word+8).map(token=>token.text).join(' ')
    const guides = feature==='jaw' && /\b(?:gonial|jaw angle)\b/i.test(local) ? ['detail:gonial'] : named?.guides ?? ['face:outline']
    const guide = guides[(seed+index)%guides.length], detail = editorialGuides[guide]
    const treatment = treatments[(seed + index) % treatments.length]
    const hatch = format === 'feature-study' && treatment === 'ribbon' && ['cheeks', 'lips', 'jaw'].includes(feature)
    if (hatch && feature === 'lips') return { word, labelWord: word, feature, guide: 'detail.mouth-creases', label: 'Mouth corners', stroke: 'dotted', treatment: 'ink-hatch' }
    return { word, labelWord: word, feature, guide, label: detail?.label ?? 'Face outline', stroke: detail?.stroke ?? 'solid', treatment: hatch ? 'ink-hatch' : treatment }
  })
  return {wordCount:Math.max(1,words.length),actions}
}

export type PortraitProgramRun = {program:PortraitProgram;startMs:number;durationMs:number;words:Array<{startMs:number}>}
// A photograph owns one annotation clock, even when captions split it into scenes.
export function portraitProgramRuns(scenes: readonly VideoScene[]): Map<string,PortraitProgramRun> {
  const runs = new Map<string,PortraitProgramRun>()
  let run:PortraitProgramRun|undefined, previous:VideoScene|undefined
  for(const scene of scenes) {
    const program=scene.portraitProgram
    const same = run && previous && scene.source.kind===previous.source.kind && scene.source.imageId===previous.source.imageId
      && (scene.source.kind!=='report'||scene.source.categoryId===previous.source.categoryId&&scene.cueId===previous.cueId)
      && JSON.stringify(scene.portraitCrop)===JSON.stringify(previous.portraitCrop) && program?.view===previous.portraitProgram?.view
    if(!program || !['portrait','report'].includes(scene.source.kind)){run=undefined;previous=scene;continue}
    if(!same) run={program:{...program,wordCount:0,actions:[]},startMs:scene.startMs,durationMs:0,words:[]}
    const current=run!, offset=current.program.wordCount, count=Math.max(program.wordCount,scene.words?.length??0)
    current.program.actions.push(...program.actions.map(action=>({...action,word:action.word+offset,labelWord:action.labelWord===undefined?undefined:action.labelWord+offset})))
    current.words.push(...Array.from({length:count},(_,i)=>({startMs:scene.startMs-current.startMs+(scene.words?.[i]?.startMs??i/count*scene.durationMs)})))
    current.program.wordCount+=count
    current.durationMs=scene.startMs+scene.durationMs-current.startMs
    runs.set(scene.id,current);previous=scene
  }
  return runs
}

function customPaths(source: GeneratorImage, guide: string): Point[][] {
  const face = source.landmarks, a = face?.anchors
  if (!face || !a || face.confidence < .58) return []
  const detail = facialDetailGuides.find(detail => detail.id === guide.replace('detail:', 'detail.'))
  if (detail && guide.startsWith('detail:')) return detail.paths(face)
  if (guide === 'face:outline') return faceContourPaths(face, 'faceOutline')
  if (guide === 'detail:jaw-outline') return jawOutline(face)
  if (guide === 'detail:cheeks') return facialDetailGuides.find(guide => guide.id === 'detail.cheekbones')!.paths(face)
  if (guide === 'detail:nose-base') return faceContourPaths(face, 'noseBase')
  if (guide.startsWith('plane:')) return faceRegionContours(face, 'overall').filter(region => region.id === guide.slice(6)).map(region => [...region.points, region.points[0]])
  const line = (...points: Array<Point | undefined>) => points.every(Boolean) ? [points as Point[]] : []
  const contour = (...keys: Array<keyof NonNullable<FaceLandmarksPayload['contours']>>) =>
    keys.flatMap(key => faceContourPaths(face, key))
  if (guide === 'study:pupil-axis') return [...contour('leftEye', 'rightEye'), ...line(a.leftPupil, a.rightPupil)]
  if (guide === 'study:brow-spacing') return [...contour('leftBrow', 'rightBrow'), ...line(a.leftBrow, a.leftPupil), ...line(a.leftPupil, a.rightPupil)]
  if (guide === 'study:nose-axis') return [...contour('noseBridge', 'noseBase'), ...line(a.noseBridge, a.noseTip)]
  if (guide === 'study:mouth-width') return [...contour('mouth'), ...line(a.mouthLeft, a.mouthRight)]
  if (guide === 'study:philtrum') return [...contour('noseBase'), ...line(a.noseTip, a.upperLip)]
  if (guide === 'study:paired-eyes') return [...line(a.leftEyeInner, a.leftEyeOuter), ...line(a.rightEyeInner, a.rightEyeOuter)]
  if (guide === 'study:face-proportions') return [...line(a.forehead, a.chin), ...line(a.noseTip, a.chin)]
  if (guide === 'study:jaw-bend') return line(a.leftCheek, a.jawLeft, a.chin)
  if (guide === 'study:jaw-span') return [...jawOutline(face), ...line(a.jawLeft, a.jawRight), ...line(a.leftCheek, a.rightCheek)]
  const nose = face.contours?.noseBase?.[3] ?? a.noseTip
  const upper = a.upperLip ?? a.mouthCenter
  const span = a.leftPupil && a.rightPupil ? Math.abs(a.rightPupil.x - a.leftPupil.x) : .2
  const sides = (guide.endsWith('-left') ? ['left'] as const : guide.endsWith('-right') ? ['right'] as const : ['left','right'] as const).filter(side=>visibleFaceSides(face).includes(side))
  // A five-point brow is an open upper edge, not a complete eyebrow polygon.
  if (guide.startsWith('detail:brow-outline')) return sides.flatMap(side=>faceContourPaths(face,side==='left'?'leftBrow':'rightBrow'))
  if (guide === 'detail:brow-upper') return sides.flatMap(side=>faceContourEdge(face,side==='left'?'leftBrow':'rightBrow',true))
  if (guide.startsWith('detail:eye-brow')) return sides.flatMap(side=>[...faceContourPaths(face, side === 'left' ? 'leftEye' : 'rightEye'),...faceContourPaths(face, side === 'left' ? 'leftBrow' : 'rightBrow')])
  if (guide === 'detail:eyes' || guide === 'detail:eye-left' || guide === 'detail:eye-right') return sides.flatMap(side=>faceContourPaths(face, side === 'left' ? 'leftEye' : 'rightEye'))
  if (guide === 'detail:jaw-left' || guide === 'detail:jaw-right') {
    const side = guide === 'detail:jaw-left' ? 'left' : 'right'
    const path = visibleFaceSides(face).includes(side) ? jawSides(face)[side === 'left' ? 0 : 1] : undefined
    return path ? [path] : []
  }
  if (guide.startsWith('detail:brow-gap')) return sides.flatMap(side => {
    const brow = a[`${side}Brow`], pupil = a[`${side}Pupil`]
    if (!brow || !pupil) return []
    const edge = face.contours?.[side === 'left' ? 'leftEye' : 'rightEye']?.toSorted((p,q)=>Math.abs(p.x-brow.x)-Math.abs(q.x-brow.x)).slice(0,3).toSorted((p,q)=>p.y-q.y)[0] ?? pupil
    const x = brow.x + span * (side === 'left' ? -.12 : .12), tick = span * .045
    return [[{x:x-tick,y:brow.y},{x,y:brow.y},{x,y:edge.y},{x:x-tick,y:edge.y}]]
  })
  if (guide === 'detail:lip-bracket') {
    if (!a.upperLip || !a.lowerLip || !a.mouthRight) return []
    const x = a.mouthRight.x + span * .1, tick = span * .05
    return [[{x:x-tick,y:a.upperLip.y},{x,y:a.upperLip.y},{x,y:a.lowerLip.y},{x:x-tick,y:a.lowerLip.y}]]
  }
  if (guide === 'detail:nose-axis') return line(a.noseBridge,a.noseTip)
  if (guide === 'philtrum:bracket' && nose && upper) { const x = (nose.x + upper.x) / 2 + span * .18, tick = span * .06; return [[{ x: x - tick, y: nose.y }, { x, y: nose.y }, { x, y: upper.y }, { x: x - tick, y: upper.y }]] }
  if (guide === 'philtrum:axis') return line(nose, upper, a.mouthCenter)
  if (guide === 'philtrum:lip') return faceContourEdge(face, 'mouth', true)
  if (guide.startsWith('ears:')) return []
  if (!guide.startsWith('skin:')) return []
  const center = guide === 'skin:bridge' ? nose : guide === 'skin:left-cheek' || guide === 'ears:left' ? a.leftCheek : a.rightCheek
  if (!center) return []
  // Editorial callouts indicate a region, never invented freckles or measured values.
  return [Array.from({ length: 49 }, (_, i) => { const angle = i / 48 * Math.PI * 2; return { x: center.x + Math.cos(angle) * span * .3, y: center.y + Math.sin(angle) * span * .3 * source.width / source.height } })]
}
function eyeReportDetail(source: GeneratorImage, feature: string, guide: string): ReportDetail | undefined {
  const face = source.landmarks
  if (!face || face.confidence < .58 || (feature !== 'eyes' && feature !== 'brows')) return
  const detail: ReportDetail = { contours: [], guides: [], anchors: [], markers: [] }
  const pixel = (p: Point) => ({ x: p.x * source.width, y: p.y * source.height })
  const outerCorners: Point[] = []
  for (const side of visibleFaceSides(face)) {
    if (guide.endsWith('-left') && side !== 'left' || guide.endsWith('-right') && side !== 'right') continue
    const eye = faceContourPaths(face, `${side}Eye`)
    const brow = faceContourPaths(face, `${side}Brow`)
    const pupil = face.anchors[`${side}Pupil`]
    const outer = face.anchors[`${side}EyeOuter`]
    const inner = face.anchors[`${side}EyeInner`]
    const browAnchor = face.anchors[`${side}Brow`]
    if (feature === 'eyes' && eye.length) {
      detail.contours.push(...eye)
      for (const point of [outer, inner, pupil]) if (point) detail.anchors.push(point)
      if (outer) { outerCorners.push(outer); detail.markers.push(outer) }
    }
    if (feature === 'brows' && brow.length) {
      detail.contours.push(...brow, ...eye)
      if (browAnchor && pupil && eye.length) {
        detail.guides.push([browAnchor, pupil])
        detail.anchors.push(pupil)
        detail.markers.push(browAnchor)
      }
    }
  }
  if (outerCorners.length === 2) detail.guides.push(outerCorners)
  if (!detail.contours.length) return
  return { contours: detail.contours.map(path => path.map(pixel)), guides: detail.guides.map(path => path.map(pixel)), anchors: detail.anchors.map(pixel), markers: detail.markers.map(pixel) }
}

export function preparePortraitProgram(program: PortraitProgram, source: GeneratorImage, profile?: ProfileStudy, image?: HTMLCanvasElement|HTMLImageElement): PreparedPortraitProgram {
  const base: ReportOverlay = { size: { width: source.width, height: source.height }, primitives: [], dots: [], faceBoundary: source.landmarks?.contours?.faceOutline?.map(p=>({x:p.x*source.width,y:p.y*source.height})) }
  const actions = program.actions.map(action => {
    let overlay: ReportOverlay
    if (action.guide.startsWith('profile:') && profile) {
      try {
        const geometry = profileGeometry(source, { ...profile, feature: action.guide.slice(8) as ProfileStudy['feature'] })
        const paths = geometry.angle ? anglePaths(geometry.angle) : [geometry.contour]
        overlay = { ...base, primitives: paths.map((path, index) => ({ kind: 'polyline', id: `profile-${index}`, points: [], pixelPoints: path, closed: false })) }
      } catch { overlay = { ...base } }
    } else if (action.guide.includes(':')) overlay = { ...base, primitives: customPaths(source, action.guide).filter(path => path.length >= 2).map((path, index) => ({ kind: 'polyline', id: `custom-${index}`, points: [], pixelPoints: path.map(p => ({ x: p.x * source.width, y: p.y * source.height })), closed: false })) }
    else overlay = metricFaceOverlay(base, source, action.guide)
    let resolved = action
    const detail = facialDetailGuides.find(guide => guide.id === action.guide)
    if (!overlay.primitives.length && detail && program.actions.length > 1) {
      // Sparse older landmarks can still support a simpler guide in the same region.
      // A single explicitly selected overlay stays unavailable rather than being substituted.
      const fallback = faceMetricGuides.filter(guide => guide.category === detail.category && !guide.id.startsWith('detail.'))
        .map(guide => ({ guide, overlay: metricFaceOverlay(base, source, guide.id) })).find(item => item.overlay.primitives.length)
      if (fallback) { overlay = fallback.overlay; resolved = { ...action, guide: fallback.guide.id, label: fallback.guide.label } }
    }
    if (resolved.guide === 'face.taper') resolved = { ...resolved, label: 'Chin to nose tip', treatment: 'trace', stroke: 'dotted' }
    return { ...resolved, overlay, reportDetail: eyeReportDetail(source, resolved.feature, resolved.guide) }
  }).filter(action => action.overlay.primitives.length)
  return { view:program.view, mask:portraitSubjectMask(image), wordCount: program.wordCount, width: source.width, height: source.height, actions }
}
export const portraitOverlayMinimumMs = 2000
const overlayRevealMs = 250
export const portraitOverlayWindowMs = portraitOverlayMinimumMs + overlayRevealMs
export function portraitProgramSchedule(program: PreparedPortraitProgram, durationMs: number, words?: Array<{startMs:number}>) {
  const scheduled: Array<{action:PreparedPortraitProgram['actions'][number];start:number}> = []
  const interval=portraitOverlayWindowMs, count=Math.max(1,words?.length??program.wordCount)
  if (durationMs < interval) {
    const action = program.actions[0]
    return program.holdShortShot && action ? [{ action, start: 0 }] : scheduled
  }
  const cues=program.actions.map((action,index)=>({action,start:index===0?0:words?.[action.word]?.startMs??action.word/count*durationMs}))
  for(const [index,cue] of cues.entries()) {
    const previous=scheduled.at(-1)
    // A decorative repeat must not delay the next named anatomical feature.
    const change=previous && cue.action.feature===previous.action.feature ? cues.find((next,i)=>i>index&&next.action.feature!==cue.action.feature) : undefined
    if(change && change.start-cue.start<interval && durationMs-change.start>=interval)continue
    if(!previous || cue.start-previous.start>=interval && durationMs-cue.start>=interval)scheduled.push(cue)
  }
  return scheduled
}

export function samplePortraitProgram(program: PreparedPortraitProgram, timeMs: number, durationMs: number, words?: Array<{ startMs: number }>, reduced = false, previous?: PreparedPortraitProgram): PortraitActivity | undefined {
  const count = Math.max(1, words?.length ?? program.wordCount)
  const scheduled = portraitProgramSchedule(program,durationMs,words)
  const actions = scheduled.map(item => item.action), starts = scheduled.map(item => item.start)
  if (!actions.length) return
  const index = Math.max(0, starts.findLastIndex(start => start <= timeMs)), action = actions[index]
  const start = starts[index], end = starts[index + 1] ?? durationMs
  const phase = reduced ? 1 : Math.max(0, Math.min(1, (timeMs - start) / Math.max(1, end - start)))
  const prior = actions[index - 1] ?? previous?.actions.at(-1)
  const from = prior && adjacentPortraitGuides(prior, action, program.width, program.height) ? prior.overlay : undefined
  const labelStart = action.labelWord === undefined || durationMs < portraitOverlayWindowMs ? start : words?.[action.labelWord]?.startMs ?? action.labelWord / count * durationMs
  const labelPhase = reduced ? 1 : Math.max(0, Math.min(1, (timeMs - Math.max(start, labelStart)) / overlayRevealMs))
  return { reportDetail: action.reportDetail, guide:action.guide, feature:action.feature, index, view:program.view, mask:program.mask, focus: action.overlay, previousFocus: previous?.actions[0]?.overlay, labelPhase, elapsedMs: Math.max(0,timeMs-start), from, to: action.overlay, label: action.label, treatment: action.treatment, stroke: action.stroke, phase,
    blend: reduced ? 1 : smoothMotion((timeMs - start) / overlayRevealMs), first: !from, reduced }
}
// Morph only a nearby contour within the same anatomical family and visual
// treatment. A different instrument or feature gets its own point-to-line reveal.
function adjacentPortraitGuides(from: PreparedPortraitProgram['actions'][number], to: PreparedPortraitProgram['actions'][number], width: number, height: number): boolean {
  if (from.feature !== to.feature || from.treatment !== to.treatment || from.guide === to.guide || from.guide.split(/[.:]/)[0] !== to.guide.split(/[.:]/)[0]) return false
  const lines = (overlay: ReportOverlay) => overlay.primitives.flatMap(p => p.kind === 'polyline' ? [p.pixelPoints] : [])
  const a = lines(from.overlay), b = lines(to.overlay)
  if (!a.length || a.length !== b.length || a.some(p => p.length < 3) || b.some(p => p.length < 3)) return false
  const center = (paths: Point[][]) => { const points = paths.flat(); return { x: points.reduce((sum,p) => sum+p.x,0)/points.length, y: points.reduce((sum,p) => sum+p.y,0)/points.length } }
  const x = center(a), y = center(b)
  return Math.hypot((x.x-y.x)/width, (x.y-y.y)/height) < .09
}
// Independent technical diagrams, drawn in screen coordinates rather than copied from landmarks.
const studyDiagrams: Record<string, { note: string; paths: number[][][] }> = {
  'face:outline': { note: 'Centerline reference', paths: [[[10,30],[174,30]],[[92,4],[92,62]],[[74,50],[112,50]],[[74,45],[74,55]],[[112,45],[112,55]]] },
  'study:pupil-axis': { note: 'Tilt relative to horizontal', paths: [[[10,48],[175,48]],[[10,48],[175,12]],[[58,48],[57,39],[54,32]]] },
  'study:brow-spacing': { note: 'Brow span / pupil span', paths: [[[18,8],[18,54]],[[10,8],[26,8]],[[10,54],[26,54]],[[53,54],[175,54]],[[53,47],[53,61]],[[175,47],[175,61]]] },
  'study:nose-axis': { note: 'Image-plane distance', paths: [[[20,14],[162,52]],[[18,23],[22,5]],[[160,61],[164,43]],[[83,18],[79,36]]] },
  'study:mouth-width': { note: 'Corner-to-corner span', paths: [[[14,33],[174,33]],[[14,20],[14,46]],[[174,20],[174,46]],[[26,26],[14,33],[26,40]],[[162,26],[174,33],[162,40]]] },
  'study:philtrum': { note: 'Image-plane distance', paths: [[[70,10],[126,10]],[[70,56],[126,56]],[[98,10],[98,56]],[[92,18],[98,10],[104,18]],[[92,48],[98,56],[104,48]]] },
  'study:jaw-bend': { note: 'Frontal contour angle', paths: [[[18,8],[65,53],[166,32]],[[48,36],[55,29],[65,26],[75,28],[82,33],[86,48]]] },
  'study:paired-eyes': { note: 'Inner to outer canthus', paths: [[[8,25],[72,25]],[[8,16],[8,34]],[[72,16],[72,34]],[[105,25],[173,25]],[[105,16],[105,34]],[[173,16],[173,34]],[[90,8],[90,52]]] },
  'study:face-proportions': { note: 'Lower span / total span', paths: [[[55,4],[55,62]],[[45,4],[65,4]],[[45,62],[65,62]],[[114,32],[114,62]],[[104,32],[124,32]],[[104,62],[124,62]],[[55,32],[114,32]]] },
  'study:skin-light': { note: 'Light direction changes shadows', paths: [[[8,6],[48,37],[35,34]],[[26,4],[68,37],[55,34]],[[45,4],[88,37],[75,34]],[[8,57],[38,57],[51,48],[65,58],[80,58],[96,48],[111,57],[176,57]]] },
  'study:skin-color': { note: 'Compare regional tone', paths: [[[14,10],[67,10],[67,54],[14,54],[14,10]],[[114,10],[167,10],[167,54],[114,54],[114,10]],[[78,26],[103,26]],[[78,38],[103,38]]] },
}

export function drawPortraitActivity(ctx: CanvasRenderingContext2D, activity: PortraitActivity, width: number, height: number, warp?: PortraitWarp, reportInk = false, measurement?: { value: number; unit: string }, ink?: string) {
  ctx = originalVideoContext(ctx)
  const geometry = activity.from ? morphFaceOverlay(activity.from,activity.to,activity.blend) : activity.to
  const move=(p:Point)=>{if(!warp)return p;const q=warpDestinationPoint({x:p.x/width,y:p.y/height},warp);return{x:q.x*width,y:q.y*height}}
  const paths=geometry.primitives.flatMap(p=>p.kind==='polyline'?[warp ? p.pixelPoints.map(move) : p.pixelPoints]:[])
  if(!paths.length)return
  const transform=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(transform.a,transform.b))
  const mapped=Number.isFinite(transform.e)&&Number.isFinite(transform.d)&&transform.a>0&&transform.d>0
  const safe=mapped?{left:Math.max(0,(120-transform.e)/transform.a),right:Math.min(width,(1016-transform.e)/transform.a),top:Math.max(0,(540-transform.f)/transform.d),bottom:Math.min(height,(1960-transform.f)/transform.d)}:{left:0,right:width,top:0,bottom:height}
  if(safe.right<=safe.left || safe.bottom<=safe.top)return
  const reveal=activity.reduced?1:smoothMotion(activity.elapsedMs/overlayRevealMs)
  const points=paths.flat(),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y))
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0
  const line=(points:Point[],weight=activity.view?2.4:2.1)=>{
    if (points.length < 2) return
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y))
    if (ink) {
      ctx.strokeStyle = ink
      ctx.lineWidth = weight * unit
    } else applyGlassInk(ctx,unit,weight,'rgba(248,251,255,.73)')
    ctx.stroke()
  }
  ctx.setLineDash(activity.stroke==='dotted'?[1*unit,7*unit]:activity.stroke==='dashed'?[12*unit,8*unit]:[])
  const pathReveal = (index: number) => {
    const delay = Math.min(index * 14, 42)
    return activity.reduced ? 1 : smoothMotion((activity.elapsedMs - delay) / (overlayRevealMs - delay))
  }
  for (const [index, path] of paths.entries()) {
    const visible = revealContour(path, pathReveal(index))
    if (reportInk) {
      if (activity.guide?.startsWith('study:') && (paths.at(-1) === path || activity.guide === 'study:paired-eyes' || activity.guide === 'study:face-proportions')) {
        const spanProgress = activity.reduced ? 1 : smoothMotion((activity.elapsedMs - 420) / 840)
        if (spanProgress > 0) line(revealContour(path, spanProgress), 1.9)
      }
    } else if (activity.treatment === 'ribbon' || activity.treatment === 'highlight') {
      ctx.save()
      const ribbon = activity.treatment === 'ribbon'
      ctx.setLineDash(ribbon ? [8 * unit, 5 * unit] : [])
      ctx.globalAlpha *= .25
      line(visible, 5)
      ctx.restore()
      line(visible, ribbon ? 1.7 : 2.1)
    } else if (activity.treatment === 'caliper') {
      const start = path[0], end = path.at(-1)
      if (!start || !end) continue
      const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy)
      if (length < 12 * unit) { line(visible); continue }
      const nx = -dy / length * 12 * unit, ny = dx / length * 12 * unit
      ctx.setLineDash([])
      line(visible, 2.4)
      const tickReveal = smoothMotion((pathReveal(index) - .65) / .35)
      if (tickReveal > 0) for (const p of [start, end]) {
        line(revealContour([{ x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }], tickReveal), 2.4)
      }
    } else if (!['bracket', 'landmarks', 'scribble', 'inset', 'mesh', 'ink-callout', 'ink-hatch'].includes(activity.treatment)) line(visible)
  }
  ctx.setLineDash([])
  ctx.save();ctx.globalAlpha*=reveal
  if(activity.treatment==='bracket') {
    for (const [index, path] of paths.entries()) {
      const xs = path.map(point => point.x), ys = path.map(point => point.y)
      const settle = activity.reduced ? 1 : smoothMotion(activity.elapsedMs / 430)
      const pad = (7 + 11 * (1 - settle)) * unit
      const l = Math.min(...xs) - pad, r = Math.max(...xs) + pad
      const t = Math.min(...ys) - pad, b = Math.max(...ys) + pad
      const length = Math.min(16 * unit, (r - l) / 3, (b - t) / 3)
      for (const [x,y,sx,sy] of [[l,t,1,1],[r,t,-1,1],[l,b,1,-1],[r,b,-1,-1]]) {
        line(revealContour([{x:x+sx*length,y},{x,y},{x,y:y+sy*length}], pathReveal(index)), 2.2)
      }
    }
  } else if(activity.treatment === 'scribble' || activity.treatment === 'ink-callout' || activity.treatment === 'ink-hatch') {
    // Trace each registered contour separately so paired features never get a
    // single ellipse across the nose or an oversized box around the face.
    for (const [index, path] of paths.entries()) {
      const closed = path.length > 3 && Math.hypot(path[0].x - path.at(-1)!.x, path[0].y - path.at(-1)!.y) < unit
      const sketch = path.map((point, i) => {
        if (i === 0 || i === path.length - 1) return point
        const previous = path[i - 1], next = path[i + 1]
        const dx = next.x - previous.x, dy = next.y - previous.y
        const offset = Math.sin(i * 2.4) * 1.3 * unit / Math.max(unit, Math.hypot(dx, dy))
        return { x: point.x - dy * offset, y: point.y + dx * offset }
      })
      const visible = revealContour(sketch, pathReveal(index))
      if (activity.treatment === 'ink-callout' && visible.length > 1) {
        ctx.save()
        ctx.globalAlpha *= .22
        line(visible, 5)
        ctx.restore()
      }
      if (activity.treatment === 'ink-hatch' && (activity.feature === 'jaw' || activity.feature === 'lips')) {
        ctx.setLineDash([unit, 4 * unit])
        line(visible, 2.1)
        ctx.setLineDash([])
        continue
      }
      if (activity.treatment === 'scribble') {
        const stroke = getStroke(visible.map((p, i) => [p.x, p.y, .45 + .3 * Math.sin(i * .4) ** 2]), {
          size: 5 * unit, thinning: .75, smoothing: .45, streamline: .25, simulatePressure: false,
          last: pathReveal(index) >= 1, start: { taper: 16 * unit }, end: { taper: 30 * unit },
        })
        ctx.beginPath()
        stroke.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
        ctx.closePath()
        applyGlassInk(ctx, unit)
        ctx.fill()
      } else line(visible, closed ? 3.2 : 2.5)
      if (activity.treatment === 'ink-hatch') {
        ctx.save()
        ctx.globalAlpha *= .54
        for (const stroke of editorialHatchStrokes(visible, unit)) line(stroke, 1.5)
        ctx.restore()
      }
    }
  } else if (activity.treatment === 'mesh' || activity.treatment === 'landmarks') {
    const mesh = activity.treatment === 'mesh'
    let marker = 0
    for (const [index, path] of paths.entries()) {
      const progress = pathReveal(index)
      if (progress <= 0) continue
      line(revealContour(path, progress), 1.7)
      if (mesh) {
        let nodes = networkNodes.get(path)
        if (!nodes) {
          nodes = Array.from({ length: 12 }, (_, i) => revealContour(path, i / 11).at(-1)!)
          networkNodes.set(path, nodes)
        }
        ctx.save()
        ctx.strokeStyle = ctx.fillStyle = '#f8fbff'
        drawSkinNetwork(ctx, nodes, activity.elapsedMs, activity.reduced)
        ctx.restore()
      }
      for (const fraction of activity.reportDetail ? [] : mesh ? [.55] : [.25, .75]) {
        const anchor = revealContour(path, fraction).at(-1)!
        if (marker >= 4 || anchor.x < safe.left || anchor.x > safe.right || anchor.y < safe.top + 43 * unit || anchor.y > safe.bottom) continue
        const amount = activity.reduced ? 1 : smoothMotion((activity.elapsedMs - 110 - marker * 65) / 220)
        const point = revealContour(path, fraction * (.8 + .2 * amount)).at(-1)!
        const number = String(++marker).padStart(2, '0')
        if (amount <= 0) continue
        ctx.save()
        ctx.globalAlpha *= amount
        applyGlassInk(ctx, unit)
        ctx.beginPath(); ctx.arc(point.x, point.y, 2.6 * unit, 0, Math.PI * 2); ctx.fill()
        glassMarker(ctx, point, number, .8 * unit)
        ctx.restore()
      }
    }
  } else if(activity.treatment==='inset') {
    const panelWidth=Math.min((safe.right-safe.left)*.9,400*unit),panelHeight=110*unit
    const x=Math.max(safe.left+12*unit,Math.min(safe.right-panelWidth-12*unit,(left+right-panelWidth)/2)),y=Math.max(safe.top+48*unit,Math.min(safe.bottom-panelHeight-16*unit,top-panelHeight-38*unit))
    glassSurface(ctx,x,y,panelWidth,panelHeight,12*unit)
    const scale=Math.min((panelWidth-32*unit)/Math.max(1,right-left),(panelHeight-36*unit)/Math.max(1,bottom-top))
    for(const path of paths)line(path.map(p=>({x:x+panelWidth/2+(p.x-(left+right)/2)*scale,y:y+panelHeight/2+(p.y-(top+bottom)/2)*scale})),2.5)
  }
  ctx.restore()
  if (activity.reportDetail) {
    const { contours, guides, anchors, markers } = activity.reportDetail
    ctx.save()
    ctx.globalAlpha *= .7
    ctx.setLineDash([1 * unit, 4 * unit])
    for (const [index, path] of contours.entries()) {
      line(revealContour(path.map(move), pathReveal(index)), 1.35)
    }
    const acquire = activity.reduced ? 1 : smoothMotion((activity.elapsedMs - 100) / 260)
    ctx.setLineDash([5 * unit, 5 * unit])
    for (const guide of guides) line(revealContour(guide.map(move), acquire), 1.25)
    ctx.globalAlpha *= acquire
    for (const point of anchors.map(move)) {
      ctx.beginPath(); ctx.arc(point.x, point.y, 2.6 * unit, 0, Math.PI * 2)
      applyGlassInk(ctx, unit)
      ctx.fill()
    }
    markers.map(move).forEach((point, index) => {
      if (point.x < safe.left + 14 * unit || point.x > safe.right - 14 * unit || point.y < safe.top + 40 * unit || point.y > safe.bottom) return
      if (acquire > 0) glassMarker(ctx, point, String(index + 1).padStart(2, '0'), .82 * unit)
    })
    ctx.restore()
  }
  if(!activity.label.trim()){ctx.restore();return}
  const arrow = activity.treatment === 'arrow' || activity.treatment === 'ink-callout'
  const handwritten = reportInk || arrow || activity.treatment === 'note' || activity.treatment === 'scribble' || activity.treatment === 'ink-hatch'
  const label = handwritten ? activity.label : activity.label.toUpperCase()
  const fontSize=(reportInk ? 27 : activity.treatment === 'ink-callout' ? 36 : arrow ? 30 : 36)*unit,lineHeight=fontSize+6*unit
  ctx.font=reportInk?`400 ${fontSize}px -apple-system, "SF Pro Text", system-ui`:handwritten?`italic 500 ${fontSize}px "Mogging Share",sans-serif`:`400 ${fontSize}px "SFMono-Regular",Consolas,monospace`
  ctx.textAlign='left';ctx.textBaseline='alphabetic'
  const labelLines=portraitLabelLines(ctx,label,Math.min((safe.right-safe.left)*.9,390*unit))
  const labelWidth=Math.max(...labelLines.map(line=>ctx.measureText(line).width)),onRight=(left+right)/2<width/2
  let labelX=onRight?right+26*unit:left-labelWidth-26*unit,labelY=(top+bottom)/2
  if(labelX<safe.left+16*unit||labelX+labelWidth>safe.right-16*unit||activity.treatment==='inset') {
    labelX=Math.max(safe.left+16*unit,Math.min(safe.right-labelWidth-16*unit,(left+right-labelWidth)/2))
    labelY=top-(activity.treatment==='inset'?162:30)*unit
  }
  labelY=Math.max(safe.top+fontSize,Math.min(safe.bottom-labelLines.length*lineHeight,labelY))
  let placed=placePortraitAnnotation({x:labelX,y:labelY-fontSize,width:labelWidth,height:labelLines.length*lineHeight},safe,unit,width,height,activity.mask)
  if (arrow) {
    const center = { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 }
    const target = points.reduce((best, p) => Math.hypot(p.x-center.x,p.y-center.y) < Math.hypot(best.x-center.x,best.y-center.y) ? p : best)
    const above = target.y - placed.height - 42 * unit
    const y = above >= safe.top ? above : Math.min(safe.bottom - placed.height, target.y + 42 * unit)
    const x = Math.max(safe.left, Math.min(safe.right - placed.width, target.x - placed.width / 2 + (onRight ? 24 : -24) * unit))
    placed = { ...placed, x, y }
  }
  labelX=placed.x;labelY=placed.y+fontSize
  if(arrow || activity.treatment==='callout') {
    const center={x:placed.x+placed.width/2,y:placed.y+placed.height/2}
    const target=points.reduce((best,p)=>Math.hypot(p.x-center.x,p.y-center.y)<Math.hypot(best.x-center.x,best.y-center.y)?p:best)
    const origin={x:Math.max(placed.x,Math.min(placed.x+placed.width,target.x)),y:Math.max(placed.y,Math.min(placed.y+placed.height,target.y))}
    if(Math.hypot(target.x-origin.x,target.y-origin.y)>18*unit) {
      ctx.save();ctx.globalAlpha*=reveal
      if (reportInk) {
        const elbow={x:(origin.x+target.x)/2,y:origin.y}
        const curve = Array.from({ length: 25 }, (_, i) => {
          const t = i / 24, rest = 1 - t
          return { x: rest * rest * origin.x + 2 * rest * t * elbow.x + t * t * target.x,
            y: rest * rest * origin.y + 2 * rest * t * elbow.y + t * t * target.y }
        })
        line(revealContour(curve, reveal), 3)
      const angle=Math.atan2(target.y-elbow.y,target.x-elbow.x),size=11*unit
      if(activity.treatment==='arrow' && (!reportInk || reveal > .85)) line([{x:target.x-size*Math.cos(angle-.5),y:target.y-size*Math.sin(angle-.5)},target,{x:target.x-size*Math.cos(angle+.5),y:target.y-size*Math.sin(angle+.5)}],2.5)
      else {ctx.beginPath();ctx.arc(target.x,target.y,4*unit,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()}
      } else if (arrow) {
        const dx = target.x - origin.x, dy = target.y - origin.y
        const distance = Math.hypot(dx, dy)
        const curve = Math.min(19 * unit, distance * .28) * (onRight ? 1 : -1)
        const bend = {
          x: origin.x + dx * .55 - dy / distance * curve,
          y: origin.y + dy * .55 + dx / distance * curve,
        }
        applyGlassInk(ctx, unit, 2.8, 'rgba(248,251,255,.82)')
        drawEditorialLeader(ctx, origin, bend, target, reveal, unit)
      } else {
        line(revealContour([origin, { x: (origin.x + target.x) / 2, y: origin.y }, target], reveal), 2.5)
        if (reveal > .9) {
          ctx.beginPath();ctx.arc(target.x,target.y,4*unit,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()
        }
      }
      ctx.restore()
    }
  }
  ctx.fillStyle=ink ?? portraitAnnotationInk(ctx,placed,activity.to.faceBoundary?.map(move));ctx.shadowColor=ink ? '#ffffff88' : '#ffffff66';ctx.shadowBlur=(reportInk ? 1 : 4)*unit
  let letters = 0
  const letterCount = labelLines.reduce((count, line) => count + Array.from(line).length, 0)
  const written = activity.labelPhase * (letterCount + 3)
  for (const [index, text] of labelLines.entries()) {
    const count = Array.from(text).length
    drawPortraitLabel(ctx, text, labelX, labelY + index * lineHeight,
      (written - letters) / (count + 3), activity.reduced, handwritten ? unit : 0)
    if (handwritten && !reportInk) {
      const underline = activity.reduced ? 1 : smoothMotion((written - letters - count * .68) / (count * .32 + 3))
      const y = labelY + index * lineHeight + 9 * unit
      const length = ctx.measureText(text).width
      const stroke = Array.from({ length: 16 }, (_, i) => ({
        x: labelX + length * i / 15,
        y: y + (Math.sin(i * .72) * 1.5 - i / 15 * 2) * unit,
      }))
      line(revealContour(stroke, underline), 1.65)
    }
    letters += count
  }
  if (measurement) {
    const unitLabel = measurement.unit === 'px' ? ' px' : measurement.unit
    const text = `${measurement.value}${unitLabel}`
    ctx.save()
    ctx.shadowBlur = 0
    ctx.globalAlpha *= activity.reduced ? 1 : smoothMotion((activity.elapsedMs - 450) / 450)
    ctx.font = `400 ${28 * unit}px "Mogging Share", Arial, sans-serif`
    const pillHeight = 48 * unit
    const pillWidth = Math.min(ctx.measureText(text).width + 40 * unit, safe.right - safe.left)
    const x = Math.max(safe.left, Math.min(safe.right - pillWidth, (left + right - pillWidth) / 2))
    const y = Math.max(safe.top, Math.min(safe.bottom - pillHeight, bottom + 24 * unit))
    ctx.beginPath()
    ctx.roundRect(x, y, pillWidth, pillHeight, pillHeight / 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.fillStyle = '#14202a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + pillWidth / 2, y + pillHeight / 2, Math.max(1, pillWidth - 24 * unit))
    ctx.restore()
  }
  ctx.restore()
}

export function drawPortraitLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, progress: number, reduced=false, inkUnit=0) {
  const characters=Array.from(text), count=characters.length
  for(let i=0;i<count;i++) {
    const opacity=reduced?1:smoothMotion((progress*(count+3)-i)/3)
    if(opacity<=0) continue
    const offset=ctx.measureText(characters.slice(0,i).join('')).width
    const lift = inkUnit * (1 - opacity) * 3
    ctx.save()
    ctx.globalAlpha *= opacity
    ctx.fillText(characters[i], x + offset, y + lift)
    ctx.restore()
  }
}

export function portraitLabelLines(ctx: Pick<CanvasRenderingContext2D,'measureText'>, text: string, width: number): string[] {
  const lines: string[]=[]
  for(const word of text.split(/\s+/)) {
    const last=lines.at(-1)
    if(last && ctx.measureText(`${last} ${word}`).width<=width) lines[lines.length-1]=`${last} ${word}`
    else lines.push(word)
  }
  return lines
}

export function portraitAnnotationInk(ctx: CanvasRenderingContext2D, frame: {x:number;y:number;width:number;height:number}, face: Point[]=[]): string {
  const inside=(point: Point) => {
    let result=false
    for(let i=0,j=face.length-1;i<face.length;j=i++) {
      const a=face[i],b=face[j]
      if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) result=!result
    }
    return result
  }
  if([.1,.5,.9].some(x=>[.1,.5,.9].some(y=>inside({x:frame.x+frame.width*x,y:frame.y+frame.height*y})))) return '#fff'
  return sampleCaptionAppearance(ctx,frame,'#fff',annotationAppearance).ink
}

export function placePortraitAnnotation(frame:{x:number;y:number;width:number;height:number},safe:{left:number;right:number;top:number;bottom:number},unit:number,width:number,height:number,mask?:SubjectMask) {
  if(!mask)return frame
  const candidates=[frame,{...frame,y:frame.y-64*unit},{...frame,y:frame.y-128*unit},{...frame,x:width-frame.x-frame.width},{...frame,x:width-frame.x-frame.width,y:frame.y-64*unit}].map(rect=>({...rect,x:Math.max(safe.left+12*unit,Math.min(safe.right-rect.width-12*unit,rect.x)),y:Math.max(safe.top+12*unit,Math.min(safe.bottom-rect.height-12*unit,rect.y))}))
  const score=(rect:typeof frame)=>{
    let subject=0
    for(let y=0;y<5;y++)for(let x=0;x<9;x++){
      const px=Math.max(0,Math.min(mask.width-1,Math.floor((rect.x+(x+.5)/9*rect.width)/width*mask.width))),py=Math.max(0,Math.min(mask.height-1,Math.floor((rect.y+(y+.5)/5*rect.height)/height*mask.height)))
      subject+=mask.alpha[py*mask.width+px]/255
    }
    const coverage=subject/45
    // Mixed subject/background is precisely the neck/shoulder edge failure.
    return Math.max(1-coverage,coverage*.88)-Math.hypot(rect.x-frame.x,rect.y-frame.y)/Math.max(width,height)*.08
  }
  return candidates.reduce((best,next)=>score(next)>score(best)+.02?next:best)
}

const studySketchSlots = [
  { x: .168, y: .62 }, { x: .674, y: .29 },
  { x: .674, y: .62 }, { x: .168, y: .32 },
] as const

export function drawStudyMarginDiagram(
  ctx: CanvasRenderingContext2D, guide: string, time: number, reduced: boolean,
  width: number, height: number, ink: string, chapter: number, seed: number,
) {
  const diagram = studyDiagrams[guide]
  if (!diagram) return
  const slot = (seed + chapter * (seed % 2 ? 3 : 1)) % studySketchSlots.length
  const draw = (slotIndex: number, detail: boolean) => {
    const { x, y } = studySketchSlots[slotIndex]
    const elapsed = time - (detail ? 1450 : 520)
    const progress = reduced ? 1 : smoothMotion(elapsed / 900)
    if (progress <= 0) return
    const size = detail ? .57 : .84 + ((seed + chapter) % 4) * .05
    ctx.save()
    ctx.translate(width * x, height * y)
    ctx.scale(size, size)
    ctx.globalAlpha *= (detail ? .55 : .86) * progress
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.lineWidth = detail ? 2.2 : 1.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const paths = detail ? diagram.paths.slice(0, 2) : diagram.paths
    for (const [index, path] of paths.entries()) {
      const age = elapsed - index * 100
      const reveal = reduced ? 1 : smoothMotion(age / 850)
      if (reveal <= 0) continue
      const angle = reduced || index % 2 === 0 ? 0 : Math.sin(age / 630 + chapter) * .065
      const [originX, originY] = path[0]
      const points = path.map(([px, py]) => ({
        x: px - (py - originY) * angle,
        y: py + (px - originX) * angle,
      }))
      const trace = (end: number) => {
        ctx.beginPath()
        revealContour(points, end).forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
        ctx.stroke()
      }
      ctx.save()
      ctx.globalAlpha *= .57
      trace(reveal)
      ctx.restore()
      // A moving pencil dash retraces the construction after the lines land.
      if (!reduced && reveal >= 1 && index < 2) {
        ctx.save()
        const head = Math.min(1, (age % 2300) / 1800)
        const tip = revealContour(points, head).at(-1)!
        const tail = revealContour(points, Math.max(0, head - .16)).at(-1)!
        ctx.beginPath()
        ctx.moveTo(tail.x, tail.y)
        ctx.lineTo(tip.x, tip.y)
        ctx.stroke()
        ctx.restore()
      }
    }
    if (!detail) {
      ctx.font = '400 27px "Chalkboard SE", "Segoe Print", system-ui'
      ctx.fillText(diagram.note, 0, 94, width * .16)
    }
    ctx.restore()
  }
  draw(slot, false)
  if ((chapter + seed) % 3 === 1) draw(slot ^ 1, true)
}
