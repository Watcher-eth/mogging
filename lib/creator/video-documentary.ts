import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { loadContextVideo, seekContextVideo, releaseContextVideo } from './context-video'
import { drawScanInvitation, type CreatorBrand } from './brand'
import { isVideoCta, videoBrandFrame, videoTickerMotion } from './video-branding'
import { decodeVisualBeat, decodeVisualSection } from './video-semantics'
import { activeScene, type VideoComposition, type VideoScene } from './video-composition'
import { captionStyle, drawLyricsCaption } from './video-captions'
import { annotationAppearance, sampleCaptionAppearance } from './caption-contrast'
import { videoSize, videoExportSize, captionDesign, sharedElementMotion, type VideoFrame } from './video-layout'
import { scientificEvidenceAt } from './video-research'
import { creatorStudies } from './creator-studies'
import { narratedEvidenceClock, drawNarratedEvidence } from './feature-study'
import { drawSpokenScore } from './spoken-score'
import { drawPhotoStudy, drawPhotoStudyCueLabel } from './video-photo-study'
import { sceneWordStart, scriptTokens } from './video-script'
import { documentaryRegistration, documentarySurveyPins, type SurveyPin } from './video-documentary-registration'
import type { SurveyGeometry } from './video-documentary-graphics'
import { faceContourPaths } from './face-metric-guides'
import type { DocumentaryModel } from './video-documentary-anatomy'
import { editionForLayout, supportsDocumentaryLayout } from './video-documentary-editions'
import { drawEditionCut, drawEditionCutLight, drawEditionLayout, editionCutDuration, editionCutFor, graphitePortrait } from './video-documentary-edition-render'
import { documentaryTreatment } from './video-documentary-plan'
import { documentaryCut, documentaryCutMs, documentaryMotion, sharesDocumentaryPortrait, type DocumentaryShot } from './video-documentary-motion'
import { aperture, displayScanlines, documentaryHalftone, documentGrid, documentMat, edgeFade, fernFont, fernGlass, fernPalette, fernType, lightField, locatorSweep, occlusionWipe } from './video-documentary-primitives'
import { chapterTitle, contourPlate, documentaryObservation, documentaryRoom, documentaryScores, evidenceSequence, filmShutter, gateFrame, practicalLight, projectionGlass, reelGutter, registeredInk, specimenPin, splitFlapChapter } from './video-documentary-sets'
import type { GeneratorImage } from './content-generator'

const { width: W, height: H } = videoSize
const px = videoExportSize.width / W
const centered = { x: .5, y: .45 }
const silhouettes = new WeakMap<HTMLImageElement, Promise<HTMLCanvasElement | undefined>>()
const frame = (x: number, y: number, width: number, height: number): VideoFrame => ({ x, y, width, height })
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

type Photo = { source: GeneratorImage; image: HTMLImageElement; silhouette?: HTMLCanvasElement; halftone?: HTMLCanvasElement; graphite?: HTMLCanvasElement }
type Placement = { x: number; y: number; scale: number; frame: VideoFrame }
type Motion = ReturnType<typeof documentaryMotion>
type PreparedShot = DocumentaryShot & { photos: Photo[]; anchor: NormalizedPoint; guides?: ReturnType<typeof documentaryRegistration>; geometry?: SurveyGeometry; pins: SurveyPin[] }
export type DocumentaryRenderer = { draw(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, reduced: boolean): void; seekMedia(time: number, signal?: AbortSignal): Promise<void>; assetFits: Array<{ sceneId: string; imageId: string; coverage: number }>; fork(): Promise<DocumentaryRenderer>; dispose(): void }

export function documentaryShots(composition: VideoComposition): DocumentaryShot[] {
  const shots: DocumentaryShot[] = []
  for (const [sceneIndex, scene] of composition.scenes.entries()) {
    const kind = scene.documentary?.kind ?? 'stage', beat = decodeVisualBeat(scene.narration)
    const layout = !scene.photoStudy && !scene.featureStudy && supportsDocumentaryLayout(kind) ? scene.documentary?.layout : undefined
    const edition = layout ? editionForLayout(layout) : undefined
    const opening = { scene, index: shots.length, kind, beat, layout, startMs: scene.startMs, durationMs: scene.durationMs }
    shots.push(opening)
    const cutWord = scene.documentary?.cutWord
    if (cutWord !== undefined && scene.source.secondaryImageId && ['stage', 'inspection', 'contact', 'ledger'].includes(kind)) {
      const offset = sceneWordStart(scene, cutWord)
      const lastScore = scene.scoreCallouts?.at(-1)
      if (offset >= (lastScore ? sceneWordStart(scene, lastScore.word) + 1250 : 1450) && scene.durationMs - offset >= 1400) {
        opening.durationMs = offset
        const quote = scene.narration.slice(scriptTokens(scene.narration)[cutWord]?.offset ?? 0)
        shots.push({ scene, index: shots.length, kind: kind === 'contact' ? 'contact' : 'stage', layout: edition?.layouts[edition.layouts[0] === layout ? 1 : 0], beat: decodeVisualBeat(quote, beat.feature), startMs: scene.startMs + offset, durationMs: scene.durationMs - offset, alternateView: true })
        continue
      }
    }
    const minimumHold = edition?.splitAfter ?? 1700
    const minimumScene = edition ? Math.max(3900, minimumHold * 2) : 4400
    if ((!layout && !['stage', 'inspection', 'projection', 'contact', 'specimen'].includes(kind)) || scene.durationMs < minimumScene || scene.photoStudy || scene.featureStudy || scene.scoreCallouts?.length) continue
    const [first, ...rest] = decodeVisualSection(scene.narration, beat.feature).beats
    if (!first || !rest.length) continue
    let word = scriptTokens(first.quote).length
    for (const next of rest) {
      const offset = sceneWordStart(scene, word)
      word += scriptTokens(next.quote).length
      if (offset < minimumHold || scene.durationMs - offset < 1550 || next.feature === 'whole' || next.feature === first.feature && next.intent === first.intent) continue
      const treatment = kind === 'specimen' ? 'registration' : documentaryTreatment(next, composition.variation + shots.length)
      const following = composition.scenes[sceneIndex + 1]
      if (treatment === 'anatomy' || treatment === 'stage' || following?.documentary?.kind === treatment && decodeVisualBeat(following.narration).feature === next.feature) continue
      opening.durationMs = offset
      opening.beat = first
      const nextLayout = edition && layout && supportsDocumentaryLayout(treatment) && (composition.variation + shots.length) % 3 === 0
        ? edition.layouts[edition.layouts[0] === layout ? 1 : 0] : undefined
      shots.push({ scene, index: shots.length, kind: treatment, layout: nextLayout, beat: next, startMs: scene.startMs + offset, durationMs: scene.durationMs - offset })
      break
    }
  }
  return shots
}

function studioSilhouette(image: HTMLImageElement) {
  let pending = silhouettes.get(image)
  if (!pending) {
    pending = loadSilhouette(image).catch(() => undefined)
    silhouettes.set(image, pending)
  }
  return pending
}

async function loadSilhouette(image: HTMLImageElement) {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 8
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, 8, 8)
  const pixels = ctx.getImageData(0, 0, 8, 8).data
  const cleanBackdrop = [0, 1, 6, 7, 8, 15, 16, 23].every(i => {
    const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4)
    return a >= 250 && Math.min(r, g, b) > 195 && Math.max(r, g, b) - Math.min(r, g, b) < 38
  })
  if (!cleanBackdrop) return
  const cutout = import('./editorial-posters').then(module => module.cutout(image))
  let timeout: number | undefined
  try { return await Promise.race([cutout, new Promise<undefined>(resolve => { timeout = window.setTimeout(resolve, 2600) })]) }
  finally { clearTimeout(timeout) }
}

function preparePhoto(id: string | null | undefined, images: GeneratorImage[], decoded: Map<string, HTMLImageElement>): Photo {
  const source = images.find(photo => photo.id === id), image = id ? decoded.get(id) : undefined
  if (!source || !image) throw new Error('A documentary photograph is missing')
  return { source, image }
}

function featureAnchor(photo: Photo | undefined, feature: PreparedShot['beat']['feature']): NormalizedPoint | undefined {
  const a = photo?.source.landmarks?.anchors
  if (!a) return
  const center = (left?: NormalizedPoint, right?: NormalizedPoint) => left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : left ?? right
  switch (feature) {
    case 'eyes': return center(a.leftPupil, a.rightPupil)
    case 'brows': return center(a.leftBrow, a.rightBrow)
    case 'lips': return a.mouthCenter
    case 'philtrum': return center(a.noseTip, a.upperLip)
    case 'facial-hair': return a.chin
    case 'ears': return
    case 'jaw': return center(a.chin, center(a.jawLeft, a.jawRight))
    case 'cheeks': return center(a.leftCheek, a.rightCheek)
    default: return a.noseTip
  }
}

function project(photo: Photo, target: VideoFrame, anchor: NormalizedPoint, zoom: number, drift = 0, focusY = .46, maxScale = 1 / px): Placement {
  const { width, height } = photo.source
  const fitted = Math.min(maxScale, 1 / px, Math.max(target.width / width, target.height / height) * zoom)
  const scale = target.width >= W ? Math.max(target.width / width, fitted) : fitted
  const w = width * scale, h = height * scale
  const x = w < target.width ? target.x + (target.width - w) / 2 : bounded(target.x + target.width * .5 - anchor.x * w + drift, target.x + target.width - w, target.x)
  const y = h < target.height ? target.y + (target.height - h) / 2 : bounded(target.y + target.height * focusY - anchor.y * h, target.y + target.height - h, target.y)
  return { x, y, scale, frame: target }
}

function eyeSpan(photo: Photo) {
  const a = photo.source.landmarks?.anchors
  if (!a?.leftPupil || !a.rightPupil) return
  return Math.hypot((a.rightPupil.x - a.leftPupil.x) * photo.source.width, (a.rightPupil.y - a.leftPupil.y) * photo.source.height)
}

function screenPoint(photo: Photo, placement: Placement, point: NormalizedPoint) {
  return { x: placement.x + point.x * photo.source.width * placement.scale, y: placement.y + point.y * photo.source.height * placement.scale }
}

function placementFor(shot: PreparedShot, motion: Motion) {
  const { kind, photos: [photo], anchor } = shot
  const macro = kind === 'inspection'
  const field = kind === 'locator' ? frame(170, 638, 882, 1080) : frame(0, 462, W, H - 462)
  const zoom = macro ? 1.33 + motion.push * .105 : 1 + motion.push * .06
  return project(photo, field, anchor, zoom, motion.camera * (macro ? 40 : 60), macro ? .41 : .39)
}

type PortraitFinish = 'photo' | 'matte' | 'graphite' | 'ink'
type PortraitPose = { placement: Placement; transform: DOMMatrix; radius: number }

function interpolatePortrait(from: PortraitPose, to: PortraitPose, t: number): PortraitPose {
  const a = from.placement, b = to.placement
  const m = from.transform, n = to.transform
  return {
    transform: new DOMMatrix([mix(m.a, n.a, t), mix(m.b, n.b, t), mix(m.c, n.c, t), mix(m.d, n.d, t), mix(m.e, n.e, t), mix(m.f, n.f, t)]),
    radius: mix(from.radius, to.radius, t),
    placement: {
      x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), scale: mix(a.scale, b.scale, t),
      frame: frame(mix(a.frame.x, b.frame.x, t), mix(a.frame.y, b.frame.y, t), mix(a.frame.width, b.frame.width, t), mix(a.frame.height, b.frame.height, t)),
    },
  }
}

function paintPortrait(ctx: CanvasRenderingContext2D, photo: Photo, placement: Placement, radius: number, finish: PortraitFinish) {
  const { frame: box, x, y, scale } = placement
  ctx.save()
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.width, box.height, radius); ctx.clip()
  ctx.translate(x, y); ctx.scale(scale, scale)
  const image = (finish === 'graphite' ? photo.graphite : finish !== 'photo' ? photo.silhouette : undefined) ?? photo.image
  ctx.drawImage(image, 0, 0, photo.source.width, photo.source.height)
  if (finish === 'ink' && photo.halftone) {
    ctx.globalAlpha *= .8
    ctx.drawImage(photo.halftone, 0, 0, photo.source.width, photo.source.height)
  }
  ctx.restore()
}

function paintStudy(ctx: CanvasRenderingContext2D, photo: Photo, placement: Placement, scene: VideoScene, local: number, reduced: boolean) {
  const study = scene.photoStudy!
  const cueMs = study.startWord === undefined ? undefined : sceneWordStart(scene, study.startWord)
  const { frame: box, x, y, scale } = placement
  ctx.save()
  ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip()
  ctx.translate(x, y); ctx.scale(scale, scale)
  drawPhotoStudy(ctx, photo.image, photo.source.landmarks, study, local, scene.durationMs, reduced, { cueMs })
  ctx.restore()
}

const featureNames = { whole: 'Facial structure', eyes: 'Eye area', nose: 'Nose', lips: 'Mouth', brows: 'Brow line', jaw: 'Jawline', cheeks: 'Cheekbones', philtrum: 'Philtrum', symmetry: 'Facial symmetry', freckles: 'Skin detail', 'facial-hair': 'Facial hair', ears: 'Ear position', dimorphism: 'Facial proportions' }

export async function prepareDocumentary(composition: VideoComposition, images: GeneratorImage[], decoded: Map<string, HTMLImageElement>, brand: CreatorBrand | null = null): Promise<DocumentaryRenderer> {
  const dark = composition.theme === 'dark', palette = fernPalette(dark), variant = composition.variation
  const assets = new Map((composition.media ?? []).map(asset => [asset.id, asset]))
  const videos = new Map<string, HTMLVideoElement>()
  let anatomy: Awaited<ReturnType<typeof import('./video-documentary-anatomy').prepareDocumentaryAnatomy>> | undefined
  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    videos.forEach(releaseContextVideo); videos.clear(); anatomy?.dispose()
  }
  try {
    const shots = documentaryShots(composition).map((shot): PreparedShot => {
      const { kind, scene } = shot
      const photos = kind === 'media' ? []
        : (scene.featureStudy?.evidence ? scene.featureStudy.images
          : kind === 'comparison' ? [scene.source.secondaryImageId, scene.source.imageId]
            : [shot.alternateView ? scene.source.secondaryImageId : scene.source.imageId]).map(id => preparePhoto(id, images, decoded))
      const beat = shot.beat
      const anchor = featureAnchor(photos[0], beat.feature) ?? centered
      const guides = photos[0] && (shot.layout || ['registration', 'blueprint', 'specimen', 'locator', 'inspection', 'contact', 'ink', 'ledger'].includes(kind))
        ? documentaryRegistration(photos[0].source, beat, shot.alternateView ? undefined : scene.profileStudy) : undefined
      const source = photos[0]?.source
      let geometry: SurveyGeometry | undefined
      if (source && guides?.paths.length && ['relief-map', 'route-atlas', 'control-room'].some(layout => layout === shot.layout)) {
        const aspect = source.width / source.height
        const align = (paths: NormalizedPoint[][]) => paths.map(path => path.map(p => ({ x: p.x * aspect, y: p.y })))
        geometry = { outline: source.landmarks ? align(faceContourPaths(source.landmarks, 'faceOutline')) : [], paths: align(guides.paths) }
      }
      const pins = shot.layout === 'survey-markers' && source ? documentarySurveyPins(source, beat.feature) : []
      return { ...shot, photos, anchor, beat, guides, geometry, pins }
    })
    const opticalPhotos = shots.flatMap(shot => !shot.scene.photoStudy && (['survey-plane', 'survey-plot', 'rim-stage', 'interview', 'signal-profile', 'relief-map', 'optical-bench', 'routing-board', 'contact-print', 'route-atlas', 'control-room', 'light-vault', 'survey-markers'].some(layout => layout === shot.layout) || !shot.layout && ['stage', 'inspection', 'projection', 'conclusion', 'marquee', 'ink'].includes(shot.kind)) ? shot.photos : [])
    const portraitWork = Promise.all(opticalPhotos.map(async photo => { photo.silhouette = await studioSilhouette(photo.image) }))
    const textures = new Map<HTMLImageElement, HTMLCanvasElement | undefined>()
    for (const { layout, photos: [photo] } of shots) {
      if (layout === 'graphite') {
        if (!textures.has(photo.image)) textures.set(photo.image, graphitePortrait(photo.image))
        photo.graphite = textures.get(photo.image)
      }
    }
    const halftones = new Map<HTMLImageElement, HTMLCanvasElement | undefined>()
    for (const { kind, layout, photos: [photo] } of shots) {
      if (layout || kind !== 'ink') continue
      if (!halftones.has(photo.image)) halftones.set(photo.image, documentaryHalftone(photo.image))
      photo.halftone = halftones.get(photo.image)
    }
    const settled = await Promise.allSettled(shots.filter(shot => shot.kind === 'media').map(async ({ scene }) => {
      const asset = assets.get(scene.documentary?.mediaId ?? '')
      if (!asset) throw new Error('The documentary media shot is missing its source asset')
      videos.set(scene.id, await loadContextVideo(asset, scene.durationMs, videoExportSize))
    }))
    await portraitWork
    for (const result of settled) if (result.status === 'rejected') throw result.reason
    const models: DocumentaryModel[] = []
    if (shots.some(shot => shot.kind === 'anatomy')) models.push('skull')
    if (shots.some(shot => shot.kind === 'specimen' && !shot.layout)) models.push('head')
    if (models.length) {
      anatomy = await import('./video-documentary-anatomy').then(module => module.prepareDocumentaryAnatomy(dark, models)).catch(() => undefined)
    }
    const assetFits = shots.flatMap(({ scene, photos }) => photos.map(({ source, image }) => ({
      sceneId: scene.id, imageId: source.id, coverage: Math.min(image.naturalWidth / source.width, image.naturalHeight / source.height),
    })))
    const find = (time: number) => shots[Math.max(0, shots.findLastIndex(shot => shot.startMs <= time))]
    // The layout still owns its crop, clipping and styling. During a handoff both
    // layouts draw that primary surface at the same interpolated geometry.
    type PortraitPass = { capture?: PortraitPose; pose?: PortraitPose; width: number; height: number }
    let portraitPass: PortraitPass | undefined
    function setPortraitTransform(ctx: CanvasRenderingContext2D, pass: PortraitPass, transform: DOMMatrix) {
      ctx.setTransform(pass.width / W, 0, 0, pass.height / H, 0, 0)
      ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
    }

    function paintPhoto(ctx: CanvasRenderingContext2D, photo: Photo, place: Placement, radius = 0, matte = false, primary = true, finish: PortraitFinish = matte ? 'matte' : 'photo') {
      const pass = primary ? portraitPass : undefined
      if (!pass || pass.capture) {
        paintPortrait(ctx, photo, place, radius, finish)
        return
      }
      if (!pass.pose) {
        pass.capture = { placement: place, transform: ctx.getTransform(), radius }
        return
      }
      const { transform, placement, radius: currentRadius } = pass.pose
      ctx.save()
      setPortraitTransform(ctx, pass, transform)
      paintPortrait(ctx, photo, placement, currentRadius, finish)
      ctx.restore()
    }

    function comparison(ctx: CanvasRenderingContext2D, shot: PreparedShot, local: number, motion: Motion) {
      const [before, after] = shot.photos, { scene } = shot, reveal = scene.featureStudy?.revealWord
      const at = reveal === undefined ? 0 : sceneWordStart(scene, reveal)
      const entered = local >= at, amount = motion.enter(at, 430)
      const active = entered ? after : before
      const a = featureAnchor(before, scene.featureStudy?.topic ?? shot.beat.feature) ?? centered
      const b = featureAnchor(after, scene.featureStudy?.topic ?? shot.beat.feature) ?? centered
      const box = frame(140, 690, 1018, 1120)
      const leftSpan = eyeSpan(before), rightSpan = eyeSpan(after)
      const span = leftSpan && rightSpan ? Math.min(leftSpan * project(before, box, a, 1.04).scale, rightSpan * project(after, box, b, 1.04).scale) : undefined
      const activeSpan = entered ? rightSpan : leftSpan
      const paint = (photo: Photo, anchor: NormalizedPoint, view: VideoFrame, max?: number) => paintPhoto(ctx, photo, project(photo, view, anchor, 1.04, 0, .47, max))
      documentaryRoom(ctx, palette, motion.camera)
      const beforeLabel = (scene.featureStudy?.labels?.[0] || 'Before').toUpperCase(), afterLabel = (scene.featureStudy?.labels?.[1] || 'After').toUpperCase()
      const mode = (variant + shot.index) % 3
      const maxScale = (photoSpan: number | undefined) => span && photoSpan ? span / photoSpan : undefined
      if (entered && mode === 1) {
        const first = frame(140, mix(690, 630, amount), 1018, mix(1120, 505, amount))
        const second = frame(140, 1240 + (1 - amount) * 115, 1018, 505)
        gateFrame(ctx, first, palette, beforeLabel, 0, view => paint(before, a, view, maxScale(leftSpan)))
        ctx.save(); ctx.globalAlpha *= amount
        gateFrame(ctx, second, palette, afterLabel, 1, view => paint(after, b, view, maxScale(rightSpan)))
        ctx.restore()
        return
      }
      if (entered && mode === 2) {
        const edge = box.x + box.width * amount
        const label = amount >= .98 ? afterLabel : amount <= 0 ? beforeLabel : 'ALIGNED PHOTO SPLICE'
        gateFrame(ctx, box, palette, label, amount >= .98 ? 1 : 0, view => {
          paint(before, a, view, maxScale(leftSpan))
          ctx.save(); ctx.beginPath(); ctx.rect(view.x, view.y, view.width * amount, view.height); ctx.clip()
          paint(after, b, view, maxScale(rightSpan)); ctx.restore()
          if (amount > 0 && amount < .98) {
            ctx.fillStyle = palette.signal
            ctx.fillRect(edge - 1.5, view.y, 3, view.height)
          }
        })
        return
      }
      gateFrame(ctx, box, palette, entered ? afterLabel : beforeLabel, entered ? 1 : 0, view => paint(active, entered ? b : a, view, maxScale(activeSpan)))
      if (!entered) return
      const inset = frame(161 - (1 - amount) * 78, 1485, 267, 266)
      ctx.save(); ctx.globalAlpha *= amount
      gateFrame(ctx, inset, palette, beforeLabel, 0, view => paint(before, a, view))
      ctx.restore()
    }

    function relationships(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion) {
      const photo = shot.photos[0], a = photo.source.landmarks?.anchors
      const candidates: Array<[string, NormalizedPoint | undefined]> = (shot.beat.feature === 'nose' || /\b(?:bridge|nose tip|nostril)\b/i.test(shot.beat.quote))
        ? [['Nose bridge', a?.noseBridge], ['Nose tip', a?.noseTip], ['Upper lip', a?.upperLip]]
        : [['Eye line', featureAnchor(photo, 'eyes')], [featureNames[shot.beat.feature], featureAnchor(photo, shot.beat.feature)], ['Chin', a?.chin]]
      const anchors = candidates.filter((entry): entry is [string, NormalizedPoint] => Boolean(entry[1]))
        .filter((entry, index, all) => all.findIndex(([, p]) => p.x === entry[1].x && p.y === entry[1].y) === index)
      documentaryRoom(ctx, palette, motion.camera)
      const backing = frame(165, 608, 790, 1120)
      if (anchors.length < 2) {
        gateFrame(ctx, backing, palette, 'PORTRAIT RECORD', 0, view => paintPhoto(ctx, photo, project(photo, view, shot.anchor, 1.03)))
        return
      }
      ctx.save(); ctx.globalAlpha *= .13
      paintPhoto(ctx, photo, project(photo, backing, shot.anchor, 1.02), 0, false, false)
      ctx.restore()
      for (const [index, [name, point]] of anchors.entries()) {
        const amount = motion.enter(130 + index * 145, 540)
        if (amount <= 0) continue
        const y = 720 + index * 310 + (1 - amount) * (42 - 30 * index)
        const x = 154 + index * 37 + motion.camera * (20 + 16 * index) - (1 - amount) * 76
        const slab = frame(x, y, 720, 223)
        ctx.save(); ctx.globalAlpha *= amount
        ctx.fillStyle = '#1b2223'
        ctx.beginPath(); ctx.moveTo(x, y + 223); ctx.lineTo(x + 720, y + 223); ctx.lineTo(x + 739, y + 249); ctx.lineTo(x + 22, y + 249); ctx.closePath(); ctx.fill()
        paintPhoto(ctx, photo, project(photo, slab, point, 1.75, 0, .5), 0, false, index === 0)
        ctx.strokeStyle = palette.signal; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x + 721, y + 111); ctx.lineTo(953, y + 111); ctx.lineTo(978, y + 87); ctx.stroke()
        fernType(ctx, String(index + 1).padStart(2, '0'), 991, y + 81, 23, palette.signal, 88)
        fernType(ctx, name.toUpperCase(), 991, y + 125, 25, palette.ink, 210)
        ctx.restore()
      }
      fernType(ctx, 'REGISTERED PHOTO SECTIONS', 153, 1714, 22, palette.quiet)
    }

    function projection(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, contact: boolean, overlay?: { age: number; reduced: boolean }) {
      const photo = shot.photos[0], pan = motion.camera, enter = motion.enter(0, contact ? 390 : 690)
      documentaryRoom(ctx, palette, pan)
      const box = contact ? frame(210 + pan * 37, 637 + 92 * (1 - enter), 886, 1120)
        : frame(148 + pan * 31, 758 + 35 * (1 - enter), 1012, 818)
      ctx.save()
      const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      ctx.translate(pivot.x, pivot.y)
      ctx.transform(1, contact ? 0 : .03 + pan * .055, contact ? 0 : -.07 + pan * .035, 1, 0, 0)
      ctx.translate(-pivot.x, -pivot.y)
      gateFrame(ctx, box, palette, contact ? 'PHOTO RECORD' : 'EVIDENCE PROJECTION', shot.index, view => {
        const place = project(photo, view, shot.anchor, contact ? 1.02 : 1.25, pan * 40, .46, contact ? 1 / px : .96 / px)
        paintPhoto(ctx, photo, place, 0, !contact)
        if (overlay) drawGuides(ctx, shot, place, overlay.age, overlay.reduced)
      })
      if (contact) reelGutter(ctx, box, (1 - enter) * .95)
      else projectionGlass(ctx, box, motion.enter(60, 870))
      ctx.restore()
      if (!contact) {
        practicalLight(ctx, palette, { x: pivot.x, y: pivot.y }, pan * .5, dark)
        aperture(ctx, pan, motion.direction, dark, .45)
      }
    }

    function drawGuides(ctx: CanvasRenderingContext2D, shot: PreparedShot, place: Placement, age: number, reduced: boolean, primary = true) {
      if (age < 0 || !shot.guides?.paths.length) return
      const photo = shot.photos[0]
      ctx.save()
      if (primary && portraitPass?.pose) {
        const { transform, placement } = portraitPass.pose
        setPortraitTransform(ctx, portraitPass, transform)
        place = placement
      }
      const bounds = place.frame
      const anchor = screenPoint(photo, place, shot.anchor)
      const { ink } = sampleCaptionAppearance(ctx, frame(anchor.x - 28, anchor.y - 28, 56, 56), '#fff', annotationAppearance)
      ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip()
      const paths = shot.guides.paths.map(path => path.map(point => screenPoint(photo, place, point)))
      registeredInk(ctx, paths, age, reduced, ink === '#fff' ? '#fff9ec' : '#393932')
      ctx.restore()
    }

    function registrationPlate(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, age: number, reduced: boolean, rack: number) {
      const photo = shot.photos[0]
      documentaryRoom(ctx, palette, motion.camera)
      const box = frame(160, 668, 1020, 1030)
      gateFrame(ctx, box, palette, 'PORTRAIT REGISTRATION', shot.index, view => {
        const place = project(photo, view, shot.anchor, 1.08, motion.camera * 33, .46)
        ctx.save()
        if (rack > 0) ctx.filter = `blur(${rack * 6}px)`
        paintPhoto(ctx, photo, place)
        ctx.restore()
        drawGuides(ctx, shot, place, age - 210, reduced)
      })
      fernType(ctx, shot.guides?.label ?? featureNames[shot.beat.feature], 162, 1795, 33, palette.ink, 820)
    }

    function drawBlueprint(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion) {
      const photo = shot.photos[0], source = photo.source, face = source.landmarks
      const paths = shot.guides?.paths
      if (!face || !paths?.length) { projection(ctx, shot, motion, false); return }
      const aspect = (p: NormalizedPoint) => ({ x: p.x * source.width / source.height, y: p.y })
      const guides = (['faceOutline', 'leftEye', 'rightEye', 'noseBridge', 'mouth'] as const).flatMap(key => faceContourPaths(face, key).map(path => path.map(aspect)))
      contourPlate(ctx, paths.map(path => path.map(aspect)), guides, shot.guides?.label ?? featureNames[shot.beat.feature], palette, motion.camera, motion.enter(75, 800))
    }

    function inkCloseup(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, age: number, reduced: boolean) {
      const photo = shot.photos[0]
      const box = frame(0, 530, W, H - 530)
      const place = project(photo, box, shot.anchor, 1.45 + motion.push * .08, motion.camera * 68, .42)
      paintPhoto(ctx, photo, place, 0, true, true, 'ink')
      practicalLight(ctx, palette, screenPoint(photo, place, shot.anchor), motion.camera, dark)
      drawGuides(ctx, shot, place, age - 230, reduced)
    }

    function ledgerPhoto(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, age: number, reduced: boolean) {
      documentaryRoom(ctx, palette, motion.camera)
      const photo = shot.photos[0]
      const box = frame(165, 700, 970, 820)
      gateFrame(ctx, box, palette, 'SOURCE PHOTOGRAPH', shot.index, view => {
        const place = project(photo, view, shot.anchor, 1.06, motion.camera * 30, .46)
        paintPhoto(ctx, photo, place)
        if (!shot.scene.scoreCallouts?.length) drawGuides(ctx, shot, place, age - 200, reduced)
      })
    }

    function editionFrame(ctx: CanvasRenderingContext2D, shot: PreparedShot, age: number, reduced: boolean) {
      const photo = shot.photos[0]
      const direction = (variant + shot.index) % 2 ? -1 : 1
      const points = photo.source.landmarks?.anchors
      const side = (left?: NormalizedPoint, right?: NormalizedPoint) => direction > 0 ? left ?? right : right ?? left
      const singleFeature = shot.beat.feature === 'eyes' ? side(points?.leftPupil, points?.rightPupil)
        : shot.beat.feature === 'brows' ? side(points?.leftBrow, points?.rightBrow)
          : shot.beat.feature === 'cheeks' ? side(points?.leftCheek, points?.rightCheek) : undefined
      drawEditionLayout(ctx, {
        layout: shot.layout!, age, duration: shot.durationMs, dark, reduced, direction, index: shot.index,
        name: shot.scene.documentary?.label ?? shot.scene.label,
        feature: shot.guides?.label ?? featureNames[shot.beat.feature],
        geometry: shot.geometry, pins: shot.pins,
        paint(box, options = {}) {
          const { zoom = 1, detail, matte, graphite, guides, focusY, keepHead, drift = 0, secondary = false, isolate = false, register } = options
          const anchor = (isolate ? singleFeature : undefined) ?? featureAnchor(photo, shot.beat.feature)
          const target = detail ? anchor ?? centered : centered
          const chin = photo.source.landmarks?.anchors?.chin?.y ?? .72
          const headFit = keepHead ? box.height * .86 / (photo.source.height * Math.max(.3, chin)) : undefined
          const place = project(photo, box, target, zoom, drift, focusY, headFit)
          const imageHeight = photo.source.height * place.scale
          if (keepHead && imageHeight > box.height && imageHeight * chin <= box.height * .92) place.y = box.y
          paintPhoto(ctx, photo, place, 0, matte, !secondary, graphite ? 'graphite' : undefined)
          if (guides) drawGuides(ctx, shot, place, age - 240, reduced, !secondary)
          const pose = !secondary && portraitPass?.pose
          const pass = portraitPass
          const toScreen = (landmark: NormalizedPoint, clip = false) => {
            const current = pose ? pose.placement : place
            const point = screenPoint(photo, current, landmark)
            const crop = current.frame
            if (clip && (point.x < crop.x || point.x > crop.x + crop.width || point.y < crop.y || point.y > crop.y + crop.height)) return
            if (!pose || !pass) return point
            const transformed = pose.transform.transformPoint(point)
            return ctx.getTransform().inverse().transformPoint({ x: transformed.x * pass.width / W, y: transformed.y * pass.height / H })
          }
          register?.(point => toScreen(point, true))
          return anchor ? toScreen(anchor) : undefined
        },
      })
    }

    function specimen(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, reduced: boolean) {
      if (!anatomy) { registrationPlate(ctx, shot, motion, 800, reduced, 0); return }
      documentaryRoom(ctx, palette, motion.camera)
      const box = frame(128, 527, 1034, 1100)
      const point = anatomy.draw(ctx, 'head', box, motion.camera * 1.18, motion.push, shot.beat.feature)
      aperture(ctx, motion.camera, motion.direction, dark, .52)
      if (point) specimenPin(ctx, point, palette, motion.enter(390, 320))
      fernType(ctx, 'ILLUSTRATIVE 3D MODEL', 155, 1660, 23, palette.signal)
      fernType(ctx, featureNames[shot.beat.feature], 153, 1730, 46, palette.ink)
    }

    function caseFile(ctx: CanvasRenderingContext2D, shot: PreparedShot, motion: Motion, evidence?: ReturnType<typeof scientificEvidenceAt>, evidenceProgress = 1) {
      const photo = shot.photos[0]
      documentGrid(ctx, palette, motion.camera * 8)
      const backing = frame(122 - motion.camera * 23, 678, 983, 1006)
      ctx.save()
      ctx.translate(642, 1160); ctx.rotate(-.055); ctx.translate(-642, -1160)
      fernGlass(ctx, backing, palette)
      ctx.restore()
      const card = frame(135 + motion.camera * 27, 640, 1015, 1060)
      documentMat(ctx, card, palette.paper, 14)
      const study = evidence && creatorStudies[evidence.binding.studyId]
      const heading = study ? `${study.authors} · ${study.year}` : 'PORTRAIT FILE'
      fernType(ctx, heading, card.x + 42, card.y + 62, 26, '#54635d', 920)
      const picture = frame(card.x + 42, card.y + 103, 930, study ? 630 : 830)
      paintPhoto(ctx, photo, project(photo, picture, shot.anchor, 1.025), 3)
      if (study) {
        ctx.fillStyle = '#ead1a1'
        ctx.fillRect(card.x + 38, card.y + 784, 875 * evidenceProgress, 37)
        ctx.font = `500 33px ${fernFont}`; ctx.fillStyle = '#172323'
        ctx.fillText(study.title, card.x + 42, card.y + 812, 922)
        ctx.font = `400 26px ${fernFont}`
        ctx.fillText(study.method, card.x + 42, card.y + 871, 922)
        fernType(ctx, `${study.journal} · doi:${study.doi}`, card.x + 42, card.y + 961, 22, '#54635d', 922)
      } else fernType(ctx, featureNames[shot.beat.feature], card.x + 42, card.y + 993, 28, '#343d3a', 920)
    }

    function drawContent(ctx: CanvasRenderingContext2D, shot: PreparedShot, time: number, reduced: boolean) {
      const { kind, scene, photos: [photo] } = shot, local = time - scene.startMs
      const previous = shots[shot.index - 1]
      const cut = portraitPass ? 'hard' : documentaryCut(previous, shot)
      const motion = documentaryMotion(time - shot.startMs, shot.durationMs, variant, shot.index, reduced)
      const transition = motion.enter(0, documentaryCutMs[cut] || 1)
      const evidence = kind !== 'conclusion' && kind !== 'comparison' && kind !== 'media' && !scene.photoStudy ? scientificEvidenceAt(composition, time) : undefined
      const showEdition = Boolean(shot.layout && !evidence)
      if (!showEdition) lightField(ctx, palette, motion.camera)
      if (showEdition) {
        const age = time - shot.startMs
        const editionCut = editionCutFor(shot.layout!)
        const canTransition = previous?.layout && previous.layout !== shot.layout && !reduced && !shot.alternateView
          && !previous.alternateView && !scene.scoreCallouts?.length && !previous.scene.scoreCallouts?.length
          && !scientificEvidenceAt(composition, shot.startMs - 1)
        const duration = Math.min(editionCutDuration[editionCut], shot.durationMs * .25)
        if (!portraitPass && canTransition && age < duration) {
          drawEditionCut(ctx, editionCut, age / duration, motion.direction,
            () => editionFrame(ctx, previous, previous.durationMs, reduced),
            () => editionFrame(ctx, shot, age, reduced))
        } else editionFrame(ctx, shot, age, reduced)
      } else if (evidence && photo) {
        const open = reduced ? 1 : sharedElementMotion((time - evidence.startMs) / 320) * sharedElementMotion((evidence.endMs - time) / 240)
        paintPhoto(ctx, photo, placementFor(shot, motion))
        ctx.save(); ctx.translate(0, (1 - open) * 40); ctx.globalAlpha *= open
        caseFile(ctx, shot, motion, evidence, reduced ? 1 : sharedElementMotion((time - evidence.startMs - 200) / 430))
        ctx.restore()
      } else if (scene.featureStudy?.evidence) {
        const study = scene.featureStudy
        drawNarratedEvidence(ctx, study, shot.photos.map(photo => ({ image: photo.image, landmarks: photo.source.landmarks })),
          narratedEvidenceClock(composition.scenes, scene, local), reduced, dark)
      } else if (kind === 'comparison') comparison(ctx, shot, local, motion)
      else if (kind === 'relations') relationships(ctx, shot, motion)
      else if (kind === 'projection' || kind === 'contact') {
        projection(ctx, shot, motion, kind === 'contact', kind === 'contact' && (shot.alternateView || shot.beat.view !== 'front')
          ? { age: time - shot.startMs - 540, reduced } : undefined)
        if (kind === 'contact' && (shot.alternateView || shots[shot.index + 1]?.alternateView && shots[shot.index + 1].scene.id === scene.id))
          evidenceSequence(ctx, palette, Boolean(shot.alternateView), motion.enter(120, 590))
      }
      else if (kind === 'blueprint') drawBlueprint(ctx, shot, motion)
      else if (kind === 'registration') registrationPlate(ctx, shot, motion, time - shot.startMs, reduced, cut === 'rack' && !reduced ? 1 - transition : 0)
      else if (kind === 'specimen') specimen(ctx, shot, motion, reduced)
      else if (kind === 'dossier') caseFile(ctx, shot, motion)
      else if (kind === 'ink') inkCloseup(ctx, shot, motion, time - shot.startMs, reduced)
      else if (kind === 'ledger') ledgerPhoto(ctx, shot, motion, time - shot.startMs, reduced)
      else if (kind === 'marquee') {
        documentaryRoom(ctx, palette, motion.camera)
        const box = frame(0, 895, W, H - 895)
        const place = project(photo, box, centered, 1.02 + motion.push * .06, motion.camera * 30)
        place.y = box.y
        paintPhoto(ctx, photo, place, 0, true)
        const name = scene.documentary?.label || scene.label
        splitFlapChapter(ctx, name.length < 8 ? `CASE / ${name}` : name, motion.camera, motion.enter)
      }
      else if (kind === 'anatomy') {
        documentaryRoom(ctx, palette, motion.camera)
        if (anatomy) {
          anatomy.draw(ctx, 'skull', frame(90, 595, 1120, 1100), motion.camera, motion.push)
          aperture(ctx, motion.camera, motion.direction, dark, .64)
          fernType(ctx, 'ILLUSTRATIVE SKULL MODEL', 155, 1710, 26, palette.ink)
        } else projection(ctx, shot, motion, false)
      } else if (kind === 'media') {
        const video = videos.get(scene.id)!, asset = assets.get(scene.documentary?.mediaId ?? '')!
        const display = (variant + shot.index) % 2 === 0
        const screen = display ? frame(121 + motion.camera * 24, 648, 1048, 1080) : frame(0, 0, W, H)
        if (display) {
          documentGrid(ctx, palette)
          fernGlass(ctx, frame(screen.x - 18, screen.y - 56, screen.width + 36, screen.height + 74), palette)
          fernType(ctx, asset.role === 'illustration' ? 'ILLUSTRATION' : 'ARCHIVE', screen.x + 8, screen.y - 18, 22, palette.ink)
        }
        const scale = display ? Math.min(screen.width / video.videoWidth, screen.height / video.videoHeight) : Math.max(W / video.videoWidth, H / video.videoHeight)
        ctx.save()
        if (!reduced && cut === 'splice') ctx.globalAlpha *= .46 + transition * .54
        ctx.beginPath(); ctx.rect(screen.x, screen.y, screen.width, screen.height); ctx.clip()
        ctx.drawImage(video, screen.x + (screen.width - video.videoWidth * scale) / 2, screen.y + (screen.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale)
        if (display) displayScanlines(ctx, screen)
        ctx.restore()
        if (asset.source.usage !== 'owned') fernType(ctx, [asset.source.author, asset.source.provider, asset.source.license].filter(Boolean).join(' · '), 144, 1680, 25, '#fff')
      } else {
        const place = placementFor(shot, motion)
        if (kind === 'locator') { documentGrid(ctx, palette); fernGlass(ctx, place.frame, palette) }
        const stage = kind === 'stage' || kind === 'conclusion'
        if (stage) documentaryRoom(ctx, palette, motion.camera)
        if (shot.index === 0 && photo.silhouette) chapterTitle(ctx, scene.documentary?.label ?? '', palette, motion.enter(60, 430))
        if (scene.photoStudy) paintStudy(ctx, photo, place, scene, local, reduced)
        else paintPhoto(ctx, photo, place, kind === 'locator' ? 5 : 0, kind !== 'locator')
        if (kind === 'inspection') {
          practicalLight(ctx, palette, screenPoint(photo, place, shot.anchor), motion.camera, dark)
          if (shot.guides?.label && !scene.photoStudy && !scene.scoreCallouts?.length && !isVideoCta(composition, scene)) {
            const mention = scriptTokens(shot.beat.quote).findIndex(token => token.text.toLowerCase().includes(shot.beat.feature === 'lips' ? 'lip' : shot.beat.feature.replace(/s$/, '')))
            const cueMs = mention < 0 || shot.beat.quote !== scene.narration ? 350 : sceneWordStart(scene, mention)
            drawGuides(ctx, shot, place, time - shot.startMs - cueMs, reduced)
          }
        }
        if (kind === 'locator' && featureAnchor(photo, shot.beat.feature)) {
          const point = screenPoint(photo, place, shot.anchor)
          const progress = motion.enter(190, Math.min(1950, shot.durationMs * .57))
          const { ink } = sampleCaptionAppearance(ctx, frame(point.x - 48, point.y - 48, 96, 96), '#fff', annotationAppearance)
          drawGuides(ctx, shot, place, time - shot.startMs - 260, reduced)
          locatorSweep(ctx, point, 166, progress, palette, reduced, ink === '#fff' ? '#fff9ec' : '#292825')
          fernType(ctx, featureNames[shot.beat.feature].toUpperCase(), 170, 1758, 26, palette.ink)
        }
        if (kind === 'stage') aperture(ctx, motion.camera, motion.direction, dark, reduced ? .28 : .76)
        if (!reduced && cut === 'occlusion' && transition < 1) occlusionWipe(ctx, motion.direction, transition, palette.edge)
        if (shot.index === 0 && kind === 'stage') {
          ctx.save(); ctx.globalAlpha *= motion.enter(100, 310)
          fernType(ctx, scene.documentary?.label ?? '', 154, 1660, 30, palette.ink)
          ctx.restore()
        }
      }
      if (!showEdition && cut === 'shutter' && !reduced) filmShutter(ctx, transition, palette)
      if (!showEdition) edgeFade(ctx, palette.edge, dark, kind === 'marquee' ? 1900 : kind === 'ink' ? 1810 : undefined)
      return { motion, evidence, showEdition }
    }

    function drawWithPortrait(ctx: CanvasRenderingContext2D, shot: PreparedShot, time: number, pass: PortraitPass) {
      ctx.save()
      ctx.setTransform(pass.width / W, 0, 0, pass.height / H, 0, 0)
      portraitPass = pass
      try { return drawContent(ctx, shot, time, false) }
      finally { portraitPass = undefined; ctx.restore() }
    }

    let measurement: CanvasRenderingContext2D | null | undefined
    let incomingFrame: CanvasRenderingContext2D | null | undefined
    const boundaries = new Map<number, [PortraitPose, PortraitPose] | null>()

    function measure(shot: PreparedShot, time: number) {
      measurement ??= document.createElement('canvas').getContext('2d')
      if (!measurement) return
      measurement.canvas.width = measurement.canvas.height = 1
      // Use layout units for the matrix even though the measurement surface is tiny.
      const pass: PortraitPass = { width: W, height: H }
      drawWithPortrait(measurement, shot, time, pass)
      return pass.capture
    }

    function sharedPortrait(ctx: CanvasRenderingContext2D, shot: PreparedShot, time: number, width: number, height: number, reduced: boolean) {
      const previous = shots[shot.index - 1]
      const age = time - shot.startMs, duration = Math.min(660, shot.durationMs * .3)
      if (reduced || age >= duration || !previous || !sharesDocumentaryPortrait(previous, shot)) return
      const outgoingTime = shot.startMs - .001, targetTime = shot.startMs + duration
      if (scientificEvidenceAt(composition, outgoingTime) || scientificEvidenceAt(composition, time) || scientificEvidenceAt(composition, targetTime)) return
      if (!boundaries.has(shot.index)) {
        const from = measure(previous, outgoingTime), to = measure(shot, targetTime)
        boundaries.set(shot.index, from && to ? [from, to] : null)
      }
      const poses = boundaries.get(shot.index)
      if (!poses) return
      incomingFrame ??= document.createElement('canvas').getContext('2d')
      if (!incomingFrame) return
      const canvas = incomingFrame.canvas
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      const progress = sharedElementMotion(age / duration)
      const pose = interpolatePortrait(poses[0], poses[1], progress)
      const pass = { pose, width, height }
      drawWithPortrait(ctx, previous, outgoingTime, pass)
      const content = drawWithPortrait(incomingFrame, shot, time, pass)
      ctx.save()
      ctx.globalAlpha *= progress
      ctx.drawImage(canvas, 0, 0, W, H)
      ctx.restore()
      if (shot.layout && shot.layout !== previous.layout)
        drawEditionCutLight(ctx, editionCutFor(shot.layout), progress, content.motion.direction)
      return content
    }

    return {
      assetFits, fork: () => prepareDocumentary(composition, images, decoded, brand),
      async seekMedia(time, signal) {
        signal?.throwIfAborted()
        const { scene } = find(time), video = videos.get(scene.id)
        if (video) await seekContextVideo(video, time - scene.startMs, signal)
      },
      draw(ctx, time, width, height, reduced) {
        if (disposed) return
        const shot = find(time), { kind, scene } = shot, local = time - scene.startMs
        ctx.save()
        ctx.setTransform(width / W, 0, 0, height / H, 0, 0)
        const shared = sharedPortrait(ctx, shot, time, width, height, reduced)
        const { motion, evidence, showEdition } = shared ?? drawContent(ctx, shot, time, reduced)
        if (scene.scoreCallouts?.some(cue => cue.from !== undefined)) drawSpokenScore(ctx, scene, local, reduced, dark ? 'dark' : 'light')
        else if (scene.scoreCallouts?.length && !shot.alternateView) documentaryScores(ctx, scene, local, reduced, palette, variant + shot.index)
        else if (kind === 'ledger' && !evidence && !showEdition && !shot.alternateView) {
          const feature = shot.guides?.label ?? featureNames[shot.beat.feature]
          documentaryObservation(ctx, feature, shot.guides?.paths.length ? 'REGISTERED TRACE' : 'PHOTO DETAIL', motion.enter(260, 490), palette)
        }
        if (scene.photoStudy?.startWord !== undefined && local >= sceneWordStart(scene, scene.photoStudy.startWord)) drawPhotoStudyCueLabel(ctx, scene.photoStudy)
        const invitation = kind === 'conclusion' || isVideoCta(composition, scene)
        const ticker = invitation ? { opacity: motion.enter(0, 340), offset: 0 } : videoTickerMotion(time, reduced)
        if (ticker) {
          ctx.save(); ctx.globalAlpha *= ticker.opacity; ctx.translate(0, ticker.offset)
          drawScanInvitation(ctx, brand, videoBrandFrame(true)); ctx.restore()
        }
        if (scene.text) {
          const { width: captionWidth, height: captionHeight } = captionStyle(scene)
          const { ink } = sampleCaptionAppearance(ctx, frame(captionDesign.inset, captionDesign.top, captionWidth, captionHeight), dark ? '#fff' : '#252925')
          const prior = activeScene(composition, scene.startMs - 1)
          const handoff = prior !== scene && local < captionDesign.focusMs ? { previous: prior, progress: sharedElementMotion(local / captionDesign.focusMs) } : undefined
          ctx.save(); ctx.translate(0, captionDesign.top); drawLyricsCaption(ctx, scene, local, reduced, ink, handoff); ctx.restore()
        }
        ctx.restore()
      },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
