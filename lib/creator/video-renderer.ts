import { drawPortraitInstruments, drawPortraitParticles, preparePortraitParticles, instrumentOwnsGuides } from './portrait-instruments'
import { drawPortraitColorExtension } from './report-portrait'
import { drawSpokenScore } from './spoken-score'
import { scriptVisualSeed } from './video-script'
import { preparePortraitProgram, samplePortraitProgram, drawPortraitActivity, type PreparedPortraitProgram } from './portrait-program'
import { drawFeatureStudy, prepareFeatureEdit, type FeaturePhoto } from './feature-study'
import { videoThemeContext, originalVideoContext, darkVideoColor } from './video-theme'
import { portraitOverlayAppearance } from './portrait-print'
import { preparePortraitPrint } from './editorial-posters'
import { annotationAppearance, sampleCaptionAppearance, settleCaptionAppearance, drawAdaptiveCaptionTint } from './caption-contrast'
import { drawFaceMorph, type FaceMorph } from './face-overlay-morph'
import { drawVideoRipple, prepareVideoRipple } from './preview-ripple'
import { isReportScoreElement, createCanvasPainter, type CanvasEffect, type CanvasElement, type CanvasNode, type CanvasPainter, type CanvasPlacement } from './canvas-layout'
import { drawFaceTreatment, preciseFaceOverlay, narratedFaceOverlays } from './video-face-treatment'
import { drawCaptionBackdrop } from './video-progressive-blur'
import { drawPortraitEffects, preparePortraitEffects, portraitLightingSchema, portraitLightGeometry, samplePortraitLighting, neutralPortraitLighting, type PortraitLighting } from './video-portrait-effects'
import { drawPhotoStudy, photoStudyRegions, photoStudyGesture } from './video-photo-study'
import { drawProfileStudy, profileGeometry, type ProfileGeometry } from './video-profile'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { loadMockReportSymbols, mockReportHeroHeight, mockReportScrollMax, mockReportSize, mockReportRegions } from './mock-report'
import { createReportOverlay, type ReportOverlay } from './report-overlay'
import { buildMockOverallCategory } from './mock-report-data'
import { loadShareFont } from './legacy-posters'
import type { ContentSlide, GeneratorImage } from './content-generator'
import { primitiveProgress, sampleMotionPrimitive, primitiveDefinition, type MotionSample } from './motion-primitives'
import { activeScene, parseComposition, videoImageIds, videoStyles, type MotionTrack, type VideoComposition, type VideoScene } from './video-composition'
import { reportEmphasis, reportEmphasisPrimitives, drawAppReport, drawFeatureMetric, reportMotion, reportEntryTimes, reportMetricCues, featureComponent, showsFeatureMetric, expandInPlace, type AppReportAsset } from './report-choreography'
import { videoSize, videoMotion, sharesPortrait, sharesReport, captionDesign, appReportFrame, hasCaption, sceneFrame, featureStageLayout, elementEntrance, smoothMotion, sharedElementMotion, type VideoFrame } from './video-layout'
import { editorialPortraitStage, portraitDetailRegion, preparePortrait, portraitSubject, portraitIsDetail, portraitImageFrame, drawPortraitEdgeFade, registeredPortraitCrop } from './video-portrait'
import { drawStudyBackdrop, drawStudyReferences, studyPortraitFrame, studyReferenceImageId, type StudyReference } from './video-editorial-study'
import { brandLockupLayout, drawBrandLockup, drawMoggingWatermark, loadCreatorBrand, type CreatorBrand } from './brand'
import { videoTickerMotion, brandFaceObstacles, isVideoCta, videoBrandFrame, type BrandObstacle } from './video-branding'
import { drawLyricsCaption, captionStyle, type CaptionHandoff } from './video-captions'
import { continuesGraphicItem, drawExplainer, explainerLayout, explainerPalette, explainerTone, isInstrumentGrid, isPhotoReference, sameInstrumentGrid, explainerTextHeight } from './video-explainer'
import { sampleAppearance } from './motion-presets'
import { registeredHeadFrame, registeredHeadOrientation, type AnatomyRegistration, type AnatomyRenderer } from './video-anatomy'

const { width: W, height: H } = videoSize
const linearPortraitTransitions = new Set(['cinematic-flow', 'transition-panel', 'crossfade', 'focus-cut', 'luma-cut', 'match-reframe', 'layout-morph', 'screen-push', 'wipe-left', 'wipe-right', 'wipe-up', 'card-reveal', 'liquid-ripple'])
const font = '"Mogging Share", Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

type PortraitPrintBlend={from:HTMLCanvasElement|HTMLImageElement;to:HTMLCanvasElement|HTMLImageElement;progress:number}

type SceneAsset = AppReportAsset & { brandFrame?: VideoFrame; program?: PreparedPortraitProgram; featurePhotos?: FeaturePhoto[]; portraitHeadTop?: number; overlayCues?: Array<{ startMs: number; overlay: ReportOverlay }>; portraitSourceRect?: VideoFrame; graphicCaptionHeight?: number; graphicStartMs?: number; graphicEndMs?: number; graphicSpecimen?: StudyReference; lighting?: PortraitLighting; effectMask?: HTMLCanvasElement; secondary: HTMLImageElement | null; portrait: HTMLCanvasElement | HTMLImageElement | null; anatomyRegistration?: AnatomyRegistration; studyLandmarks?: FaceLandmarksPayload | null; profile?: ProfileGeometry; studyReferences?: StudyReference[]; studyStartMs?: number; studyOperationStartMs?: number; studyOperationEndMs?: number }
export type PreparedVideo = {
  composition: VideoComposition
  scenes: Map<string, SceneAsset>
  incoming: HTMLCanvasElement
  outgoing: HTMLCanvasElement
  brand?: CreatorBrand
  anatomy?: AnatomyRenderer
}

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  return canvas
}

const featureLandmarks = new Map<string, Promise<FaceLandmarksPayload>>()

export async function prepareVideo(compositionValue: VideoComposition, images: GeneratorImage[], purpose: 'video' | 'selection' = 'video'): Promise<PreparedVideo> {
  const composition = parseComposition(compositionValue)
  const [brand, anatomy] = await Promise.all([loadCreatorBrand(), composition.scenes.some(scene => scene.source.kind === 'explainer' && (scene.graphic?.layout === 'story')) ? import('./video-anatomy').then(module => module.prepareAnatomyRenderer()) : undefined, document.fonts.ready, loadShareFont().then(() => document.fonts.load('400 64px "Mogging Share"')), loadMockReportSymbols()])
  const requiredIds = videoImageIds(composition.scenes)
  // Upgrade older upper-edge-only brow registrations once per immutable image.
  // Detection runs locally; a failed refresh retains the original usable contours.
  images = await Promise.all(images.map(async source => {
    if (!requiredIds.has(source.id) || source.landmarks?.source!=='mediapipe-face-landmarker' || source.landmarks.contours?.leftBrow?.length!==5) return source
    const {getReportImageLandmarks}=await import('@/lib/client/report-landmarks')
    const landmarks=await getReportImageLandmarks(source.dataUrl,source.dataUrl)
    return landmarks ? {...source,landmarks} : source
  }))
  const decoded = new Map<string, HTMLImageElement>()
  await Promise.all([...requiredIds].map(async id => {
    const source = images.find(image => image.id === id)
    if (!source) throw new Error('A video photo or app screen is missing. Add it again or rebuild the video.')
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not load ${source.name}`)); image.src = source.dataUrl })
    decoded.set(source.id, image)
  }))
  const featurePhotos = new Map<string, Promise<FeaturePhoto>>()
  const featurePhoto = (id: string) => {
    let pending = featurePhotos.get(id)
    if (!pending) {
      pending = (async () => {
        let source = images.find(image => image.id === id)!
        if (!source.landmarks) {
          let detection = featureLandmarks.get(source.dataUrl)
          if (!detection) {
            const url = source.dataUrl, name = source.name
            detection = import('@/lib/client/faceLandmarks').then(async ({ detectFaceLandmarksFromDataUrl }) => {
              const result = await detectFaceLandmarksFromDataUrl(url)
              if (result.status !== 'detected') throw new Error(`Could not register the edited portrait: ${name}`)
              return result.landmarks
            })
            if (featureLandmarks.size >= 24) featureLandmarks.delete(featureLandmarks.keys().next().value!)
            featureLandmarks.set(url, detection)
            void detection.catch(() => featureLandmarks.delete(url))
          }
          source = { ...source, landmarks: await detection }
        }
        const portrait = await preparePortrait(decoded.get(id)!, source)
        return { image: portrait.canvas, landmarks: portrait.source.landmarks, headTop: portrait.headTop }
      })()
      featurePhotos.set(id, pending)
    }
    return pending
  }
  const scenes = new Map<string, SceneAsset>()
  const studyReferences = new Map<string, StudyReference>()
  const prepareReference = (reference: { id: string; label: string; imageId: string; categoryId: string }) => {
    const key = `${reference.imageId}:${reference.categoryId}`
    let cached = studyReferences.get(key)
    if (!cached) {
      const original = images.find(image => image.id === reference.imageId)!, image = decoded.get(reference.imageId)!
      const overlay = preciseFaceOverlay({ size: { width: image.width, height: image.height }, primitives: [], dots: [] }, original, reference.categoryId)
      const anchors = original.landmarks?.anchors
      const referenceAnchors = reference.categoryId === 'cheeks' ? [anchors?.leftCheek, anchors?.rightCheek, anchors?.noseBridge] : reference.categoryId === 'jaw' ? [anchors?.jawLeft, anchors?.jawRight, anchors?.chin] : []
      const points = referenceAnchors.filter(Boolean).length >= 2 ? referenceAnchors.flatMap(point => point ? [{ x: point.x * image.width, y: point.y * image.height }] : []) : overlay.primitives.flatMap(primitive => primitive.kind === 'polyline' ? primitive.pixelPoints : primitive.kind === 'point' ? [primitive.point] : [])
      const crop = portraitDetailRegion(points, image.width, image.height)
      if (!crop) return
      cached = { id: reference.id, label: reference.label, image, imageId: original.id, crop, overlay }
      studyReferences.set(key, cached)
    }
    return { ...cached, id: reference.id, label: reference.label }
  }
  const measurement = document.createElement('canvas').getContext('2d')!
  let priorScroll = 0, priorCategory = ''
  let priorFrame: VideoFrame | undefined
  let previousScene: VideoScene | undefined
  for (const scene of composition.scenes) {
    let source = images.find(image => image.id === scene.source.imageId)
    if (source && scene.featureStudy && !source.landmarks) source = { ...source, landmarks: (await featurePhoto(source.id)).landmarks ?? null }
    if (scene.photoStudy) photoStudyRegions(source?.landmarks, scene.photoStudy.feature)
    const slide: ContentSlide = {
      id: scene.id, templateId: 'mock-report', imageId: scene.source.imageId, categoryId: scene.source.categoryId,
      eyebrow: '', headline: scene.text, supportingCopy: '', metricLabel: scene.source.report?.title ?? scene.source.categoryId,
      metricValue: `${scene.source.metricScore.toFixed(1)} / 10`, cta: '', currentScore: scene.source.currentScore.toFixed(1), potentialScore: scene.source.potentialScore.toFixed(1), potentialScale: scene.source.potentialScale, potentialCurrentScore: scene.source.potentialCurrentScore,
      categoryScores: [{ categoryId: scene.source.categoryId, label: scene.source.report?.title ?? scene.source.categoryId, value: scene.source.metricScore.toFixed(1) }],
      overlayStyle: scene.source.overlay === 'face-map' ? 'face-map' : 'category',
      mockReport: { category: scene.source.report ? { ...scene.source.report, score: scene.source.metricScore, features: scene.source.report.features.map(feature => ({ ...feature })) } : buildMockOverallCategory(String(scene.source.currentScore), {}), scroll: 0 },
    }
    const portrait = source && !['report', 'screen', 'explainer'].includes(scene.source.kind) ? scene.source.overlay === 'face-map' && !scene.editorial && !scene.study && !scene.photoStudy ? { canvas: decoded.get(source.id)!, source, sourceRect: { x: 0, y: 0, width: decoded.get(source.id)!.width, height: decoded.get(source.id)!.height } } : await preparePortrait(decoded.get(source.id)!, source) : null
    const viewport = portrait ? { width: portrait.canvas.width, height: portrait.canvas.height } : { width: mockReportSize.width, height: mockReportHeroHeight }
    let overlay: ReportOverlay | null = source && (Boolean(portrait) || scene.source.overlay !== 'none' || scene.source.kind === 'report') ? createReportOverlay({ ...slide, overlayStyle: 'category' }, portrait?.source ?? source, viewport, 360, scene.source.kind === 'report') : null
    if (overlay && source) overlay = preciseFaceOverlay(overlay, portrait?.source ?? source, scene.photoStudy ? scene.photoStudy.feature === 'face-width' ? 'face-shape' : scene.photoStudy.feature === 'lips' ? 'mouth' : scene.photoStudy.feature : scene.source.categoryId, scene.customSlideId?.startsWith('overlay-') || composition.recipe === 'measurement-explainer' ? '' : scene.narration, scene.portraitFX?.overlay?.regions || scene.study?.operation === 'planes' || Boolean(scene.photoStudy && ['cheeks', 'jaw'].includes(scene.photoStudy.feature)), scene.focus.startsWith('metric:') ? scene.focus.slice(7) : undefined)
    if (overlay) { overlay.ink = '255,255,255'; overlay.pointAppearance = 'minimal'; overlay.labelAppearance = 'scan'; overlay.labelScale = .85 }
    if (!source && !['title', 'explainer'].includes(scene.source.kind)) throw new Error(`Choose a source photo or app screen for ${scene.label}.`)
    const asset: SceneAsset = { image: source ? decoded.get(source.id) ?? null : null, secondary: scene.source.secondaryImageId ? decoded.get(scene.source.secondaryImageId) ?? null : null, portrait: portrait && scene.portraitFX?.print ? await preparePortraitPrint(portrait.canvas, scene.portraitFX.print, purpose) : portrait?.canvas ?? null, overlay, slide, scrollMax: mockReportScrollMax(slide.mockReport!.category), regions: mockReportRegions(measurement, slide.mockReport!.category), initialScroll: scene.source.categoryId === priorCategory ? priorScroll : 0, initialFrame: priorFrame, continuousReport: sharesReport(previousScene, scene) }
    if (portrait && source && overlay && composition.recipe !== 'measurement-explainer' && !scene.focus.startsWith('metric:') && !scene.customSlideId?.startsWith('overlay-') && !scene.profileStudy && !scene.photoStudy && !scene.portraitProgram && scene.words?.length) {
      asset.overlayCues = narratedFaceOverlays(overlay, portrait.source, scene.source.categoryId, scene.words, scene.portraitFX?.overlay?.regions || scene.study?.operation === 'planes')
      asset.overlay = asset.overlayCues[0]?.overlay ?? overlay
    }

    if (scene.source.kind === 'report') { asset.entryTimes = reportEntryTimes(scene, asset); priorScroll = reportMotion(scene, asset, scene.durationMs).scroll; priorCategory = scene.source.categoryId } else priorCategory = ''
    priorFrame = appReportFrame(scene.framing)
    if (previousScene && showsFeatureMetric(previousScene) && showsFeatureMetric(scene) && previousScene.source.kind === scene.source.kind && previousScene.focus === scene.focus && previousScene.source.categoryId === scene.source.categoryId && JSON.stringify(previousScene.source.report) === JSON.stringify(scene.source.report)) {
      asset.metricStartMs = scenes.get(previousScene.id)?.metricStartMs ?? previousScene.startMs
    }
    scenes.set(scene.id, asset)
    asset.portraitSourceRect = portrait?.sourceRect
    asset.portraitHeadTop = portrait && 'headTop' in portrait ? portrait.headTop : undefined
    asset.studyLandmarks = portrait?.source.landmarks ?? source?.landmarks
    if (scene.source.kind === 'portrait') {
      asset.lighting = scene.portraitFX?.lighting ?? (scene.study?.operation === 'light' ? portraitLightingSchema.parse({ target: scene.source.categoryId === 'jaw' ? 'jaw' : 'cheeks', color: scene.study?.operation === 'light' ? 'selective' : 'natural' }) : undefined)
      if (asset.lighting && source && portrait) {
        portraitLightGeometry(asset.studyLandmarks, asset.lighting)
        asset.effectMask = portrait.canvas instanceof HTMLCanvasElement ? portrait.canvas : await portraitSubject(decoded.get(source.id)!, source)
      }
    }
    if (scene.study) {
      asset.studyStartMs = composition.scenes.find(candidate => candidate.study?.id === scene.study!.id && candidate.study.operation !== 'establish')?.startMs ?? scene.startMs
      const continued = previousScene?.study?.id === scene.study.id && previousScene.study.operation === scene.study.operation && previousScene.study.activeId === scene.study.activeId && previousScene.source.imageId === scene.source.imageId
      asset.studyOperationStartMs = continued ? scenes.get(previousScene!.id)?.studyOperationStartMs ?? scene.startMs : scene.startMs
      const remaining = composition.scenes.slice(composition.scenes.indexOf(scene) + 1)
      let last = scene
      for (const next of remaining) {
        if (next.study?.id !== scene.study.id || next.study.operation !== scene.study.operation || next.study.activeId !== scene.study.activeId || next.source.imageId !== scene.source.imageId) break
        last = next
      }
      asset.studyOperationEndMs = last.startMs + last.durationMs
      asset.studyReferences = []
      for (const [index, reference] of scene.study.references.entries()) {
        const prepared = prepareReference({ ...reference, imageId: studyReferenceImageId(scene.study, index) })
        if (prepared) asset.studyReferences.push(prepared)
      }
    }
    if (scene.graphic?.items.some(item => item.diagram)) {
      const priorPhoto = composition.scenes.slice(0, composition.scenes.indexOf(scene)).reverse().find(candidate => candidate.source.kind === 'portrait' && candidate.source.imageId)
      const imageId = priorPhoto?.source.imageId ?? scene.source.imageId ?? scene.source.secondaryImageId
      if (imageId) asset.graphicSpecimen = prepareReference({ id: 'feature', label: 'Photographed feature', imageId, categoryId: ({ width: 'cheeks', taper: 'jaw', contour: 'jaw', expression: 'mouth', orbits: 'eyes', nasal: 'nose', symmetry: 'symmetry', profile: 'face-shape' } as const)[scene.graphic!.items.find(item => item.diagram)!.diagram!] })
      if (!asset.graphicSpecimen) throw new Error('Feature graphics need a detected portrait. Add and analyze a face photo first.')
    }
    if (scene.profileStudy && source) asset.profile = profileGeometry(portrait?.source ?? source, scene.profileStudy.feature === 'angle' && !/angle|turns?|corner|direction/i.test(scene.narration) ? { ...scene.profileStudy, feature: 'jaw' } : scene.profileStudy)
    if (scene.portraitProgram && portrait && !instrumentOwnsGuides(scene.portraitFX?.instrument)) asset.program = preparePortraitProgram(scene.portraitProgram, portrait.source, scene.profileStudy, portrait.canvas)
    if (scene.featureStudy) {
      asset.featurePhotos = await Promise.all(scene.featureStudy.images.map(featurePhoto))
      if (scene.featureStudy.editMode === 'photo' && scene.featureStudy.edit && asset.portrait && asset.featurePhotos[0]) prepareFeatureEdit({ image: asset.portrait, landmarks: asset.studyLandmarks }, asset.featurePhotos[0], scene.featureStudy.topic)
    }
    previousScene = scene
  }
  for (let start = 0; start < composition.scenes.length;) {
    const first = composition.scenes[start]
    if (!first.graphic || !isInstrumentGrid(first.graphic)) { start++; continue }
    let end = start + 1
    while (end < composition.scenes.length && sameInstrumentGrid(first.graphic, composition.scenes[end].graphic)) end++
    const run = composition.scenes.slice(start, end)
    const height = Math.max(...run.map(scene => explainerTextHeight(measurement, scene.text, scene.graphic!)))
    for (const scene of run) {
      const asset = scenes.get(scene.id)!
      asset.graphicCaptionHeight = height; asset.graphicStartMs = first.startMs; asset.graphicEndMs = run.at(-1)!.startMs + run.at(-1)!.durationMs
    }
    start = end
  }
  const particleImages = new Set<CanvasImageSource>()
  for (const scene of composition.scenes) {
    const image = scenes.get(scene.id)?.portrait
    if (!image || !scene.portraitFX?.instrument || scene.portraitFX.instrument.particles === 'none' && !scene.portraitFX.instrument.trails || particleImages.has(image)) continue
    preparePortraitParticles(image); particleImages.add(image)
  }
  const warmed = new Set<CanvasImageSource>()
  for (const scene of composition.scenes) {
    const asset = scenes.get(scene.id)!
    if (!asset.portrait || warmed.has(asset.portrait) || !(asset.lighting || scene.photoStudy || scene.featureStudy?.edit && (scene.featureStudy.editMode === 'warp' || ['lips','brows','philtrum'].includes(scene.featureStudy.topic)))) continue
    preparePortraitEffects(asset.portrait, { landmarks: asset.studyLandmarks, lighting: asset.lighting, mask: asset.effectMask })
    warmed.add(asset.portrait)
  }
  const prepared = { composition, scenes, incoming: surface(), outgoing: surface(), brand, anatomy }
  if (composition.scenes.some(scene => scene.tracks.some(track => track.primitive === 'liquid-ripple'))) prepareVideoRipple(prepared.incoming)
  for (let start = 0; start < composition.scenes.length;) {
    const first = composition.scenes[start]
    let end = start + 1
    while (end < composition.scenes.length && composition.scenes[end].source.categoryId === first.source.categoryId && composition.scenes[end].source.imageId === first.source.imageId) end++
    const chapter = composition.scenes.slice(start, end), cues = reportMetricCues(chapter)
    if (cues) for (const scene of chapter) {
      if (scene.source.kind !== 'report') continue
      const asset = scenes.get(scene.id)!
      asset.narratedMetrics = true
      for (const region of asset.regions.filter(region => region.id.startsWith('feature:'))) asset.entryTimes![region.id] = cues[region.id] === undefined ? Infinity : cues[region.id] - scene.startMs
    }
    start = end
  }
  for (const [index, scene] of composition.scenes.entries()) {
    if (scene.graphic?.layout !== 'story') continue
    for (const source of composition.scenes.slice(0, index).reverse()) {
      if (!['portrait', 'report'].includes(source.source.kind)) continue
      const portrait = scenes.get(source.id)!, elements = inspectVideoScene(prepared, source.id)
      const overlay = elements.find(element => element.id === 'overlay') ?? elements.find(element => element.id === 'portrait')
      const photo = elements.find(element => element.id === 'subject')
      if (!portrait.overlay || !overlay) continue
      const placement = { ...overlay.placement }
      if (source.source.kind === 'report' && !elements.some(element => element.id === 'overlay')) placement.f += reportMotion(source, portrait, source.durationMs).scroll * .18 * W / mockReportSize.width
      const frame = registeredHeadFrame(portrait.overlay, placement)
      if (!frame || Math.min(H, frame.y + frame.height) - Math.max(0, frame.y) < frame.height * .35) continue
      const orientation = registeredHeadOrientation(images.find(image => image.id === source.source.imageId)?.landmarks)
      orientation.roll -= Math.atan2(placement.b, placement.a)
      scenes.get(scene.id)!.anatomyRegistration = { frame, orientation, photo: portrait.portrait && photo ? { image: portrait.portrait, frame: photo.frame } : undefined, reveal: composition.scenes[index - 1]?.graphic?.layout !== 'story' }
      break
    }
  }
  for (const scene of composition.scenes.filter(scene => scene.tracks.some(track => track.target === 'element'))) {
    const available = new Set(inspectVideoScene(prepared, scene.id).map(element => element.id))
    const missing = scene.tracks.find(track => track.target === 'element' && !available.has(track.elementId!))
    if (missing) throw new Error(`Canvas component “${missing.elementId}” is unavailable in ${scene.label}. Choose a component from this scene or remove the track.`)
  }
  for (const scene of composition.scenes) {
    const asset = scenes.get(scene.id)!, elements = inspectVideoScene(prepared, scene.id)
    const obstacles: BrandObstacle[] = brandFaceObstacles(asset.studyLandmarks, elements.find(element => element.id === 'subject')?.placement)
    for (const element of elements.filter(element => element.id === 'headline' || element.id === 'feature-metric' || element.id === 'spoken-score')) obstacles.push({ ...element.frame, weight: 100 })
    asset.brandFrame = videoBrandFrame(isVideoCta(composition, scene), obstacles)
    layoutCache.get(prepared)?.delete(scene.id)
  }
  return prepared
}

function progress(track: MotionTrack, localMs: number, reduced: boolean) {
  return reduced ? 1 : primitiveProgress(localMs, track.startMs, track.durationMs)
}

function transform(ctx: CanvasRenderingContext2D, sample: MotionSample, anchor: { x: number; y: number }) {
  ctx.globalAlpha *= sample.opacity
  ctx.translate(sample.x * W / 100, sample.y * H / 100)
  ctx.translate(anchor.x * W, anchor.y * H)
  ctx.rotate(sample.rotation * Math.PI / 180)
  ctx.scale(sample.scale, sample.scale)
  ctx.translate(-anchor.x * W, -anchor.y * H)
  ctx.filter = sample.blur === 0 && sample.brightness === 1 ? 'none' : `blur(${sample.blur}px) brightness(${sample.brightness})`
}

function applyTracks(ctx: CanvasRenderingContext2D, tracks: MotionTrack[], localMs: number, reduced: boolean) {
  for (const track of tracks) {
    if (localMs < track.startMs && primitiveDefinition(track.primitive).category !== 'entry') continue
    const sample = sampleMotionPrimitive(track.primitive, progress(track, localMs, reduced), track.intensity)
    if (!reduced) transform(ctx, sample, track.anchor)
    if (track.primitive === 'mask-reveal' || track.primitive === 'line-draw') { ctx.beginPath(); ctx.rect(0, 0, W * sample.reveal, H); ctx.clip() }
  }
}

export function createVideoPainter(scene: VideoScene, localMs: number, reduced: boolean, inspect?: (element: CanvasElement) => void, override?: (node: CanvasNode, effect: CanvasEffect) => CanvasEffect, entryTimes?: Record<string, number>, narratedMetrics = false): CanvasPainter {
  const emphasis = scene.source.kind === 'report' ? reportEmphasis(scene, localMs, reduced) : null
  return createCanvasPainter(node => {
    if (scene.source.hidePotential && /^(?:scores\/)?potential(?:\/|$)/.test(node.id)) return { opacity: 0 }
    if (scene.source.hideScores && (isReportScoreElement(node.id) || /\/(?:value|grade|measurement)$/.test(node.id))) return { opacity: 0 }
    const effect: CanvasEffect = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0 }
    if (node.id === 'portrait' && hasCaption(scene) && !scene.tracks.some(track => linearPortraitTransitions.has(track.primitive) || track.target === 'element' && track.elementId === 'portrait' && primitiveDefinition(track.primitive).category === 'entry')) Object.assign(effect, sampleAppearance('in-view', primitiveProgress(localMs, 0, videoMotion.portraitEnterMs), reduced))
    if (scene.source.kind === 'report' && entryTimes?.[node.id] !== undefined && ((!narratedMetrics && node.id.startsWith('feature:')) || node.id === 'potential') && !node.id.includes('/') && !scene.tracks.some(track => track.target === 'element' && track.elementId === node.id && primitiveDefinition(track.primitive).category === 'entry')) effect.opacity = reduced ? 1 : elementEntrance(localMs, entryTimes[node.id], 220)
    if ((hasCaption(scene) || scene.source.kind === 'explainer') && !(scene.graphic && isInstrumentGrid(scene.graphic)) && node.id.endsWith('/surface') && !isReportScoreElement(node.id)) effect.shadow = { color: 'rgba(20,30,44,.12)', blur: 32, y: 10 }
    for (const track of scene.tracks) {
      if (scene.source.kind === 'report' && reportEmphasisPrimitives.has(track.primitive)) continue
      const section = track.elementId ?? track.section ?? scene.focus
      if (scene.source.kind === 'portrait' && !portraitIsDetail(scene) && ['portrait', 'subject'].includes(node.id) && primitiveDefinition(track.primitive).category === 'camera') continue
      const matched = track.target === 'element' ? node.id === section : track.target === 'report' && (node.id === section || section === 'features' && node.id.startsWith('feature:') && !node.id.includes('/'))
      if (!matched) continue
      const definition = primitiveDefinition(track.primitive)
      if (localMs < track.startMs && definition.category !== 'entry') continue
      const sample = sampleMotionPrimitive(track.primitive, progress(track, localMs, reduced), track.intensity)
      if (['border-beam', 'gradient-outline', 'section-spotlight'].includes(track.primitive)) continue
      if (track.primitive === 'section-lift') {
        effect.lift = { amount: sample.reveal, viewport: { x: 0, y: 0, width: W, height: H } }
      } else if (track.primitive === 'section-expand') {
        effect.scale! *= expandInPlace(node.frame, { x: 0, y: 0, width: scene.source.kind === 'report' ? 390 : W, height: H }, sample.reveal, track.intensity).width / node.frame.width
        effect.y! -= reduced ? 0 : sample.reveal * 1.5
      } else if (track.target === 'element' && !reduced) {
        effect.opacity! *= sample.opacity; effect.x! += sample.x; effect.y! += sample.y; effect.scale! *= sample.scale; effect.rotation! += sample.rotation
        effect.blur = (effect.blur ?? 0) + sample.blur; effect.brightness = (effect.brightness ?? 1) * sample.brightness; effect.anchor = track.anchor
        if (track.primitive === 'mask-reveal' || track.primitive === 'line-draw') effect.reveal = sample.reveal
      }
    }
    if (emphasis) {
      const scoreValue = node.id.endsWith('/value') && isReportScoreElement(node.id)
      const scoreTarget = emphasis.section === 'scores' ? node.id.startsWith('scores/') : emphasis.section === 'potential' ? node.id === 'potential/value' || node.id === 'scores/potential/value' : node.id === `${emphasis.section}/value` || node.id === emphasis.section
      if (scoreValue && scoreTarget && !reduced) {
        effect.scale = (effect.scale ?? 1) * (1 + emphasis.amount * .045)
        effect.anchor = { x: node.id === 'scores/current/value' ? 0 : 1, y: .5 }
      } else if (emphasis.section === node.id && !isReportScoreElement(node.id)) {
        effect.highlight = { color: '#32b1ed', amount: emphasis.amount, endColor: '#32b1ed' }
      }
    }
    return { ...effect, ...override?.(node, effect) }
  }, inspect)
}

const layoutCache = new WeakMap<PreparedVideo, Map<string, CanvasElement[]>>()
const outgoingSceneCache = new WeakMap<PreparedVideo, string>()
function sharedImageId(prepared: PreparedVideo, scene: VideoScene | undefined) {
  if (!scene) return undefined
  const asset = prepared.scenes.get(scene.id)
  if (isPhotoReference(scene.graphic)) return asset?.graphicSpecimen?.imageId
  return asset?.portrait ? scene.source.imageId : undefined
}

export function inspectVideoScene(prepared: PreparedVideo, sceneId: string, localMs?: number) {
  const cached = localMs === undefined ? layoutCache.get(prepared)?.get(sceneId) : undefined
  if (cached) return cached
  const scene = prepared.composition.scenes.find(item => item.id === sceneId)
  if (!scene) return []
  const elements = new Map<string, CanvasElement>()
  const time = localMs ?? scene.durationMs - 1
  const context = prepared.incoming.getContext('2d')!
  const noop = () => {}
  const raster = new Set(['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'putImageData'])
  const measurement = new Proxy(context, {
    get: (target, key) => {
      if (raster.has(String(key))) return noop
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop })
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  })
  renderScene(measurement, prepared, scene, time, false, createVideoPainter(scene, time, false, element => elements.set(element.id, element), undefined, prepared.scenes.get(scene.id)?.entryTimes, prepared.scenes.get(scene.id)?.narratedMetrics), undefined, true)
  const result = [...elements.values()]
  if (localMs === undefined) {
    if (!layoutCache.has(prepared)) layoutCache.set(prepared, new Map())
    layoutCache.get(prepared)!.set(sceneId, result)
  }
  return result
}

export function drawVideoFrame(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, timeMs: number, width: number, height: number, reducedMotion = false, inspect?: (element: CanvasElement) => void) {
  const { composition } = prepared
  const time = Math.max(0, Math.min(composition.durationMs - .001, timeMs))
  const scene = activeScene(composition, time)
  const index = composition.scenes.indexOf(scene)
  const localMs = time - scene.startMs
  const incoming = prepared.incoming.getContext('2d')!
  const transition = scene.featureStudy || prepared.scenes.get(scene.id)?.continuousReport ? undefined : scene.tracks.find(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition' && localMs >= track.startMs && localMs < track.startMs + track.durationMs)
  const previous = composition.scenes[index - 1]
  const graphicMorph = transition?.primitive === 'layout-morph' && previous?.source.kind === 'explainer' && scene.source.kind === 'explainer' && explainerTone(previous.graphic!) === explainerTone(scene.graphic!) && scene.graphic!.items.some(item => continuesGraphicItem(previous.graphic, scene.graphic!, item.id))
  const imageId = sharedImageId(prepared, scene)
  const continuousPortrait = Boolean(imageId && imageId === sharedImageId(prepared, previous))
  const linearTransition = transition && linearPortraitTransitions.has(transition.primitive)
  const shared = !reducedMotion && previous && (graphicMorph || linearTransition && continuousPortrait || transition && ['cinematic-flow', 'transition-panel'].includes(transition.primitive) && previous.source.imageId === scene.source.imageId && (hasCaption(previous) || hasCaption(scene)) && (prepared.scenes.get(previous.id)?.portrait || prepared.scenes.get(scene.id)?.portrait))
  const stationary = Boolean(!shared && transition && previous && !reducedMotion && transition.primitive !== 'hard-cut' && stationarySceneChrome(previous,scene) && ['cinematic-flow','transition-panel','crossfade','focus-cut','luma-cut','match-reframe','layout-morph','screen-push','wipe-left','wipe-right','wipe-up','card-reveal'].includes(transition.primitive))
  const featureHandoff = !reducedMotion && previous?.featureStudy && scene.featureStudy && localMs < 560 && stationarySceneChrome(previous,scene) ? {previous,next:scene,time:localMs,progress:sharedElementMotion(localMs/560)} : undefined
  if (shared) drawSharedElements(incoming, prepared, previous, scene, progress(transition!, localMs, false), localMs, inspect)
  else {
    const continuedFace = sharesPortrait(previous, scene) && !previous!.photoStudy && !scene.photoStudy && !previous!.profileStudy && !scene.profileStudy
    const previousAsset = previous && prepared.scenes.get(previous.id)
    const from = previousAsset?.overlayCues?.at(-1)?.overlay ?? previousAsset?.overlay, to = scene.source.overlay === 'none' ? undefined : prepared.scenes.get(scene.id)?.overlay
    renderScene(incoming, prepared, scene, localMs, reducedMotion, createVideoPainter(scene, localMs, reducedMotion, inspect, undefined, prepared.scenes.get(scene.id)?.entryTimes, prepared.scenes.get(scene.id)?.narratedMetrics), continuedFace && from && to ? { from, to, progress: 1 } : undefined, false, featureHandoff, !stationary)
  }
  ctx.save()
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  const scale = Math.min(width / W, height / H)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = composition.theme === 'dark' ? '#111' : '#fff'; ctx.fillRect(0, 0, width, height)
  ctx.setTransform(scale, 0, 0, scale, (width - W * scale) / 2, (height - H * scale) / 2)
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = composition.theme === 'dark' ? '#111' : '#fff'; ctx.fillRect(0, 0, W, H)
  if (shared || !transition || index === 0 || reducedMotion || transition.primitive === 'hard-cut') ctx.drawImage(prepared.incoming, 0, 0)
  else {
    if (outgoingSceneCache.get(prepared) !== `${previous.id}:${stationary}`) {
      renderScene(prepared.outgoing.getContext('2d')!, prepared, previous, previous.durationMs - 1, reducedMotion, undefined, undefined, false, undefined, !stationary)
      outgoingSceneCache.set(prepared, `${previous.id}:${stationary}`)
    }
    const amount = progress(transition, localMs, false)
    if (stationary) drawContentTransition(ctx,prepared.outgoing,prepared.incoming,transition,amount,scriptVisualSeed(scene.id,composition.recipe,scene.narration))
    else if (transition.primitive !== 'liquid-ripple' || !drawVideoRipple(ctx, prepared.outgoing, prepared.incoming, transition, amount)) drawTransition(videoThemeContext(ctx, composition.theme), prepared.outgoing, prepared.incoming, transition, amount, Boolean(scene.study && previous.study?.id === scene.study.id))
  }
  if(stationary) {
    const paint=createVideoPainter(scene,localMs,reducedMotion,inspect,node=>({opacity:1/Math.max(.001,node.opacity??1),x:0,y:0,scale:1,blur:0}))
    drawSceneChrome(ctx,prepared,scene,localMs,reducedMotion,paint,false,{previous:previous!,next:scene,time:localMs,progress:smoothMotion(progress(transition!,localMs,false))})
  }
  drawVideoTicker(ctx, prepared, time, reducedMotion)
  ctx.restore()
}

function drawVideoTicker(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, timeMs: number, reduced: boolean) {
  const motion = videoTickerMotion(timeMs, reduced)
  if (!motion || motion.opacity <= 0 || !prepared.brand) return
  const text = 'Get your scan on Mogging.com', size = 52, gap = 16, padding = 12
  const raw = originalVideoContext(ctx)
  raw.save(); raw.font = '500 40px "Mogging Share", Arial, sans-serif'
  const width = raw.measureText(text).width + size + gap + padding * 2, height = size + padding * 2
  const x = (W - width) / 2, y = H * .055
  const appearance = sampleCaptionAppearance(raw, { x, y, width, height }, prepared.composition.theme === 'dark' ? '#fff' : '#171717')
  raw.globalAlpha *= motion.opacity; raw.translate(0, motion.offset)
  raw.save(); raw.beginPath(); raw.roundRect(x,y,width,height,26); raw.clip()
  const transform = raw.getTransform()
  raw.filter = 'blur(10px)'
  raw.drawImage(raw.canvas, x*transform.a+transform.e,y*transform.d+transform.f,width*transform.a,height*transform.d,x,y,width,height)
  raw.filter = 'none'; raw.fillStyle = appearance.ink === '#fff' ? '#12121470' : '#ffffffa6'; raw.fillRect(x,y,width,height); raw.restore()
  raw.filter = motion.blur ? `blur(${motion.blur}px)` : 'none'
  raw.save(); raw.beginPath(); raw.roundRect(x+padding,y+padding,size,size,16); raw.clip()
  raw.drawImage(prepared.brand.logo,x+padding,y+padding,size,size); raw.restore()
  raw.fillStyle = appearance.ink; raw.textAlign = 'left'; raw.textBaseline = 'middle'
  raw.fillText(text,x+padding+size+gap,y+height/2)
  raw.restore()
}

function mixPlacement(from: CanvasPlacement, to: CanvasPlacement, amount: number): CanvasPlacement {
  return { a: from.a + (to.a - from.a) * amount, b: from.b + (to.b - from.b) * amount, c: from.c + (to.c - from.c) * amount, d: from.d + (to.d - from.d) * amount, e: from.e + (to.e - from.e) * amount, f: from.f + (to.f - from.f) * amount }
}

function drawSharedElements(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, previous: VideoScene, next: VideoScene, progress: number, localMs: number, inspect?: (element: CanvasElement) => void) {
  const from = new Map(inspectVideoScene(prepared, previous.id).map(element => [element.id, element]))
  const to = new Map(inspectVideoScene(prepared, next.id, sharedImageId(prepared, next) ? localMs : undefined).map(element => [element.id, element]))
  const amount = sharedElementMotion(progress), outgoing = amount < .5
  const previousAsset = prepared.scenes.get(previous.id)!, nextAsset = prepared.scenes.get(next.id)!
  const imageId = sharedImageId(prepared, previous)
  const continuousPortrait = Boolean(imageId && imageId === sharedImageId(prepared, next))
  const scene = outgoing ? previous : next, time = outgoing ? previous.durationMs - 1 : localMs
  const fromMetric = featureComponent(prepared.scenes.get(previous.id)!, previous).region.id
  const toMetric = featureComponent(prepared.scenes.get(next.id)!, next).region.id
  const sameMetric = fromMetric === toMetric && previous.source.categoryId === next.source.categoryId && JSON.stringify(previousAsset.slide.mockReport?.category) === JSON.stringify(nextAsset.slide.mockReport?.category) && previousAsset.slide.currentScore === nextAsset.slide.currentScore && previousAsset.slide.potentialScore === nextAsset.slide.potentialScore
  const pairs = new Map<string, [CanvasElement, CanvasElement]>()
  const graphicIds = [...from.keys()].filter(id => /^graphic\/item:[^/]+$/.test(id) && to.has(id))
  const studyIds = [...from.keys()].filter(id => id.startsWith('study/') && to.has(id))
  const continuedGraphicIds = [...from.keys()].filter(id => {
    if (!id.startsWith('graphic/item:') || !to.has(id) || !next.graphic || !continuesGraphicItem(previous.graphic, next.graphic, id.split('/')[1].slice('item:'.length))) return false
    if (id.endsWith('/visual') && (previous.graphic?.variant !== next.graphic.variant || previous.graphic?.layout !== next.graphic.layout)) return false
    return previous.graphic?.layout === next.graphic.layout || previous.graphic?.layout === 'comparison' && next.graphic.layout === 'sequence' || /\/(value|label|detail)$/.test(id)
  })
  for (const [fromId, toId] of [['portrait', 'portrait'], ['subject', 'subject'], ['headline', 'headline'], ['brand', 'brand'], [fromMetric, toMetric], ...Array.from(new Set([...graphicIds, ...continuedGraphicIds, ...studyIds]), id => [id, id])]) {
    const initial = from.get(fromId), final = to.get(toId)
    if (initial && final) pairs.set(outgoing ? fromId : toId, [initial, final])
  }
  const visibility = Math.abs(1 - 2 * amount)
  const paint = createVideoPainter(scene, time, false, inspect, (node, effect) => {
    const pair = pairs.get(node.id)
    if (pair) {
      const persistent = node.id === 'headline' || ['portrait', 'subject'].includes(node.id) && continuousPortrait || node.id === (outgoing ? fromMetric : toMetric) || node.id === 'brand' || graphicIds.includes(node.id) || continuedGraphicIds.includes(node.id) || studyIds.includes(node.id)
      const image = continuousPortrait && ['portrait', 'subject'].includes(node.id)
      return { placement: mixPlacement(pair[0].placement, pair[1].placement, amount), opacity: image ? 1 / Math.max(.001, node.opacity ?? 1) : (effect.opacity ?? 1) * (persistent ? 1 / Math.max(.001, node.opacity ?? 1) : visibility), ...(image ? { clip: false, blur: 0 } : {}) }
    }
    if (/^graphic\/item:[^/]+$/.test(node.id)) return { opacity: (effect.opacity ?? 1) * (outgoing ? 1 - elementEntrance(progress, .08, .36) : elementEntrance(progress, .48, .45)) }
    if (node.id.startsWith('graphic/item:') && !node.id.endsWith('/surface') && !node.id.endsWith('/icon')) {
      return { opacity: (effect.opacity ?? 1) * (continuedGraphicIds.includes(node.id) ? 1 : visibility) }
    }
    if (node.id.startsWith(`${outgoing ? fromMetric : toMetric}/`)) {
      if (sameMetric) return { opacity: 1, x: 0, y: 0, scale: 1, blur: 0 }
      if (node.id.endsWith('/surface')) return {}
      const stagger = node.id.endsWith('/value') || node.id.endsWith('/grade') ? .08 : node.id.endsWith('/visual') ? .04 : 0
      return { opacity: (effect.opacity ?? 1) * (outgoing ? 1 - elementEntrance(progress, .04 + stagger, .32) : elementEntrance(progress, .5 + stagger, .36)), y: (effect.y ?? 0) + (outgoing ? -3 * elementEntrance(progress, .04, .36) : 3 * (1 - elementEntrance(progress, .5, .4))) }
    }
    if (['report', 'report-viewport', 'hero', 'portrait'].includes(node.id)) return { clip: false }
    if (!node.id.includes('/') && !['overlay'].includes(node.id)) return { opacity: (effect.opacity ?? 1) * (outgoing ? 1 - elementEntrance(amount, 0, .5) : elementEntrance(amount, .5, .5)) }
    return {}
  })
  const visibleOverlay = (asset: SceneAsset, source: VideoScene) => source.source.overlay === 'none' && asset.overlay ? { ...asset.overlay, primitives: [], dots: [], faceBoundary: undefined } : asset.overlay
  const fromOverlay = visibleOverlay({ ...previousAsset, overlay: previousAsset.overlayCues?.at(-1)?.overlay ?? previousAsset.overlay }, previous), toOverlay = visibleOverlay(nextAsset, next)
  renderScene(ctx, prepared, scene, time, false, paint, continuousPortrait && fromOverlay && toOverlay ? { from: fromOverlay, to: toOverlay, progress: amount } : undefined, false, { previous, next, time: localMs, progress: amount },true,continuousPortrait && previous.source.kind==='portrait' && next.source.kind==='portrait' && previous.portraitFX?.print!==next.portraitFX?.print && previousAsset.portrait && nextAsset.portrait && !previousAsset.lighting && !nextAsset.lighting && !previous.photoStudy && !next.photoStudy ? {from:previousAsset.portrait,to:nextAsset.portrait,progress:amount}:undefined)
}

function drawTransition(ctx: CanvasRenderingContext2D, previous: HTMLCanvasElement, next: HTMLCanvasElement, track: MotionTrack, p: number, anchoredStudy = false) {
  if (anchoredStudy) {
    ctx.drawImage(previous, 0, 0); ctx.save(); ctx.globalAlpha *= smoothMotion(p); ctx.drawImage(next, 0, 0); ctx.restore(); return
  }
  const sample = sampleMotionPrimitive(track.primitive, p, track.intensity)
  if (['transition-panel', 'layout-morph', 'cinematic-flow', 'focus-cut', 'luma-cut', 'liquid-ripple'].includes(track.primitive)) {
    const amount = smoothMotion(p)
    const travel = track.primitive === 'transition-panel' ? 120 : track.primitive === 'cinematic-flow' ? 56 : 0
    const arc = Math.sin(amount * Math.PI) * (travel ? 10 : 0)
    ctx.save(); ctx.translate(W / 2 - travel * amount, H / 2 - arc); ctx.scale(1 + .008 * amount, 1 + .008 * amount); ctx.translate(-W / 2, -H / 2); ctx.drawImage(previous, 0, 0); ctx.restore()
    ctx.save(); ctx.globalAlpha *= amount; ctx.translate(W / 2 + travel * (1 - amount), H / 2 + arc); ctx.scale(1 + .012 * (1 - amount), 1 + .012 * (1 - amount)); ctx.translate(-W / 2, -H / 2); ctx.drawImage(next, 0, 0); ctx.restore(); return
  }
  ctx.drawImage(previous, 0, 0)
  ctx.save()
  switch (track.primitive) {
    case 'screen-push': {
      const x = sample.x * W / 100
      ctx.drawImage(previous, x - W, 0); ctx.drawImage(next, x, 0); break
    }
    case 'match-reframe': transform(ctx, sample, track.anchor); ctx.drawImage(next, 0, 0); break
    case 'card-reveal': {
      const r = sample.reveal, x = track.anchor.x * W, y = track.anchor.y * H
      ctx.beginPath(); ctx.roundRect(x * (1 - r), y * (1 - r), W * r, H * r, 60 * (1 - r)); ctx.clip(); ctx.drawImage(next, 0, 0); break
    }
    case 'crossfade': ctx.globalAlpha = sample.opacity; ctx.drawImage(next, 0, 0); break
    case 'dip-black': case 'dip-white': {
      ctx.drawImage(p < .5 ? previous : next, 0, 0)
      ctx.fillStyle = track.primitive === 'dip-white' ? '#fff' : '#000'
      ctx.globalAlpha = 1 - Math.abs(p * 2 - 1); ctx.fillRect(0, 0, W, H); break
    }
    case 'wipe-left': case 'wipe-right': case 'wipe-up': {
      const r = sample.reveal
      ctx.beginPath()
      if (track.primitive === 'wipe-up') ctx.rect(0, H * (1 - r), W, H * r)
      else ctx.rect(track.primitive === 'wipe-left' ? W * (1 - r) : 0, 0, W * r, H)
      ctx.clip(); ctx.drawImage(next, 0, 0); break
    }
    case 'glitch-slice': {
      ctx.drawImage(next, 0, 0)
      for (let i = 0; i < 9; i++) {
        const y = ((i * 211 + Math.floor(p * 11) * 47) % H)
        const offset = Math.sin(i * 3 + p * 80) * (1 - p) * 110 * track.intensity
        ctx.drawImage(next, 0, y, W, 45, offset, y, W, 45)
      }
      break
    }
    default: transform(ctx, sample, track.anchor); ctx.drawImage(next, 0, 0)
  }
  ctx.restore()
}

function renderScene(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, scene: VideoScene, localMs: number, reduced: boolean, paint: CanvasPainter = createVideoPainter(scene, localMs, reduced, undefined, undefined, prepared.scenes.get(scene.id)?.entryTimes, prepared.scenes.get(scene.id)?.narratedMetrics), morph?: FaceMorph, measuring = false, captionHandoff?: CaptionHandoff & { next: VideoScene; time: number }, chrome = true, printBlend?:PortraitPrintBlend) {
  ctx = videoThemeContext(ctx, prepared.composition.theme)
  const faceAppearance = portraitOverlayAppearance(scene.portraitFX?.print, scene.portraitFX?.overlay)
  const freeze = scene.tracks.find(track => track.primitive === 'freeze-frame')
  if (freeze && localMs >= freeze.startMs) localMs = Math.min(localMs, freeze.startMs + 200)
  const following = prepared.composition.scenes[prepared.composition.scenes.indexOf(scene) + 1]
  const holdOverlay = Boolean(following && sharesPortrait(scene, following))
  const original = prepared.scenes.get(scene.id)!
  const cueIndex = original.overlayCues?.findLastIndex(cue => cue.startMs <= localMs) ?? -1
  const cue = original.overlayCues?.[cueIndex]
  const asset = cue ? { ...original, overlay: cue.overlay } : original
  if (cue && cueIndex > 0) morph = { from: original.overlayCues![cueIndex - 1].overlay, to: cue.overlay, progress: reduced ? 1 : smoothMotion((localMs - cue.startMs) / videoMotion.styleWaveMs) }
  const previousScene = prepared.composition.scenes[prepared.composition.scenes.indexOf(scene) - 1]
  const priorProgram = previousScene?.source.imageId === scene.source.imageId ? prepared.scenes.get(previousScene.id)?.program : undefined
  const activity = !measuring && asset.program ? samplePortraitProgram(asset.program, localMs, scene.durationMs, scene.words, reduced, priorProgram) : undefined
  const lightFor = (target: VideoScene, time: number) => {
    const light = prepared.scenes.get(target.id)?.lighting
    return light ? samplePortraitLighting(light, target.narration, time, target.durationMs, target.words, reduced) : undefined
  }
  const lightHandoff = captionHandoff && captionHandoff.previous.source.imageId === captionHandoff.next.source.imageId ? captionHandoff : undefined
  const fromLight = lightHandoff ? lightFor(lightHandoff.previous, lightHandoff.previous.durationMs - 1) : undefined
  const toLight = lightHandoff ? lightFor(lightHandoff.next, lightHandoff.time) : undefined
  const blendLight = Boolean(lightHandoff && (fromLight || toLight))
  const activeLighting = blendLight ? toLight ?? neutralPortraitLighting : asset.lighting ? lightFor(scene, localMs) : undefined
  const fromLighting = blendLight ? fromLight ?? neutralPortraitLighting : undefined

  const accent = videoStyles[prepared.composition.style].accent
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  ctx.save()
  applyTracks(ctx, scene.tracks.filter(track => track.target === 'content' && primitiveDefinition(track.primitive).category !== 'transition'), localMs, reduced)
  ctx.save()
  const frame = sceneFrame(scene, localMs, asset.initialFrame, reduced)
  if (scene.featureStudy && asset.portrait) {
    const previous = prepared.composition.scenes[prepared.composition.scenes.indexOf(scene) - 1]
    drawFeatureStudy(ctx, scene.featureStudy, { image: asset.portrait, landmarks: asset.studyLandmarks, headTop: asset.portraitHeadTop }, asset.featurePhotos ?? [], localMs, scene.durationMs, reduced, previous?.source.imageId === scene.source.imageId ? previous.featureStudy : undefined, activity, scene.portraitFX?.instrument)
  } else if (scene.source.kind === 'explainer') {
    const previous = prepared.composition.scenes[prepared.composition.scenes.findIndex(item => item.id === scene.id) - 1]
    drawExplainer(ctx, scene, localMs, reduced, paint, previous?.source.kind === 'explainer' ? previous.graphic : undefined, measuring ? undefined : prepared.anatomy, asset.anatomyRegistration, asset.graphicCaptionHeight, asset.graphicSpecimen, asset.graphicStartMs === undefined ? undefined : { elapsed: scene.startMs + localMs - asset.graphicStartMs, duration: asset.graphicEndMs! - asset.graphicStartMs })
  } else if (scene.source.kind === 'report') {
    drawAppReport(ctx, { ...asset, overlay: scene.source.overlay === 'none' ? null : asset.overlay }, scene, localMs, reduced, (overlayCtx, overlay, width) => {
      if (measuring) return
      overlayCtx.save(); overlayCtx.scale(width / W, width / W)
      paintFaceOverlay(overlayCtx, overlay, scene, localMs, reduced, W, asset.image ?? undefined)
      overlayCtx.restore()
    }, paint, !measuring)
  } else if (scene.source.kind === 'screen') {
    if (asset.image) {
      ctx.save(); ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.width, frame.height); ctx.clip()
      const insets = scene.source.captureInsets ?? { top: .06, bottom: .03 }
      const top = asset.image.height * insets.top, height = asset.image.height * (1 - insets.top - insets.bottom)
      const scale = Math.max(frame.width / asset.image.width, frame.height / height)
      ctx.drawImage(asset.image, 0, top, asset.image.width, height, frame.x + (frame.width - asset.image.width * scale) / 2, frame.y + (frame.height - height * scale) / 2, asset.image.width * scale, height * scale)
      ctx.restore()
    }
  } else {
    const photoStudy = scene.source.overlay === 'face-map' || Boolean(scene.photoStudy)
    const operationMs = scene.startMs + localMs - (asset.studyOperationStartMs ?? scene.startMs)
    const detail = portraitIsDetail(scene)
    let portraitFrame = scene.study ? studyPortraitFrame(scene.study.operation) : scene.editorial || scene.photoStudy ? editorialPortraitStage(scene.editorial) : photoStudy ? { x: 0, y: 0, width: W, height: H } : featureStageLayout({ width: 354, height: 145 }, scene.layout, !detail && scene.focus !== 'action-plan' ? 'scores' : scene.focus).face
    if (showsFeatureMetric(scene)) portraitFrame = { ...portraitFrame, y: captionDesign.top + 220, height: featureComponent(asset, scene).frame.y - (captionDesign.top + 220) + 120 }
    if (detail) portraitFrame = { ...portraitFrame, height: Math.max(portraitFrame.height, H - portraitFrame.y) }
    const overlayDuration = scene.study ? (asset.studyOperationEndMs ?? scene.startMs + scene.durationMs) - (asset.studyOperationStartMs ?? scene.startMs) : scene.durationMs
    const stageHeight = portraitFrame.height / (portraitFrame.width / W)
    const fadeHeight = Math.max(stageHeight, (H - portraitFrame.y) * W / portraitFrame.width)
    if (scene.study && !asset.profile) paint(ctx, { id: `study/${scene.study.id}/background`, label: 'Faint editorial grid', frame: { x: 0, y: 0, width: W, height: H }, draw: drawStudyBackdrop })
    if (scene.study?.operation !== 'recap') paint(ctx, { id: 'portrait', label: 'Portrait & measurements', frame: { ...portraitFrame, height: fadeHeight * portraitFrame.width / W }, size: { width: W, height: fadeHeight }, clip: !detail, draw: (ctx, paint) => {
      ctx.save()
      applyTracks(ctx, scene.tracks.filter(track => detail && track.target === 'camera' && !['report-scroll', 'layout-scale'].includes(track.primitive)), localMs, reduced)
      const picture = asset.portrait
      let protectedBottom: number | undefined
      let imageBottom = stageHeight
      if (picture) {
        const activeReference = asset.studyReferences?.find(reference => reference.id === scene.study?.activeId && reference.imageId === scene.source.imageId)
        const inspectCrop = scene.study?.operation === 'inspect' && activeReference && asset.portraitSourceRect ? registeredPortraitCrop(activeReference.crop, asset.portraitSourceRect, picture.width, picture.height) : undefined
        const focusOverlay = asset.program?.actions[0]?.overlay ?? asset.overlay
        const points = focusOverlay?.primitives.flatMap(primitive => primitive.kind === 'polyline' ? primitive.pixelPoints.map(point => ({ x: point.x / focusOverlay!.size.width * picture.width, y: point.y / focusOverlay!.size.height * picture.height })) : []) ?? []
        const focus = detail ? inspectCrop ?? portraitDetailRegion(points, picture.width, picture.height) ?? undefined : undefined
        const fillBottom = detail || prepared.composition.recipe === 'measurement-explainer'
        const destination = portraitImageFrame(picture, { width: W, height: stageHeight }, focus, asset.studyLandmarks, asset.portraitHeadTop, prepared.composition.recipe === 'measurement-explainer' ? 2.8 : 1.45, fillBottom)
        const context = portraitImageFrame(picture, { width: W, height: stageHeight }, undefined, asset.studyLandmarks, asset.portraitHeadTop, 1.45, fillBottom)
        const previous = prepared.composition.scenes[prepared.composition.scenes.indexOf(scene) - 1]
        const continuedDetail = previous?.source.imageId === scene.source.imageId && previous.source.categoryId === scene.source.categoryId && portraitIsDetail(previous)
        const zoom = !focus || reduced || continuedDetail ? 1 : smoothMotion((scene.study ? operationMs : localMs) / Math.min(1200, scene.durationMs * .35))
        const { x, y, width, height } = Object.fromEntries(Object.entries(destination).map(([key, value]) => [key, context[key as keyof VideoFrame] + (value - context[key as keyof VideoFrame]) * zoom])) as VideoFrame
        imageBottom = y + height
        const protectedY = focus ? focus.y + focus.height : asset.studyLandmarks?.anchors.chin ? asset.studyLandmarks.anchors.chin.y * picture.height : undefined
        if (protectedY !== undefined) protectedBottom = y + protectedY * height / picture.height
        paint(ctx, { id: 'subject', label: 'Source photograph', frame: { x, y, width, height }, size: { width: picture.width, height: picture.height }, draw: (ctx, paint) => {
          if (scene.portraitFX?.instrument && scene.portraitFX.instrument.particles !== 'none' && !measuring) drawPortraitParticles(ctx, picture, scene.portraitFX.instrument, localMs, reduced)
          else if(printBlend && !measuring) drawPortraitPrintSweep(ctx,printBlend.from,printBlend.to,picture.width,picture.height,printBlend.progress)
          else if (scene.photoStudy) drawPhotoStudy(ctx, picture, asset.studyLandmarks, scene.photoStudy, localMs, scene.durationMs, reduced, { lighting: activeLighting, mask: asset.effectMask, overlay: activity ? undefined : asset.overlay, appearance: faceAppearance, paint, measuring })
          else if (activeLighting && !measuring) drawPortraitEffects(ctx, picture, { landmarks: asset.studyLandmarks, lighting: activeLighting, fromLighting, lightingMix: blendLight ? lightHandoff!.progress : undefined, mask: asset.effectMask, timeMs: localMs, reduced })
          else ctx.drawImage(picture, 0, 0)
          if (activity) drawPortraitActivity(ctx, activity, picture.width, picture.height, scene.photoStudy ? photoStudyGesture(scene.photoStudy, photoStudyRegions(asset.studyLandmarks, scene.photoStudy.feature), localMs, scene.durationMs, reduced).warp : undefined)
          if (!activity && scene.study) paint(ctx, { id: 'overlay', label: `Study · ${scene.study.operation}`, frame: { x: 0, y: 0, width: picture.width, height: picture.height }, draw: ctx => {
            if (measuring) return
            if (morph && !asset.profile) { drawFaceMorph(ctx, morph, picture.width, faceAppearance); return }
            if (scene.study!.operation === 'planes' && asset.overlay) drawFaceTreatment(ctx, asset.overlay, picture.width, operationMs, reduced, 1, { durationMs: overlayDuration, hold: holdOverlay, appearance: { pattern: 'dotted', opacity: .88, markers: true, ...faceAppearance, regions: true } })
            if (['establish', 'contour', 'inspect', 'compare'].includes(scene.study!.operation)) {
              if (asset.profile) drawProfileStudy(ctx, asset.profile, operationMs, reduced, { durationMs: overlayDuration, appearance: faceAppearance })
              else if (asset.overlay) drawFaceTreatment(ctx, asset.overlay, picture.width, operationMs, reduced, 1, { durationMs: overlayDuration, hold: holdOverlay, appearance: faceAppearance })
            }
          } })
          if (!activity && !scene.study && asset.profile) paint(ctx, { id: 'overlay', label: 'Visible profile contour · projected image geometry', frame: { x: 0, y: 0, width: picture.width, height: picture.height }, draw: ctx => {
            if (measuring) return
            drawProfileStudy(ctx, asset.profile!, localMs, reduced, { lightingLeadMs: asset.lighting ? 420 : 0, durationMs: overlayDuration, appearance: faceAppearance })
          } })
          if (scene.portraitFX?.instrument?.trails && scene.portraitFX.instrument.particles === 'none' && !measuring) drawPortraitParticles(ctx, picture, scene.portraitFX.instrument, localMs, reduced)
          if (scene.portraitFX?.instrument && !measuring) drawPortraitInstruments(ctx, asset.studyLandmarks, picture.width, picture.height, scene.portraitFX.instrument, localMs, reduced)
          if (!instrumentOwnsGuides(scene.portraitFX?.instrument) && !activity && !scene.study && !asset.profile && !scene.photoStudy && asset.overlay && (!asset.lighting || faceAppearance) && (scene.source.overlay !== 'none' || morph)) paint(ctx, { id: 'overlay', label: 'Face measurements', frame: { x: 0, y: 0, width: picture.width, height: picture.height }, draw: ctx => {
            if (measuring) return
            const tracks = scene.tracks.filter(track => track.target === 'overlay')
            applyTracks(ctx, tracks.filter(track => !['contour-trace', 'line-draw', 'landmark-stagger'].includes(track.primitive)), localMs, reduced)
            const trace = tracks.find(track => ['contour-trace', 'line-draw', 'landmark-stagger'].includes(track.primitive))
            const options = { durationMs: overlayDuration, hold: holdOverlay, appearance: faceAppearance }
            if (morph) drawFaceMorph(ctx, morph, picture.width, faceAppearance)
            else drawFaceTreatment(ctx, asset.overlay!, picture.width, localMs, reduced, trace ? progress(trace, localMs, reduced) : 1, options)
          } })
        } })
      }
      ctx.restore()
      if (!measuring && asset.portrait) {
        drawPortraitColorExtension(ctx, W, fadeHeight, imageBottom)
        drawPortraitEdgeFade(ctx, W, fadeHeight, protectedBottom)
      }
    } })
    if (scene.study && !asset.profile && ['compare', 'recap'].includes(scene.study.operation) && asset.studyReferences) drawStudyReferences(ctx, paint, scene.study, asset.studyReferences, scene.startMs + localMs - (asset.studyStartMs ?? scene.startMs), reduced, { elapsed: operationMs, duration: overlayDuration })
    if (!scene.study && !asset.profile && scene.editorial === 'compare' && asset.portrait && !scene.photoStudy) {
      const picture = asset.portrait
      const points = asset.overlay?.primitives.flatMap(primitive => primitive.kind === 'polyline' ? primitive.pixelPoints : primitive.kind === 'point' ? [primitive.point] : []).map(point => ({ x: point.x * picture.width / asset.overlay!.size.width, y: point.y * picture.height / asset.overlay!.size.height })) ?? []
      const crop = portraitDetailRegion(points, picture.width, picture.height)
      if (crop) paint(ctx, { id: 'feature-detail', label: 'Registered anatomical detail', frame: { x: 60, y: 770, width: 330, height: 300 }, opacity: reduced ? 1 : elementEntrance(localMs, 240, 620), draw: ctx => {
        ctx.fillStyle = '#69737b'; ctx.font = `20px ${font}`; ctx.fillText('DETAIL / ' + scene.source.categoryId.toUpperCase(), 0, 22)
        ctx.save(); ctx.beginPath(); ctx.roundRect(0, 52, 330, 238, 30); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 52, 330, 238)
        ctx.drawImage(picture, crop.x, crop.y, crop.width, crop.height, 0, 52, 330, 238); ctx.restore()
      } })
    }
    if (showsFeatureMetric(scene)) {
      const component = featureComponent(asset, scene)
      if (!measuring && component.region.id !== 'action-plan') drawCaptionBackdrop(ctx, { edge: 'bottom', tint: 'light', role: 'metric', height: H - component.frame.y + 80, theme: prepared.composition.theme })
      drawFeatureMetric(ctx, asset, scene, localMs, reduced, paint)
    }
  }
  ctx.restore()
  for (const track of scene.tracks) {
    if (localMs < track.startMs) continue
    if (track.target === 'decoration' || track.primitive === 'metric-bar-fill' || track.primitive === 'shimmer-pass') drawDecoration(ctx, prepared, scene, track, localMs, accent, reduced)
  }
  if (!measuring) drawSpokenScore(ctx, scene, localMs, reduced)
  if (chrome) drawSceneChrome(ctx, prepared, scene, localMs, reduced, paint, measuring, captionHandoff)
  ctx.restore()
  ctx.restore()
}

function drawSceneChrome(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, scene: VideoScene, localMs: number, reduced: boolean, paint: CanvasPainter, measuring = false, captionHandoff?: CaptionHandoff & { next: VideoScene; time: number }) {
  const asset=prepared.scenes.get(scene.id)!, accent=videoStyles[prepared.composition.style].accent
  ctx=videoThemeContext(originalVideoContext(ctx),prepared.composition.theme)
  const reportCaption = scene.source.kind === 'report' || scene.source.kind === 'screen'
  const photoCaption = scene.source.kind === 'portrait' && !scene.editorial && !scene.study && !scene.photoStudy && scene.source.overlay === 'face-map'
  if (hasCaption(scene) || scene.source.kind === 'explainer' || reportCaption) {
    const captionOnImage = Boolean(asset.anatomyRegistration) || scene.source.kind === 'screen' || photoCaption || scene.source.kind === 'report' && (mockReportHeroHeight - reportMotion(scene, asset, localMs, reduced).scroll) * W / mockReportSize.width > 220
    const ink = reportCaption ? '#171a20' : captionOnImage ? '#fff' : scene.source.kind === 'explainer' ? explainerPalette(explainerTone(scene.graphic!)).ink : '#000'
    if (!measuring) {
      if (reportCaption) drawCaptionBackdrop(ctx, { edge: 'bottom', role: 'report', tint: 'light', theme: prepared.composition.theme })
      if (photoCaption) drawCaptionBackdrop(ctx, { edge: 'bottom', role: 'brand', theme: prepared.composition.theme })
    }
    const cta = isVideoCta(prepared.composition, scene)
    const frame = asset.brandFrame ?? videoBrandFrame(cta)
    if (cta || !reportCaption) paint(ctx, { id: 'brand', label: cta ? 'Mogging: Face Scan · App Store' : 'Mogging watermark', frame,
      opacity: reduced ? 1 : elementEntrance(localMs, cta ? 120 : 0, cta ? 380 : 420), draw: ctx => {
        const raw = originalVideoContext(ctx)
        const appearance = sampleCaptionAppearance(raw, { x: 0, y: 0, width: frame.width, height: frame.height }, prepared.composition.theme === 'dark' ? '#fff' : '#171717', cta ? undefined : annotationAppearance)
        raw.save()
        if (cta) {
          const lockup = brandLockupLayout(raw, frame.width), padding = 10
          if (appearance.tint !== 'none') { raw.fillStyle = appearance.tint === 'dark' ? '#10101299' : '#ffffffbb'; raw.beginPath(); raw.roundRect(lockup.left-padding,6-padding,lockup.total+padding*2,lockup.size+padding*2,32); raw.fill() }
          if (appearance.ink === '#fff') { raw.shadowColor='#0005'; raw.shadowBlur=8 }
          drawBrandLockup(raw, prepared.brand ?? null, 0, 6, frame.width, appearance.ink)
        } else drawMoggingWatermark(raw, appearance.ink)
        raw.restore()
      } })
    paint(ctx, { id: 'headline', label: 'Headline', frame: reportCaption ? { x: 0, y: H - captionDesign.bottomInset - 190, width: W, height: 190 } : scene.source.kind === 'explainer' && !asset.anatomyRegistration ? explainerLayout(scene.graphic!).headline : { x: 0, y: captionDesign.top, width: W, height: 190 }, draw: ctx => drawText(ctx, captionHandoff?.next ?? scene, captionHandoff?.time ?? localMs, accent, reduced, ink, captionHandoff, prepared.composition.theme) })
  }
}

// Only pin chrome whose geometry and backdrop role are identical. A top/bottom
// caption change or graphic-specific title still uses its authored scene transition.
export function stationarySceneChrome(previous: VideoScene | undefined, next: VideoScene): boolean {
  const captions=(scene:VideoScene)=>hasCaption(scene)||['report','screen'].includes(scene.source.kind)
  if (!previous || !captions(previous) || !captions(next)) return false
  if ([previous,next].some(scene=>['explainer','title'].includes(scene.source.kind))) return false
  const signature=(scene:VideoScene)=>{
    const style=captionStyle(scene)
    const photo=scene.source.kind==='portrait'&&!scene.editorial&&!scene.study&&!scene.photoStudy&&scene.source.overlay==='face-map'
    return [style.report,style.size,style.height,photo].join(':')
  }
  return signature(previous)===signature(next)
}

export function contentTransitionMotion(p: number, variant: number) {
  const t=smoothMotion(Math.max(0,Math.min(1,p)))
  return variant%3===2 ? {fromX:0,fromY:0,toX:0,toY:0,fromScale:1,toScale:1+.035*(1-t),opacity:1}
    : {fromX:variant%3===0?-96*t:0,fromY:variant%3===1?-120*t:0,toX:variant%3===0?96*(1-t):0,toY:variant%3===1?120*(1-t):0,fromScale:1,toScale:1,opacity:1}
}
function drawContentTransition(ctx: CanvasRenderingContext2D, previous: HTMLCanvasElement, next: HTMLCanvasElement, track: MotionTrack, p: number, seed: number) {
  const variant=track.primitive==='wipe-up'?1:track.primitive==='match-reframe'?2:track.primitive==='screen-push'||track.primitive==='wipe-left'||track.primitive==='wipe-right'?0:seed%3
  const motion=contentTransitionMotion(p,variant), direction=track.primitive==='wipe-right'?-1:1
  const draw=(image:HTMLCanvasElement,x:number,y:number,scale:number,opacity:number)=>{
    ctx.save();ctx.globalAlpha*=opacity;ctx.translate(W/2+x*direction,H/2+y);ctx.scale(scale,scale);ctx.translate(-W/2,-H/2);ctx.drawImage(image,0,0);ctx.restore()
  }
  draw(previous,motion.fromX,motion.fromY,motion.fromScale,1)
  // Reveal the opaque incoming scene across a short spatial movement, rather
  // than dragging a full phone height of empty canvas between two portraits.
  const reveal=smoothMotion(Math.max(0,Math.min(1,p)))
  ctx.save();ctx.beginPath()
  if(variant===1)ctx.rect(0,H*(1-reveal),W,H*reveal)
  else ctx.rect(direction<0||variant===2?0:W*(1-reveal),0,W*reveal,H)
  ctx.clip();draw(next,motion.toX,motion.toY,motion.toScale,motion.opacity);ctx.restore()
}

function paintFaceOverlay(ctx: CanvasRenderingContext2D, overlay: ReportOverlay, scene: VideoScene, localMs: number, reduced: boolean, width = W, photo?: HTMLImageElement) {
  const trace = scene.tracks.find(track => track.target === 'overlay' && ['line-draw', 'landmark-stagger', 'contour-trace'].includes(track.primitive))
  drawFaceTreatment(ctx, overlay, width, localMs, reduced, trace ? progress(trace, localMs, reduced) : 1, { durationMs: scene.durationMs, appearance: portraitOverlayAppearance(scene.portraitFX?.print, scene.portraitFX?.overlay) })
}

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }) {
  const scale = Math.max(rect.width / image.width, rect.height / image.height)
  ctx.drawImage(image, rect.x + (rect.width - image.width * scale) / 2, rect.y + (rect.height - image.height * scale) / 2, image.width * scale, image.height * scale)
}

function drawText(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, accent: string, reduced: boolean, ink = '#000', handoff?: CaptionHandoff, theme: 'light' | 'dark' = 'light') {
  ctx = originalVideoContext(ctx)
  ctx.save()
  if (!handoff) applyTracks(ctx, scene.tracks.filter(track => track.target === 'text' && ['entry', 'exit'].includes(primitiveDefinition(track.primitive).category)), localMs, reduced)
  const frame = { x: captionDesign.inset, y: 0, width: captionDesign.width, height: captionStyle(scene).height }
  const bottom = ['report', 'screen'].includes(scene.source.kind)
  const surface = bottom ? { ink: theme === 'dark' ? '#fff' : '#000', light: 0, dark: 0 } : settleCaptionAppearance(ctx, sampleCaptionAppearance(ctx, frame, theme === 'dark' ? '#fff' : ink), scene.startMs + localMs, reduced)
  drawAdaptiveCaptionTint(ctx, frame, 'light', surface.light)
  drawAdaptiveCaptionTint(ctx, frame, 'dark', surface.dark)
  drawLyricsCaption(ctx, scene, localMs, reduced, surface.ink, handoff)
  if (scene.subtitle && !/^mogging\.com$/i.test(scene.subtitle.trim())) {
    ctx.save(); ctx.font = `500 32px ${font}`; ctx.fillStyle = theme === 'dark' ? darkVideoColor(accent) : accent; ctx.textAlign = 'left'
    ctx.fillText(scene.subtitle, 90, scene.source.kind === 'title' ? 1770 : captionDesign.top - 100); ctx.restore()
  }
  ctx.restore()
}

function drawDecoration(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, scene: VideoScene, track: MotionTrack, localMs: number, accent: string, reduced: boolean) {
  const p = progress(track, localMs, reduced)
  const sample = sampleMotionPrimitive(track.primitive, p, track.intensity)
  const x = track.anchor.x * W, y = track.anchor.y * H
  ctx.save(); ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 6; ctx.lineCap = 'round'
  switch (track.primitive) {
    case 'cursor-tap': case 'cursor-drag': case 'cursor-swipe': {
      if (localMs > track.startMs + track.durationMs) break
      const from = track.from ?? track.anchor
      const to = track.to ?? { x: Math.min(.95, from.x + (track.primitive === 'cursor-drag' ? .24 : 0)), y: Math.max(.05, from.y - (track.primitive === 'cursor-swipe' ? .28 : 0)) }
      const px = (from.x + (to.x - from.x) * sample.reveal) * W
      const py = (from.y + (to.y - from.y) * sample.reveal) * H
      ctx.globalAlpha = sample.opacity
      ctx.beginPath(); ctx.arc(px, py, 30 * sample.scale, 0, Math.PI * 2); ctx.fillStyle = '#ffffffb0'; ctx.fill(); ctx.strokeStyle = '#0008'; ctx.lineWidth = 2; ctx.stroke()
      if (track.primitive === 'cursor-tap') { ctx.beginPath(); ctx.arc(px, py, 30 + p * 80, 0, Math.PI * 2); ctx.globalAlpha = 1 - p; ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.stroke() }
      break
    }
    case 'cursor-circle': ctx.beginPath(); ctx.ellipse(x, y, 160 * track.intensity, 75 * track.intensity, -.12, -.8, -.8 + Math.PI * 2 * sample.reveal); ctx.strokeStyle = '#fa6262'; ctx.stroke(); break
    case 'letterbox': ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 130 * sample.reveal); ctx.fillRect(0, H - 130 * sample.reveal, W, 130 * sample.reveal); break
    case 'cyan-glow': { ctx.globalAlpha *= sample.glow * track.intensity; const gradient = ctx.createRadialGradient(x, y, 0, x, y, W * .6); gradient.addColorStop(0, `${accent}22`); gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H); break }
    case 'scanline': if (p < 1 && !reduced) { ctx.shadowBlur = 24; ctx.shadowColor = accent; ctx.fillRect(70, 200 + p * 1250, 940, 4); const g = ctx.createLinearGradient(0, 100 + p * 1250, 0, 200 + p * 1250); g.addColorStop(0, 'transparent'); g.addColorStop(1, `${accent}44`); ctx.fillStyle = g; ctx.fillRect(70, 100 + p * 1250, 940, 100) } break
    case 'privacy-bar': ctx.shadowColor = accent; ctx.shadowBlur = 15; ctx.fillRect(x - 230 * sample.reveal, y - 28, 460 * sample.reveal, 56); break
    case 'freeze-frame': ctx.globalAlpha = .1 * sample.phase; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); break
    case 'split-screen': {
      const image = prepared.scenes.get(scene.id)?.secondary ?? prepared.scenes.get(scene.id)?.image
      if (image) { ctx.beginPath(); ctx.rect(W * (1 - sample.reveal * .5), 0, W * .5, H); ctx.clip(); cover(ctx, image, { x: W / 2, y: 0, width: W / 2, height: H }); ctx.fillStyle = '#090a0d88'; ctx.fillRect(W / 2, H - 250, W / 2, 250); ctx.fillStyle = accent; ctx.font = `600 42px ${font}`; ctx.fillText('FEATURE VIEW', W / 2 + 35, H - 160) }
      break
    }
    case 'parallax-separate': { const image = prepared.scenes.get(scene.id)?.image; if (image) { ctx.globalAlpha = .18; ctx.translate(sample.x * 10, sample.y * 10); cover(ctx, image, { x: 0, y: H * .25, width: W, height: H * .45 }) } break }
    case 'metric-bar-fill': ctx.fillStyle = '#ffffff22'; ctx.fillRect(100, 1660, 880, 12); ctx.fillStyle = accent; ctx.fillRect(100, 1660, 880 * scene.source.metricScore / 10 * sample.reveal, 12); break
    case 'shimmer-pass': { if (p < 1) { const sx = -400 + p * 1800; const gradient = ctx.createLinearGradient(sx, 0, sx + 250, 0); gradient.addColorStop(0, 'transparent'); gradient.addColorStop(.5, '#ffffff36'); gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H) } break }
  }
  ctx.restore()
}

export async function exportCompositionMp4(prepared: PreparedVideo, onProgress?: (progress: number) => void, signal?: AbortSignal, audio?: AudioBuffer) {
  const { encodeCanvasMp4 } = await import('./export-slides')
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  return encodeCanvasMp4(canvas, time => drawVideoFrame(ctx, prepared, time, canvas.width, canvas.height), prepared.composition.durationMs, onProgress, signal, audio)
}

export function portraitPrintSweepEdge(width:number,height:number,p:number) {
  const margin=width*.07, edge=-margin+(width+margin*2)*Math.max(0,Math.min(1,p))
  return Array.from({length:49},(_,i)=>{const y=i/48*height;return{x:edge+Math.sin(i/48*Math.PI)*width*.035+Math.sin(i*2.4)*width*.0025,y}})
}
export function drawPortraitPrintSweep(ctx:CanvasRenderingContext2D,from:HTMLCanvasElement|HTMLImageElement,to:HTMLCanvasElement|HTMLImageElement,width:number,height:number,p:number) {
  if(p>=1){ctx.drawImage(to,0,0,width,height);return}
  ctx.drawImage(from,0,0,width,height);if(p<=0)return
  ctx.save();ctx.beginPath();ctx.moveTo(0,0)
  for(const point of portraitPrintSweepEdge(width,height,p))ctx.lineTo(point.x,point.y)
  ctx.lineTo(0,height);ctx.closePath();ctx.clip();ctx.drawImage(to,0,0,width,height);ctx.restore()
}
