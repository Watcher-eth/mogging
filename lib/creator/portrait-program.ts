import { applyGlassInk } from './glass-overlay'
import { originalVideoContext } from './video-theme'
import { sampleCaptionAppearance, annotationAppearance } from './caption-contrast'
import { z } from 'zod'
import { scriptTokens, scriptVisualSeed } from './video-script'
import { visualFeatures, decodeVisualBeat, type SemanticBeat } from './video-semantics'
import { jawOutline, visibleFaceSides, facialDetailGuides } from './facial-detail-guides'
import { faceMetricGuides, metricFaceOverlay, narratedFaceMetric, faceContourPaths, faceContourEdge } from './face-metric-guides'
import { morphFaceOverlay } from './face-overlay-morph'
import { revealContour, faceRegionContours, glassSurface } from './video-face-treatment'
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
    labelWord: z.number().int().min(0).optional(), stroke: z.enum(['solid', 'dotted', 'dashed']).optional(), treatment: z.enum(['trace', 'bracket', 'callout', 'landmarks', 'inset', 'arrow', 'highlight', 'scribble', 'note']), label: z.string().max(45) }).strict()).min(1).max(96),
}).strict()
export type PortraitProgram = z.infer<typeof portraitProgramSchema>
const portraitTreatments: Record<string, PortraitProgram['actions'][number]['treatment'][]> = {
  'portrait-audit': ['trace','arrow','highlight','bracket','landmarks'],
  'report-led': ['callout','bracket','trace','arrow'],
  'measurement-explainer': ['bracket','landmarks','arrow','trace'],
  'feature-study': ['highlight','scribble','note','arrow','trace'],
  'hybrid-story': ['callout','arrow','note','scribble','highlight'],
}
type Point = { x: number; y: number }
type SubjectMask = {width:number;height:number;alpha:Uint8ClampedArray}
const subjectMasks = new WeakMap<HTMLCanvasElement|HTMLImageElement,SubjectMask>()
function portraitSubjectMask(image?: HTMLCanvasElement|HTMLImageElement): SubjectMask|undefined {
  if(!image || typeof document==='undefined')return
  const cached=subjectMasks.get(image);if(cached)return cached
  try {const canvas=document.createElement('canvas');canvas.width=64;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,64,96);const pixels=ctx.getImageData(0,0,64,96).data;const mask={width:64,height:96,alpha:Uint8ClampedArray.from({length:64*96},(_,i)=>pixels[i*4+3])};subjectMasks.set(image,mask);return mask}catch{return}
}
export type PreparedPortraitProgram = { view?: 'three-quarter'|'profile'; mask?:SubjectMask; wordCount: number; actions: Array<PortraitProgram['actions'][number] & { overlay: ReportOverlay }>; width: number; height: number }
export type PortraitActivity = { guide?: string; feature?: string; index?: number; view?: 'three-quarter'|'profile'; mask?:SubjectMask; from?: ReportOverlay; to: ReportOverlay; treatment: PortraitProgram['actions'][number]['treatment']; label: string; stroke?: 'solid' | 'dotted' | 'dashed'; focus?: ReportOverlay; previousFocus?: ReportOverlay; labelPhase: number; elapsedMs: number; phase: number; blend: number; first: boolean; reduced: boolean }
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
  'detail:cheeks': { label: 'Cheekbone arcs' }, 'detail:cheek-frame': { label: 'Cheekbone frame' },
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
  { pattern: /^chin$/, feature: 'jaw', guides: ['detail:jaw-frame','detail:jaw-outline'] },
  { pattern: /^(?:cheek|cheeks|cheekbone|cheekbones)$/, feature: 'cheeks', guides: ['detail:cheeks','detail:cheek-frame','detail:under-cheekbones','detail:cheek-levels'] },
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
    return {word,labelWord:word,feature,guide,label:detail?.label ?? 'Face outline',stroke:detail?.stroke ?? 'solid',treatment:treatments[(seed+index)%treatments.length]}
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
  const nose = face.contours?.noseBase?.[3] ?? a.noseTip
  const upper = a.upperLip ?? a.mouthCenter
  const span = a.leftPupil && a.rightPupil ? Math.abs(a.rightPupil.x - a.leftPupil.x) : .2
  const sides = (guide.endsWith('-left') ? ['left'] as const : guide.endsWith('-right') ? ['right'] as const : ['left','right'] as const).filter(side=>visibleFaceSides(face).includes(side))
  // A five-point brow is an open upper edge, not a complete eyebrow polygon.
  const detectedPath = (points: Point[] | undefined) => points && points.length>=3 ? [points] : []
  if (guide.startsWith('detail:brow-outline')) return sides.flatMap(side=>faceContourPaths(face,side==='left'?'leftBrow':'rightBrow'))
  if (guide === 'detail:brow-upper') return sides.flatMap(side=>faceContourEdge(face,side==='left'?'leftBrow':'rightBrow',true))
  if (guide.startsWith('detail:eye-brow')) return sides.flatMap(side=>[...detectedPath(face.contours?.[side==='left'?'leftEye':'rightEye']),...detectedPath(face.contours?.[side==='left'?'leftBrow':'rightBrow'])])
  if (guide === 'detail:eyes' || guide === 'detail:eye-left' || guide === 'detail:eye-right') return sides.flatMap(side=>detectedPath(face.contours?.[side==='left'?'leftEye':'rightEye']))
  if (guide.startsWith('detail:jaw-')) {
    const chin=a.chin
    if(!chin)return []
    const points=face.contours?.jawline?.filter(p=>guide.endsWith('-left')?p.x<=chin.x:p.x>=chin.x)??[]
    return points.length>=3?[points]:[]
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
  if (guide === 'philtrum:lip') return face.contours?.mouth?.length ? [face.contours.mouth.filter(p => p.y <= (a.mouthCenter?.y ?? 1))] : line(a.mouthLeft, upper, a.mouthRight)
  if (guide.startsWith('ears:')) return []
  const center = guide === 'skin:bridge' ? nose : guide === 'skin:left-cheek' || guide === 'ears:left' ? a.leftCheek : a.rightCheek
  if (!center) return []
  // Editorial callouts indicate a region, never invented freckles or measured values.
  return [Array.from({ length: 49 }, (_, i) => { const angle = i / 48 * Math.PI * 2; return { x: center.x + Math.cos(angle) * span * .3, y: center.y + Math.sin(angle) * span * .3 * source.width / source.height } })]
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
    return { ...resolved, overlay }
  }).filter(action => action.overlay.primitives.length)
  return { view:program.view, mask:portraitSubjectMask(image), wordCount: program.wordCount, width: source.width, height: source.height, actions }
}
export const portraitOverlayMinimumMs = 2000
const overlayRevealMs = 250
export const portraitOverlayWindowMs = portraitOverlayMinimumMs + overlayRevealMs
export function portraitProgramSchedule(program: PreparedPortraitProgram, durationMs: number, words?: Array<{startMs:number}>) {
  const scheduled: Array<{action:PreparedPortraitProgram['actions'][number];start:number}> = []
  const interval=portraitOverlayWindowMs, count=Math.max(1,words?.length??program.wordCount)
  if(durationMs<interval)return scheduled
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
  const labelStart = action.labelWord === undefined ? start : words?.[action.labelWord]?.startMs ?? action.labelWord / count * durationMs
  const labelPhase = reduced ? 1 : Math.max(0, Math.min(1, (timeMs - Math.max(start, labelStart)) / overlayRevealMs))
  return { guide:action.guide, feature:action.feature, index, view:program.view, mask:program.mask, focus: action.overlay, previousFocus: previous?.actions[0]?.overlay, labelPhase, elapsedMs: Math.max(0,timeMs-start), from, to: action.overlay, label: action.label, treatment: action.treatment, stroke: action.stroke, phase,
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
export function drawPortraitActivity(ctx: CanvasRenderingContext2D, activity: PortraitActivity, width: number, height: number, warp?: PortraitWarp) {
  ctx = originalVideoContext(ctx)
  const geometry = activity.from ? morphFaceOverlay(activity.from,activity.to,activity.blend) : activity.to
  const move=(p:Point)=>{if(!warp)return p;const q=warpDestinationPoint({x:p.x/width,y:p.y/height},warp);return{x:q.x*width,y:q.y*height}}
  const paths=geometry.primitives.flatMap(p=>p.kind==='polyline'?[p.pixelPoints.map(move)]:[])
  if(!paths.length)return
  const transform=ctx.getTransform(),unit=1/Math.max(.01,Math.hypot(transform.a,transform.b))
  const mapped=Number.isFinite(transform.e)&&Number.isFinite(transform.d)&&transform.a>0&&transform.d>0
  const safe=mapped?{left:Math.max(0,(120-transform.e)/transform.a),right:Math.min(width,(1016-transform.e)/transform.a),top:Math.max(0,(540-transform.f)/transform.d),bottom:Math.min(height,(1960-transform.f)/transform.d)}:{left:0,right:width,top:0,bottom:height}
  if(safe.right<=safe.left || safe.bottom<=safe.top)return
  const reveal=activity.reduced?1:smoothMotion(activity.elapsedMs/overlayRevealMs)
  const points=paths.flat(),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y))
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0
  const line=(points:Point[],weight=activity.view?4.2:3.4)=>{
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y))
    applyGlassInk(ctx,unit,weight);ctx.stroke()
  }
  ctx.setLineDash(activity.stroke==='dotted'?[1*unit,7*unit]:activity.stroke==='dashed'?[12*unit,8*unit]:[])
  for(const path of paths) {
    const visible=revealContour(path,reveal)
    if(activity.treatment==='highlight') {
      ctx.beginPath();visible.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y))
      ctx.strokeStyle='#fff1c733';ctx.lineWidth=18*unit;ctx.stroke()
    }
    line(visible)
  }
  ctx.setLineDash([])
  ctx.save();ctx.globalAlpha*=reveal
  if(activity.treatment==='bracket') {
    const pad=14*unit,length=24*unit,l=left-pad,r=right+pad,t=top-pad,b=bottom+pad
    for(const [x,y,sx,sy] of [[l,t,1,1],[r,t,-1,1],[l,b,1,-1],[r,b,-1,-1]]) line([{x:x+sx*length,y},{x,y},{x,y:y+sy*length}],2.6)
  } else if(activity.treatment==='scribble') {
    const cx=(left+right)/2,cy=(top+bottom)/2,rx=(right-left)/2+20*unit,ry=(bottom-top)/2+18*unit
    line(Array.from({length:70},(_,i)=>{const a=i/69*Math.PI*2.12,jitter=1+Math.sin(i*1.7)*.024;return{x:cx+Math.cos(a)*rx*jitter,y:cy+Math.sin(a)*ry*jitter}}),2.5)
  } else if(activity.treatment==='landmarks') {
    for(const path of paths)for(const point of [path[0],path[Math.floor(path.length/2)],path.at(-1)!]) {
      ctx.beginPath();ctx.arc(point.x,point.y,5*unit,0,Math.PI*2);applyGlassInk(ctx,unit);ctx.fill()
    }
  } else if(activity.treatment==='inset') {
    const panelWidth=Math.min((safe.right-safe.left)*.9,400*unit),panelHeight=110*unit
    const x=Math.max(safe.left+12*unit,Math.min(safe.right-panelWidth-12*unit,(left+right-panelWidth)/2)),y=Math.max(safe.top+48*unit,Math.min(safe.bottom-panelHeight-16*unit,top-panelHeight-38*unit))
    glassSurface(ctx,x,y,panelWidth,panelHeight,12*unit)
    const scale=Math.min((panelWidth-32*unit)/Math.max(1,right-left),(panelHeight-36*unit)/Math.max(1,bottom-top))
    for(const path of paths)line(path.map(p=>({x:x+panelWidth/2+(p.x-(left+right)/2)*scale,y:y+panelHeight/2+(p.y-(top+bottom)/2)*scale})),2.5)
  }
  ctx.restore()
  if(!activity.label.trim()){ctx.restore();return}
  const handwritten=activity.treatment==='note'||activity.treatment==='scribble',label=handwritten?activity.label:activity.label.toUpperCase()
  const fontSize=36*unit,lineHeight=42*unit
  ctx.font=handwritten?`italic 500 ${fontSize}px "Mogging Share",sans-serif`:`400 ${fontSize}px "SFMono-Regular",Consolas,monospace`
  ctx.textAlign='left';ctx.textBaseline='alphabetic'
  const labelLines=portraitLabelLines(ctx,label,Math.min((safe.right-safe.left)*.9,390*unit))
  const labelWidth=Math.max(...labelLines.map(line=>ctx.measureText(line).width)),onRight=(left+right)/2<width/2
  let labelX=onRight?right+26*unit:left-labelWidth-26*unit,labelY=(top+bottom)/2
  if(labelX<safe.left+16*unit||labelX+labelWidth>safe.right-16*unit||activity.treatment==='inset') {
    labelX=Math.max(safe.left+16*unit,Math.min(safe.right-labelWidth-16*unit,(left+right-labelWidth)/2))
    labelY=top-(activity.treatment==='inset'?162:30)*unit
  }
  labelY=Math.max(safe.top+fontSize,Math.min(safe.bottom-labelLines.length*lineHeight,labelY))
  const placed=placePortraitAnnotation({x:labelX,y:labelY-fontSize,width:labelWidth,height:labelLines.length*lineHeight},safe,unit,width,height,activity.mask)
  labelX=placed.x;labelY=placed.y+fontSize
  if(activity.treatment==='arrow'||activity.treatment==='callout') {
    const center={x:placed.x+placed.width/2,y:placed.y+placed.height/2}
    const target=points.reduce((best,p)=>Math.hypot(p.x-center.x,p.y-center.y)<Math.hypot(best.x-center.x,best.y-center.y)?p:best)
    const origin={x:Math.max(placed.x,Math.min(placed.x+placed.width,target.x)),y:Math.max(placed.y,Math.min(placed.y+placed.height,target.y))}
    if(Math.hypot(target.x-origin.x,target.y-origin.y)>18*unit) {
      ctx.save();ctx.globalAlpha*=reveal
      const elbow={x:(origin.x+target.x)/2,y:origin.y}
      line([origin,elbow,target],2.5)
      const angle=Math.atan2(target.y-elbow.y,target.x-elbow.x),size=11*unit
      if(activity.treatment==='arrow') line([{x:target.x-size*Math.cos(angle-.5),y:target.y-size*Math.sin(angle-.5)},target,{x:target.x-size*Math.cos(angle+.5),y:target.y-size*Math.sin(angle+.5)}],2.5)
      else {ctx.beginPath();ctx.arc(target.x,target.y,4*unit,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()}
      ctx.restore()
    }
  }
  ctx.fillStyle=portraitAnnotationInk(ctx,placed,activity.to.faceBoundary?.map(move));ctx.shadowColor='#ffffff66';ctx.shadowBlur=4*unit
  let letters=0
  for(const [index,line] of labelLines.entries()) {
    const progress=activity.labelPhase*(labelLines.join('').length+3)
    drawPortraitLabel(ctx,line,labelX,labelY+index*lineHeight,(progress-letters)/(line.length+3),activity.reduced);letters+=line.length
  }
  if(handwritten) {
    ctx.save();ctx.globalAlpha*=reveal
    const y=labelY+(labelLines.length-1)*lineHeight+9*unit
    line(Array.from({length:16},(_,i)=>({x:labelX+labelWidth*i/15,y:y+Math.sin(i*.8)*2*unit})),2)
    ctx.restore()
  }
  ctx.restore()
}

export function drawPortraitLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, progress: number, reduced=false) {
  const characters=Array.from(text), count=characters.length
  for(let i=0;i<count;i++) {
    const opacity=reduced?1:smoothMotion((progress*(count+3)-i)/3)
    if(opacity<=0) continue
    const offset=ctx.measureText(characters.slice(0,i).join('')).width
    ctx.save();ctx.globalAlpha*=opacity;ctx.fillText(characters[i],x+offset,y);ctx.restore()
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
