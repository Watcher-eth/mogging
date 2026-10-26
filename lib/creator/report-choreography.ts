import type { NumberSink } from './rolling-number'
import { drawMockReport, drawReportComponent, mockReportSize, mockReportRegions, type ReportRegion } from './mock-report'
import type { ContentSlide } from './content-generator'
import type { ReportOverlay } from './report-overlay'
import { primitiveProgress, sampleMotionPrimitive } from './motion-primitives'
import type { VideoScene } from './video-composition'
import { sceneFrame, featureStageLayout, elementEntrance, type VideoFrame } from './video-layout'
export { appReportFrame } from './video-layout'

export type AppReportAsset = { image: HTMLImageElement | null; overlay: ReportOverlay | null; slide: ContentSlide; regions: ReportRegion[]; scrollMax: number; initialScroll: number; initialFrame?: VideoFrame; entryTimes?: Record<string, number>; continuousReport?: boolean }

export function reportEntryTimes(scene: VideoScene, asset: AppReportAsset) {
  const start = reportMotion(scene, asset, 0), end = reportMotion(scene, asset, scene.durationMs)
  return Object.fromEntries(asset.regions.map((region, index) => {
    const visible = (time: number) => region.y - reportMotion(scene, asset, time).scroll < start.viewportHeight - 84
    if (visible(0)) return [region.id, asset.continuousReport ? -1000 : index % 4 * 35]
    if (region.y - end.scroll >= start.viewportHeight - 84) return [region.id, scene.durationMs + 1000]
    let low = 0, high = scene.durationMs
    for (let step = 0; step < 16; step++) { const mid = (low + high) / 2; if (visible(mid)) high = mid; else low = mid }
    return [region.id, high + index % 2 * 45]
  }))
}

/** Resolve a semantic component, then render it directly at its stage bounds. */
export function featureComponent(asset: AppReportAsset, scene: VideoScene) {
  const original = asset.slide.mockReport!.category
  const selected = scene.focus.startsWith('feature:') ? original.features.find((feature, index) => `feature:${feature.id ?? index}` === scene.focus) : scene.focus === 'features' ? original.features.find(feature => feature.visual && feature.visual !== 'Text') ?? original.features[0] : undefined
  const category = selected ? { ...original, features: [selected] } : original
  // Editorial cards reflow to the full native row; their data and painter stay identical.
  const region = selected
    ? { id: `feature:${selected.id ?? 0}`, label: selected.label, x: 0, y: 0, width: 354, height: selected.visual === 'Orbit' ? 176 : selected.visual !== 'Text' ? 145 : 138 }
    : reportRegion(asset.regions, scene.focus === 'hero' || scene.focus === 'features' ? 'scores' : scene.focus)
  return { region, slide: { ...asset.slide, mockReport: { category, scroll: 0 } }, frame: featureStageLayout(region).metric }
}
export function drawFeatureMetric(ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement, asset: AppReportAsset, scene: VideoScene, localMs: number, reduced: boolean, numbers?: NumberSink, frame?: VideoFrame) {
  const component = featureComponent(asset, scene)
  const entry = scene.tracks.find(track => track.primitive === 'component-focus')
  const start = entry?.startMs ?? 200
  const shared = scene.tracks.some(track => track.target === 'content' && track.primitive === 'cinematic-flow')
  const amount = reduced || shared ? 1 : elementEntrance(localMs, start, entry?.durationMs ?? 650)
  const meter = reduced || shared ? 1 : elementEntrance(localMs, start + 140, (entry?.durationMs ?? 650) + 400)
  const rect = frame ?? component.frame
  ctx.save(); ctx.globalAlpha *= amount
  ctx.translate(0, (1 - amount) * 36)
  drawReportComponent(ctx, component.slide, component.region, rect, meter, numbers)
  ctx.restore()
  for (const track of scene.tracks.filter(track => track.primitive === 'gradient-outline' && localMs >= track.startMs && localMs <= track.startMs + track.durationMs)) {
    const p = reduced ? .5 : primitiveProgress(localMs, track.startMs, track.durationMs)
    gradientBorder(ctx, rect, '#00a8ef', p, sampleMotionPrimitive('gradient-outline', p).reveal * amount * track.intensity)
  }
}

export function componentFrame(region: ReportRegion): VideoFrame {
  return featureStageLayout(region).metric
}
export function expandInPlace(rect: VideoFrame, frame: VideoFrame, amount: number, intensity: number): VideoFrame {
  const scale = 1 + Math.min(.24 * intensity, Math.max(0, frame.width * .98 / rect.width - 1)) * amount
  return { x: rect.x - rect.width * (scale - 1) / 2, y: rect.y - rect.height * (scale - 1) / 2, width: rect.width * scale, height: rect.height * scale }
}

export function reportRegion(regions: ReportRegion[], id: string) {
  return regions.find(region => region.id === id) ?? regions.find(region => region.id === 'features') ?? regions[0]
}

export function sectionScroll(region: ReportRegion, viewportHeight: number, max: number) {
  if (region.id === 'hero') return 0
  const desiredTop = region.height < 200 ? Math.max(120, (viewportHeight - Math.min(region.height, 300)) / 2 - 35) : 125
  return Math.max(0, Math.min(max, region.y - desiredTop))
}

export function reportMotion(scene: VideoScene, asset: AppReportAsset, localMs: number, reduced = false) {
  const frame = sceneFrame(scene, localMs, asset.initialFrame, reduced)
  const viewportHeight = frame.height / frame.width * 390
  const max = Math.max(0, asset.scrollMax + mockReportSize.height - viewportHeight)
  const scrollTracks = scene.tracks.filter(track => ['report-scroll', 'scroll-to-section'].includes(track.primitive))
  const scrollTrack = scrollTracks.filter(track => localMs >= track.startMs).at(-1)
  const region = reportRegion(asset.regions, scrollTrack?.section ?? scene.focus)
  const from = scrollTrack?.fromScroll ?? asset.initialScroll
  const to = scrollTrack?.toScroll ?? (scrollTrack?.primitive === 'report-scroll' ? max * Math.min(1, scrollTrack.intensity) : sectionScroll(region, viewportHeight, max))
  const p = reduced ? 1 : scrollTrack ? primitiveProgress(localMs, scrollTrack.startMs, scrollTrack.durationMs) : scrollTracks.length ? 0 : 1
  const ease = sampleMotionPrimitive('scroll-to-section', p).reveal
  return { frame, viewportHeight, scroll: Math.max(0, Math.min(max, from + (to - from) * ease)) }
}

export function drawAppReport(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, asset: AppReportAsset, scene: VideoScene, localMs: number, accent: string, reduced: boolean, paintOverlay: typeof import('./report-overlay').drawReportOverlay, numbers?: NumberSink, omit?: Set<string>) {
  const { frame, viewportHeight, scroll } = reportMotion(scene, asset, localMs, reduced)
  const nativeRect = (region: ReportRegion): VideoFrame => ({ x: frame.x + region.x / 390 * frame.width, y: frame.y + (region.y - scroll) / 390 * frame.width, width: region.width / 390 * frame.width, height: region.height / 390 * frame.width })
  const active = scene.tracks.filter(track => track.target === 'report' && localMs >= track.startMs && localMs <= track.startMs + track.durationMs)
  const expansions = active.filter(track => track.primitive === 'section-expand').map(track => {
    const region = reportRegion(asset.regions, track.section ?? scene.focus), rect = nativeRect(region)
    const p = reduced ? .5 : primitiveProgress(localMs, track.startMs, track.durationMs)
    const amount = sampleMotionPrimitive(track.primitive, p, track.intensity).reveal
    return { region, rect, target: expandInPlace(rect, frame, amount, track.intensity), amount }
  }).filter(item => item.amount > 0)
  ctx.save(); ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.width, frame.height); ctx.clip()
  ctx.translate(frame.x, frame.y); ctx.scale(frame.width / 390, frame.width / 390)
  drawMockReport(ctx, { ...asset.slide, mockReport: { ...asset.slide.mockReport!, scroll } }, asset.image, asset.overlay, 390, viewportHeight, reduced ? 4000 : localMs, paintOverlay, {
    viewportHeight, numbers, omit, metricProgress: reduced || asset.continuousReport ? 1 : elementEntrance(localMs, 100, 1050),
    componentFrame: region => {
      const item = expansions.find(item => item.region.id === region.id)
      return item ? { x: (item.target.x - frame.x) * 390 / frame.width, y: (item.target.y - frame.y) * 390 / frame.width + scroll, width: item.target.width * 390 / frame.width, height: item.target.height * 390 / frame.width } : region
    },
    featureProgress: asset.entryTimes ? id => reduced ? 1 : elementEntrance(localMs, asset.entryTimes![id] ?? 0, 650) : undefined,
    growthProgress: asset.entryTimes ? reduced ? 1 : elementEntrance(localMs, asset.entryTimes.potential ?? 0, 800) : 1,
  })
  ctx.restore()
  for (const track of active.filter(track => ['gradient-outline', 'section-spotlight'].includes(track.primitive))) {
    const p = reduced ? .5 : primitiveProgress(localMs, track.startMs, track.durationMs)
    const amount = sampleMotionPrimitive(track.primitive, p, track.intensity).reveal
    const region = reportRegion(asset.regions, track.section ?? scene.focus)
    const visibleY = Math.max(region.y, scroll + 68), bottom = Math.min(region.y + region.height, scroll + viewportHeight - 84)
    if (bottom <= visibleY || amount <= 0) continue
    const rect = expansions.find(item => item.region.id === region.id)?.target ?? nativeRect(region)
    ctx.save()
    if (track.primitive === 'section-spotlight') {
      ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.width, frame.height); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip('evenodd')
      ctx.fillStyle = `rgba(255,255,255,${amount * .4})`; ctx.fillRect(frame.x, frame.y, frame.width, frame.height)
    } else gradientBorder(ctx, rect, accent, p, amount * track.intensity)
    ctx.restore()
  }
}

function gradientBorder(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, accent: string, phase: number, opacity: number) {
  ctx.save(); ctx.globalAlpha *= Math.min(1, opacity)
  const gradient = ctx.createLinearGradient(rect.x, rect.y + rect.height * phase, rect.x + rect.width, rect.y + rect.height * (1 - phase))
  gradient.addColorStop(0, accent); gradient.addColorStop(.45, '#a2e5f5'); gradient.addColorStop(1, '#64cda2')
  ctx.strokeStyle = gradient; ctx.lineWidth = 5; ctx.shadowColor = `${accent}38`; ctx.shadowBlur = 20
  ctx.beginPath(); ctx.roundRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, 28); ctx.stroke(); ctx.restore()
}
