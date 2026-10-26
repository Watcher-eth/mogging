import type { NumberPort, NumberSink } from './rolling-number'
import { drawMorphOverlay, focusMeasurement } from './overlay-morph'
import { drawReportComponent } from './mock-report'
import { loadMockReportSymbols, mockReportHeroHeight, mockReportScrollMax, mockReportSize, mockReportRegions } from './mock-report'
import { createReportOverlay, drawReportOverlay, type ReportOverlay } from './report-overlay'
import { buildMockOverallCategory } from './mock-report-data'
import { loadShareFont } from './legacy-posters'
import type { ContentSlide, GeneratorImage } from './content-generator'
import { primitiveProgress, sampleMotionPrimitive, primitiveDefinition, type MotionSample } from './motion-primitives'
import { activeScene, parseComposition, videoStyles, type MotionTrack, type VideoComposition, type VideoScene } from './video-composition'
import { drawAppReport, drawFeatureMetric, reportMotion, reportEntryTimes, featureComponent, reportRegion, type AppReportAsset } from './report-choreography'
import { appReportFrame, hasCaption, sceneFrame, featureStageLayout, elementEntrance, smoothMotion, subjectAboveComponent, type VideoFrame } from './video-layout'
import { preparePortrait } from './video-portrait'

const W = 1080, H = 1920
const font = '"Mogging Share", Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

type SceneAsset = AppReportAsset & { secondary: HTMLImageElement | null; portrait: HTMLCanvasElement | null; holdPortrait: boolean }
export type PreparedVideo = {
  composition: VideoComposition
  scenes: Map<string, SceneAsset>
  incoming: HTMLCanvasElement
  outgoing: HTMLCanvasElement
  reportCanvas: HTMLCanvasElement
}

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  return canvas
}

export async function prepareVideo(compositionValue: VideoComposition, images: GeneratorImage[]): Promise<PreparedVideo> {
  const composition = parseComposition(compositionValue)
  await Promise.all([document.fonts.ready, loadShareFont().then(() => document.fonts.load('500 64px "Mogging Share"')), loadMockReportSymbols()])
  const requiredIds = new Set(composition.scenes.flatMap(scene => [scene.source.imageId, scene.source.secondaryImageId]).filter((id): id is string => Boolean(id)))
  const decoded = new Map<string, HTMLImageElement>()
  await Promise.all([...requiredIds].map(async id => {
    const source = images.find(image => image.id === id)
    if (!source) throw new Error('A video photo or app screen is missing. Add it again or rebuild the video.')
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not load ${source.name}`)); image.src = source.dataUrl })
    decoded.set(source.id, image)
  }))
  const scenes = new Map<string, SceneAsset>()
  const measurement = document.createElement('canvas').getContext('2d')!
  let priorScroll = 0, priorCategory = ''
  let priorFrame: VideoFrame | undefined
  let previousScene: VideoScene | undefined
  for (const scene of composition.scenes) {
    const source = images.find(image => image.id === scene.source.imageId)
    const slide: ContentSlide = {
      id: scene.id, templateId: 'mock-report', imageId: scene.source.imageId, categoryId: scene.source.categoryId,
      eyebrow: '', headline: scene.text, supportingCopy: '', metricLabel: scene.source.report?.title ?? scene.source.categoryId,
      metricValue: `${scene.source.metricScore.toFixed(1)} / 10`, cta: '', currentScore: scene.source.currentScore.toFixed(1), potentialScore: scene.source.potentialScore.toFixed(1),
      categoryScores: [{ categoryId: scene.source.categoryId, label: scene.source.report?.title ?? scene.source.categoryId, value: scene.source.metricScore.toFixed(1) }],
      overlayStyle: scene.source.overlay === 'face-map' ? 'face-map' : 'category',
      mockReport: { category: scene.source.report ? { ...scene.source.report, score: scene.source.metricScore, features: scene.source.report.features.map(feature => ({ ...feature })) } : buildMockOverallCategory(String(scene.source.currentScore), {}), scroll: 0 },
    }
    const portrait = source && !['report', 'screen'].includes(scene.source.kind) ? await preparePortrait(decoded.get(source.id)!, source) : null
    const viewport = portrait ? { width: portrait.canvas.width, height: portrait.canvas.height } : { width: mockReportSize.width, height: mockReportHeroHeight }
    let overlay: ReportOverlay | null = source && (Boolean(portrait) || scene.source.overlay !== 'none' || scene.source.kind === 'report') ? createReportOverlay(slide, portrait?.source ?? source, viewport) : null
    if (overlay && portrait && scene.focus.startsWith('feature:')) {
      const feature = slide.mockReport!.category.features.find((item, index) => `feature:${item.id ?? index}` === scene.focus)
      overlay = focusMeasurement(overlay, `${scene.focus} ${feature?.label ?? ''}`.toLowerCase())
    }
    if (overlay) { overlay.ink = '255,255,255'; overlay.pointAppearance = 'minimal'; overlay.labelAppearance = 'scan'; overlay.labelScale = .85 }
    if (!source && scene.source.kind !== 'title') throw new Error(`Choose a source photo or app screen for ${scene.label}.`)
    const asset: SceneAsset = { image: source ? decoded.get(source.id) ?? null : null, secondary: scene.source.secondaryImageId ? decoded.get(scene.source.secondaryImageId) ?? null : null, portrait: portrait?.canvas ?? null, holdPortrait: Boolean(previousScene && !['report', 'screen'].includes(previousScene.source.kind) && previousScene.source.imageId === scene.source.imageId), overlay, slide, scrollMax: mockReportScrollMax(slide.mockReport!.category), regions: mockReportRegions(measurement, slide.mockReport!.category), initialScroll: scene.source.categoryId === priorCategory ? priorScroll : 0, initialFrame: priorFrame, continuousReport: previousScene?.source.kind === 'report' && previousScene.source.categoryId === scene.source.categoryId }
    if (scene.source.kind === 'report') { asset.entryTimes = reportEntryTimes(scene, asset); priorScroll = reportMotion(scene, asset, scene.durationMs).scroll; priorCategory = scene.source.categoryId } else priorCategory = ''
    priorFrame = appReportFrame(scene.framing)
    scenes.set(scene.id, asset)
    previousScene = scene
  }
  return { composition, scenes, incoming: surface(), outgoing: surface(), reportCanvas: surface() }
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

export function drawVideoFrame(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, timeMs: number, width: number, height: number, reducedMotion = false, numbers?: NumberSink) {
  const ports: NumberPort[] = []
  const collect: NumberSink | undefined = numbers ? port => { ports.push(port); return true } : undefined
  const { composition } = prepared
  const time = Math.max(0, Math.min(composition.durationMs - .001, timeMs))
  const scene = activeScene(composition, time)
  const index = composition.scenes.indexOf(scene)
  const localMs = time - scene.startMs
  const incoming = prepared.incoming.getContext('2d')!
  const transition = scene.tracks.find(track => track.target === 'content' && primitiveDefinition(track.primitive).category === 'transition' && localMs >= track.startMs && localMs < track.startMs + track.durationMs)
  const previous = composition.scenes[index - 1]
  const shared = !reducedMotion && transition?.primitive === 'cinematic-flow' && previous && previous.source.imageId === scene.source.imageId && (hasCaption(previous) || hasCaption(scene)) && (prepared.scenes.get(previous.id)?.portrait || prepared.scenes.get(scene.id)?.portrait)
  if (shared) drawSharedElements(incoming, prepared, previous, scene, progress(transition!, localMs, false), localMs, collect)
  else renderScene(incoming, prepared, scene, localMs, reducedMotion, !transition || transition.primitive === 'hard-cut' || reducedMotion ? collect : undefined)
  ctx.save()
  const scale = Math.min(width / W, height / H)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
  ctx.setTransform(scale, 0, 0, scale, (width - W * scale) / 2, (height - H * scale) / 2)
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip()
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  if (shared || !transition || index === 0 || reducedMotion || transition.primitive === 'hard-cut') ctx.drawImage(prepared.incoming, 0, 0)
  else {
    renderScene(prepared.outgoing.getContext('2d')!, prepared, previous, previous.durationMs - 1, reducedMotion)
    drawTransition(ctx, prepared.outgoing, prepared.incoming, transition, progress(transition, localMs, false))
  }
  ctx.restore()
  for (const port of ports) numbers?.(port)
}

const mixRect = (a: VideoFrame, b: VideoFrame, p: number): VideoFrame => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, width: a.width + (b.width - a.width) * p, height: a.height + (b.height - a.height) * p })
function drawSharedElements(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, previous: VideoScene, next: VideoScene, progress: number, localMs: number, numbers?: NumberSink) {
  const a = prepared.scenes.get(previous.id)!, b = prepared.scenes.get(next.id)!, p = smoothMotion(progress)
  const appScene = previous.source.kind === 'report' ? previous : next.source.kind === 'report' ? next : null
  const stageScene = previous.source.kind === 'report' ? next : previous
  const stageAsset = prepared.scenes.get(stageScene.id)!
  const appAsset = appScene ? prepared.scenes.get(appScene.id)! : null
  const stage = featureComponent(stageAsset, stageScene)
  const leavingApp = previous.source.kind === 'report'
  const stageAmount = appScene ? leavingApp ? p : 1 - p : 1
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  let metricFrame = stage.frame
  const faceFrame = featureStageLayout(stage.region).face
  let subjectFrame = faceFrame
  let subjectOpacity = 1
  let headlineAmount = stageAmount
  if (appScene && appAsset) {
    const appTime = leavingApp ? appScene.durationMs - 1 : 0
    const motion = reportMotion(appScene, appAsset, appTime)
    const native = reportRegion(appAsset.regions, stage.region.id)
    const origin = { x: native.x / 390 * W, y: (native.y - motion.scroll) / 390 * W, width: native.width / 390 * W, height: native.height / 390 * W }
    // Clear surrounding app furniture before the selected element travels.
    // An offscreen hero must never fly back in as a cropped neck over the UI.
    const travel = elementEntrance(stageAmount, .18, .82)
    const background = 1 - elementEntrance(stageAmount, 0, .32)
    metricFrame = mixRect(origin, stage.frame, travel)
    subjectFrame = mixRect({ ...faceFrame, y: faceFrame.y + 48 }, faceFrame, travel)
    // The portrait grows into the space released by the moving component.
    // Its silhouette never sits underneath a card travelling down the canvas.
    subjectFrame = subjectAboveComponent(subjectFrame, metricFrame)
    subjectOpacity = elementEntrance(stageAmount, .32, .68)
    headlineAmount = elementEntrance(stageAmount, .32, .68)
    ctx.save(); ctx.globalAlpha = background
    if (background > .001) drawAppReport(ctx, prepared.reportCanvas, { ...appAsset, overlay: null }, appScene, appTime, '#00a8ef', true, drawReportOverlay, undefined, new Set([stage.region.id]))
    ctx.restore()
  }
  const portrait = stageAsset.portrait ?? a.portrait ?? b.portrait
  if (portrait && subjectFrame.height > 1) {
    ctx.save(); ctx.globalAlpha *= subjectOpacity; ctx.beginPath(); ctx.rect(subjectFrame.x, Math.max(0, subjectFrame.y), subjectFrame.width, subjectFrame.height); ctx.clip()
    const fit = Math.min(subjectFrame.width / portrait.width, subjectFrame.height / portrait.height)
    const width = portrait.width * fit, height = portrait.height * fit
    ctx.translate(subjectFrame.x + (subjectFrame.width - width) / 2, subjectFrame.y + (subjectFrame.height - height) / 2)
    ctx.drawImage(portrait, 0, 0, width, height)
    const visibleOverlay = (asset: SceneAsset, scene: VideoScene) => asset.overlay && scene.source.overlay === 'none' ? { ...asset.overlay, primitives: [], dots: [] } : asset.overlay
    const sourceOverlay = a.portrait ? visibleOverlay(a, previous) : visibleOverlay(stageAsset, stageScene)
    const targetOverlay = b.portrait ? visibleOverlay(b, next) : visibleOverlay(stageAsset, stageScene)
    if (sourceOverlay && targetOverlay) drawMorphOverlay(ctx, sourceOverlay, targetOverlay, width, p, next.startMs + localMs)
    ctx.restore()
  }
  if (appScene) {
    drawReportComponent(ctx, stage.slide, stage.region, metricFrame, 1, numbers)
  } else {
    const from = featureComponent(a, previous), to = featureComponent(b, next)
    const frame = mixRect(from.frame, to.frame, p)
    // One shell changes contents at its motion's midpoint. Never two cards.
    const story = p < .5 ? from : to
    const turn = Math.sin(Math.PI * p)
    ctx.save(); ctx.globalAlpha = 1 - turn * .82
    ctx.translate(0, (p < .5 ? -1 : 1) * turn * 22)
    drawReportComponent(ctx, story.slide, story.region, frame, p < .5 ? 1 : elementEntrance(p, .5, .5), numbers)
    ctx.restore()
  }
  const headlineScene = appScene ? stageScene : p < .5 ? previous : next
  const headlineOpacity = appScene ? headlineAmount : 1 - Math.sin(Math.PI * p)
  ctx.save(); ctx.globalAlpha = headlineOpacity
  // Layout follows the same handoff; no full-frame headline crossfade.
  drawText(ctx, headlineScene, appScene ? 4000 : p < .5 ? previous.durationMs : 4000, '#00a8ef', true)
  ctx.restore(); ctx.restore()
}

function drawTransition(ctx: CanvasRenderingContext2D, previous: HTMLCanvasElement, next: HTMLCanvasElement, track: MotionTrack, p: number) {
  const sample = sampleMotionPrimitive(track.primitive, p, track.intensity)
  ctx.drawImage(previous, 0, 0)
  ctx.save()
  switch (track.primitive) {
    case 'cinematic-flow': {
      const ease = smoothMotion(p)
      ctx.drawImage(p < .5 ? previous : next, 0, 0)
      const x = -W + 2 * W * ease
      const feather = 48 * Math.sin(Math.PI * p)
      const paper = ctx.createLinearGradient(x - feather, 0, x + W + feather, 0)
      paper.addColorStop(0, '#fff0'); paper.addColorStop(feather / (W + 2 * feather), '#fff')
      paper.addColorStop((W + feather) / (W + 2 * feather), '#fff'); paper.addColorStop(1, '#fff0')
      ctx.fillStyle = paper; ctx.fillRect(x - feather, 0, W + 2 * feather, H); break
    }
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

function renderScene(ctx: CanvasRenderingContext2D, prepared: PreparedVideo, scene: VideoScene, localMs: number, reduced: boolean, numbers?: NumberSink) {
  const freeze = scene.tracks.find(track => track.primitive === 'freeze-frame')
  if (freeze && localMs >= freeze.startMs) localMs = Math.min(localMs, freeze.startMs + 200)
  const asset = prepared.scenes.get(scene.id)!
  const accent = videoStyles[prepared.composition.style].accent
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  ctx.save()
  applyTracks(ctx, scene.tracks.filter(track => track.target === 'content' && primitiveDefinition(track.primitive).category !== 'transition'), localMs, reduced)
  ctx.save()
  const frame = sceneFrame(scene, localMs, asset.initialFrame, reduced)
  if (scene.source.kind === 'report') {
    drawAppReport(ctx, prepared.reportCanvas, { ...asset, overlay: scene.source.overlay === 'none' ? null : asset.overlay }, scene, localMs, accent, reduced, (overlayCtx, overlay, width) => {
      overlayCtx.save(); overlayCtx.scale(width / W, width / W)
      paintFaceOverlay(overlayCtx, overlay, scene, localMs, reduced)
      overlayCtx.restore()
    }, numbers)
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
    const portraitFrame = featureStageLayout({ width: 354, height: 145 }).face
    ctx.save(); ctx.beginPath(); ctx.rect(portraitFrame.x, portraitFrame.y, portraitFrame.width, portraitFrame.height); ctx.clip()
    const stageScale = portraitFrame.width / W, stageHeight = portraitFrame.height / stageScale
    ctx.translate(portraitFrame.x, portraitFrame.y); ctx.scale(stageScale, stageScale)
    applyTracks(ctx, scene.tracks.filter(track => track.target === 'camera' && !['report-scroll', 'layout-scale'].includes(track.primitive)), localMs, reduced)
    if (asset.portrait) {
      // Contain the silhouette, then use that exact transform for landmarks.
      const fit = Math.min(W / asset.portrait.width, stageHeight / asset.portrait.height)
      const width = asset.portrait.width * fit, height = asset.portrait.height * fit
      const x = (W - width) / 2, y = (stageHeight - height) / 2
      const reveal = reduced || asset.holdPortrait ? 1 : elementEntrance(localMs, 100, 750)
      ctx.globalAlpha *= reveal; ctx.translate(0, (1 - reveal) * 26)
      ctx.drawImage(asset.portrait, x, y, width, height)
      ctx.translate(x, y)
      if (asset.overlay && scene.source.overlay !== 'none') drawMorphOverlay(ctx, asset.overlay, asset.overlay, width, 1, scene.startMs + localMs, reduced)
    }
    ctx.restore()
    drawFeatureMetric(ctx, prepared.reportCanvas, asset, scene, localMs, reduced, numbers)
  }
  ctx.restore()
  for (const track of scene.tracks) {
    if (localMs < track.startMs) continue
    if (track.target === 'decoration' || track.primitive === 'metric-bar-fill' || track.primitive === 'shimmer-pass') drawDecoration(ctx, prepared, scene, track, localMs, accent, reduced)
  }
  ctx.restore()
  ctx.restore()
  if (hasCaption(scene)) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 300)
    drawText(ctx, scene, localMs, accent, reduced)
    ctx.restore()
  }
}

function paintFaceOverlay(ctx: CanvasRenderingContext2D, overlay: ReportOverlay, scene: VideoScene, localMs: number, reduced: boolean, width = W) {
  const tracks = scene.tracks.filter(track => track.target === 'overlay')
  applyTracks(ctx, tracks.filter(track => primitiveDefinition(track.primitive).category !== 'overlay' && track.primitive !== 'line-draw'), localMs, reduced)
  const traces = tracks.filter(track => ['line-draw', 'landmark-stagger', 'contour-trace'].includes(track.primitive))
  const trace = traces.filter(track => localMs >= track.startMs).at(-1) ?? traces[0]
  drawReportOverlay(ctx, overlay, width, reduced ? 4000 : trace ? progress(trace, localMs, false) * 4000 : localMs, scene.source.kind === 'report')
}

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }) {
  const scale = Math.max(rect.width / image.width, rect.height / image.height)
  ctx.drawImage(image, rect.x + (rect.width - image.width * scale) / 2, rect.y + (rect.height - image.height * scale) / 2, image.width * scale, image.height * scale)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []; let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function drawText(ctx: CanvasRenderingContext2D, scene: VideoScene, localMs: number, accent: string, reduced: boolean) {
  const textTracks = scene.tracks.filter(track => track.target === 'text')
  const builds = textTracks.filter(track => ['type-on', 'word-build'].includes(track.primitive))
  const build = builds.filter(track => localMs >= track.startMs).at(-1) ?? builds[0]
  let text = scene.text
  if (build && !reduced) {
    const handoff = scene.tracks.find(track => track.primitive === 'cinematic-flow' && track.target === 'content')
    const p = handoff && localMs >= handoff.startMs + handoff.durationMs ? 1 : primitiveProgress(localMs, build.startMs, build.durationMs)
    if (build.primitive === 'type-on') text = Array.from(text).slice(0, Math.floor(Array.from(text).length * p)).join('')
    else { const words = text.split(/\s+/); text = words.slice(0, Math.ceil(words.length * p)).join(' ') }
  }
  const count = textTracks.find(track => track.primitive === 'score-count')
  if (count) text = text.replace(/\d+(?:\.\d+)?/, value => (Number(value) * sampleMotionPrimitive('score-count', progress(count, localMs, reduced)).reveal).toFixed(1))
  ctx.save()
  applyTracks(ctx, textTracks.filter(track => !['type-on', 'word-build', 'score-count', 'cursor-blink', 'underline-draw', 'tracking-expand'].includes(track.primitive)), localMs, reduced)
  const glow = scene.tracks.find(track => track.primitive === 'cyan-glow')
  ctx.fillStyle = '#000'
  ctx.shadowColor = accent; ctx.shadowBlur = glow ? 10 * sampleMotionPrimitive('cyan-glow', progress(glow, localMs, reduced)).glow * glow.intensity : 0; ctx.shadowOffsetY = 0
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  let size = 64
  ctx.font = `500 ${size}px ${font}`
  while (wrap(ctx, scene.text, 920).length > 2 && size > 35) ctx.font = `500 ${--size}px ${font}`
  // Lay out the complete caption once: typing must not move earlier words.
  const fullLines = wrap(ctx, scene.text, 870)
  let remaining = text.length
  const lines = fullLines.map(line => { const visible = line.slice(0, Math.max(0, remaining)); remaining -= line.length + 1; return visible })
  const startY = 160
  const intro = reduced ? 1 : sampleMotionPrimitive('rise-in', Math.min(1, localMs / 550), .12).opacity
  ctx.save(); ctx.globalAlpha *= intro
  ctx.font = `500 19px ${font}`; ctx.fillStyle = '#737373'; ctx.letterSpacing = '2px'
  ctx.fillText(scene.source.kind === 'title' ? 'YOUR NEXT STEP' : `${scene.source.report?.title ?? 'YOUR FEATURES'} / MOGGING`.toUpperCase(), W / 2, 82)
  ctx.restore(); ctx.font = `500 ${size}px ${font}`; ctx.fillStyle = '#000'
  const spacing = textTracks.find(track => track.primitive === 'tracking-expand')
  if (spacing) ctx.letterSpacing = `${4 * progress(spacing, localMs, reduced)}px`
  lines.forEach((line, index) => ctx.fillText(line, W / 2 - (ctx.measureText(fullLines[index]).width - ctx.measureText(line).width) / 2, startY + index * size * 1.15))
  const blink = textTracks.find(track => track.primitive === 'cursor-blink')
  if ((build?.primitive === 'type-on' && localMs < build.startMs + build.durationMs || blink) && !reduced && Math.floor(localMs / 480) % 2 === 0 && text.length) {
    const lastIndex = lines.findLastIndex(line => Boolean(line)), lastLine = lines[lastIndex]
    ctx.fillRect(W / 2 - ctx.measureText(fullLines[lastIndex]).width / 2 + ctx.measureText(lastLine).width + 9, startY + lastIndex * size * 1.15 - size * .8, 5, size * .9)
  }
  const underline = textTracks.find(track => track.primitive === 'underline-draw')
  if (underline) { ctx.fillRect(150, startY + lines.length * size * 1.15, 780 * progress(underline, localMs, reduced), 5) }
  // A small rule anchors the headline to the centered visual without a box.
  ctx.save(); ctx.globalAlpha *= intro; ctx.fillStyle = '#161616'
  ctx.fillRect(518, 285, 44 * intro, 2); ctx.restore()
  if (scene.subtitle) { ctx.shadowBlur = 0; ctx.font = `500 32px ${font}`; ctx.fillStyle = accent; ctx.fillText(scene.subtitle, W / 2, scene.source.kind === 'title' ? 1870 : 285) }
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

export async function exportCompositionMp4(prepared: PreparedVideo, onProgress?: (progress: number) => void, signal?: AbortSignal) {
  const { encodeCanvasMp4 } = await import('./export-slides')
  const canvas = surface()
  const ctx = canvas.getContext('2d', { alpha: false })!
  return encodeCanvasMp4(canvas, time => drawVideoFrame(ctx, prepared, time, W, H), prepared.composition.durationMs, onProgress, signal)
}
