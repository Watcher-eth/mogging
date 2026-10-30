import { isDarkVideoContext } from './video-theme'
import { paintCanvasNode, type CanvasPainter } from './canvas-layout'
import { drawMockReport, drawReportComponent, nativeMetricFeature, mockReportSize, mockReportRegions, type ReportRegion } from './mock-report'
import type { ContentSlide } from './content-generator'
import type { ReportOverlay } from './report-overlay'
import { primitiveProgress, sampleMotionPrimitive } from './motion-primitives'
import type { VideoScene } from './video-composition'
import { sceneFrame, elementEntrance, videoContent, type VideoFrame } from './video-layout'
import { actionMentionEnd, sceneSpeechWords } from './video-voiceover'
import { drawMetricTimeline, metricTimelineVariant } from './video-timeline'
import { drawRollingNumber, rollingNumberWidth } from './rolling-number'
export { appReportFrame } from './video-layout'

export type AppReportAsset = { image: HTMLImageElement | null; overlay: ReportOverlay | null; slide: ContentSlide; regions: ReportRegion[]; scrollMax: number; initialScroll: number; initialFrame?: VideoFrame; entryTimes?: Record<string, number>; continuousReport?: boolean; metricStartMs?: number; narratedMetrics?: boolean }

export function reportMetricCues(chapter: VideoScene[]) {
  const features = chapter.find(scene => scene.source.report)?.source.report?.features ?? []
  const normalize = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? ''
  const cues: Record<string, number> = {}
  const mentioned = new Set<string>()
  const spokenCues = new Set<string | number>()
  for (const scene of chapter) {
    const words = sceneSpeechWords(scene)
    for (const [index, feature] of features.entries()) {
      const id = `feature:${feature.id ?? index}`
      const phrase = normalize(feature.label)
      const mention = phrase ? words.findIndex((_, start) => {
        let spoken = ''
        for (let end = start; end < words.length && spoken.length <= phrase.length; end++) {
          spoken = normalize(words.slice(start, end + 1).map(word => word.text).join(' '))
          if (spoken === phrase) return true
        }
        return false
      }) : -1
      if (mention >= 0) { mentioned.add(id); spokenCues.add(scene.cueId ?? scene.id ?? scene.startMs) }
      if (cues[id] === undefined && (mention >= 0 || scene.focus === id)) cues[id] = scene.startMs + (words[Math.max(0, mention)]?.startMs ?? 0)
    }
  }
  const detailed = chapter.some(scene => scene.source.categoryId !== 'overall') && mentioned.size >= 2 && spokenCues.size >= 2
  return detailed ? cues : null
}

export function metricRevealState(localMs: number, startMs: number, reduced: boolean) {
  const elapsed = localMs - startMs
  return { content: elapsed < 0 ? 0 : reduced ? 1 : elementEntrance(elapsed, 0, 720), chart: elapsed < 0 ? 0 : reduced ? 1 : elementEntrance(elapsed, 140, 1100) }
}

function drawMetricPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, reduced: boolean) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, width, height, 18); ctx.clip()
  ctx.fillStyle = '#f6f7f8'; ctx.fillRect(0, 0, width, height)
  const phase = reduced ? 0 : time / 1600
  for (const [index, color] of ['#e0e8ed50', '#e8e5ed40', '#e3ebe750'].entries()) {
    const x = width * (.5 + .38 * Math.sin(phase + index * 2)), y = height * (.5 + .36 * Math.cos(phase * .7 + index * 2))
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .8)
    gradient.addColorStop(0, color); gradient.addColorStop(1, '#ffffff00')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }
  if (!reduced) {
    const x = ((time % 2600 + 2600) % 2600 / 2600 * 2 - .5) * width
    const shimmer = ctx.createLinearGradient(x - width * .5, 0, x + width * .5, height)
    shimmer.addColorStop(0, '#ffffff00'); shimmer.addColorStop(.5, isDarkVideoContext(ctx) ? '#60606080' : '#ffffff80'); shimmer.addColorStop(1, '#ffffff00')
    ctx.fillStyle = shimmer; ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}

export function reportEntryTimes(scene: VideoScene, asset: AppReportAsset) {
  const start = reportMotion(scene, asset, 0), end = reportMotion(scene, asset, scene.durationMs)
  return Object.fromEntries(asset.regions.map((region, index) => {
    const visible = (time: number) => region.y - reportMotion(scene, asset, time).scroll < start.viewportHeight - 30
    if (visible(0)) return [region.id, asset.continuousReport ? -1000 : index % 4 * 35]
    if (region.y - end.scroll >= start.viewportHeight - 30) return [region.id, scene.durationMs + 1000]
    let low = 0, high = scene.durationMs
    for (let step = 0; step < 16; step++) { const mid = (low + high) / 2; if (visible(mid)) high = mid; else low = mid }
    return [region.id, high + index % 2 * 45]
  }))
}

export function showsFeatureMetric(scene: VideoScene) {
  return scene.scoreCallouts === undefined && !['report', 'screen', 'explainer'].includes(scene.source.kind) && scene.source.overlay !== 'face-map' && !scene.photoStudy && !scene.study
    && (scene.source.kind === 'component' || /\b(score|rating|scale|slider|measurements?|out of ten)\b/i.test(scene.narration))
}

/** Resolve a semantic component, then render it directly at its stage bounds. */
export function featureComponent(asset: AppReportAsset, scene: VideoScene) {
  const original = asset.slide.mockReport!.category
  const selectedFeature = scene.focus.startsWith('feature:') ? original.features.find((feature, index) => `feature:${feature.id ?? index}` === scene.focus) : scene.focus === 'features' ? original.features.find(feature => feature.visual && feature.visual !== 'Text') ?? original.features[0] : undefined
  const selected = selectedFeature ? nativeMetricFeature(selectedFeature) : undefined
  const region = selected
    ? { id: `feature:${selected.id ?? original.features.indexOf(selectedFeature!)}`, label: selected.label, x: 0, y: 0, width: 354, height: selected.visual === 'Orbit' ? 176 : selected.visual !== 'Text' ? 145 : 72 }
    : { ...reportRegion(asset.regions, scene.focus === 'hero' || scene.focus === 'features' ? 'scores' : scene.focus), ...(scene.focus === 'category-score' ? { height: 200 } : scene.focus === 'scores' || scene.focus === 'hero' ? { width: 354, height: 180 } : scene.focus === 'action-plan' ? { width: 450, height: 240 } : {}) }
  return { region, slide: asset.slide, frame: scene.focus === 'action-plan' ? { x: videoContent.inset, y: 1700, width: videoContent.width, height: 512 } : { x: videoContent.inset, y: 1840, width: videoContent.width, height: 350 } }
}
export function drawFeatureMetric(ctx: CanvasRenderingContext2D, asset: AppReportAsset, scene: VideoScene, localMs: number, reduced: boolean, paint: CanvasPainter = paintCanvasNode) {
  localMs += scene.startMs - (asset.metricStartMs ?? scene.startMs)
  const component = featureComponent(asset, scene)
  const original = component.region.id.startsWith('feature:') ? component.slide.mockReport!.category.features.find((feature, index) => `feature:${feature.id ?? index}` === component.region.id) : undefined
  const feature = original ? nativeMetricFeature(original) : undefined
  const entry = scene.tracks.find(track => track.primitive === 'component-focus')
  const start = entry?.startMs ?? 200
  const shared = scene.tracks.some(track => track.target === 'content' && ['cinematic-flow', 'transition-panel'].includes(track.primitive))
  const amount = reduced || shared ? 1 : elementEntrance(localMs, start, entry?.durationMs ?? 650)
  const meter = reduced ? 1 : elementEntrance(localMs, start + 40, (entry?.durationMs ?? 650) + 250)
  ctx.save(); ctx.globalAlpha *= amount
  ctx.translate(0, (1 - amount) * 36)
  if (component.region.id !== 'action-plan') {
    const width = component.frame.width, id = component.region.id
    const category = asset.slide.mockReport!.category
    const score = (label: string, value: number) => ({ label, value: `${value.toFixed(1)} / 10`, positions: [value / 10] })
    const items = feature ? [feature] : id === 'category-score' ? [score(category.title, category.score)] : id === 'potential' ? [score('Potential', Number(asset.slide.potentialScore))] : [score('Overall score', Number(asset.slide.currentScore)), score('Potential', Number(asset.slide.potentialScore))]
    paint(ctx, { id, label: component.region.label, frame: component.frame, children: items.flatMap((item, index) => {
      const itemWidth = items.length > 1 ? (width - 48) / 2 : width, left = index * (itemWidth + 48)
      const identity = items.length === 1 ? id : `${id}/${index ? 'potential' : 'current'}`
      const numeric = item.value.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
      const position = item.positions?.[0] ?? ('grade' in item && item.grade != null ? item.grade / 10 : undefined)
      const variant = metricTimelineVariant(scene.source.categoryId, item.label)
      const scale = item.value.match(/\/\s*(8|10)\b/)
      const maximum = scale ? Number(scale[1]) : 10
      return [
        { id: `${identity}/label`, frame: { x: left, y: 0, width: numeric ? itemWidth * .55 : itemWidth, height: 86 }, draw: (ctx: CanvasRenderingContext2D) => {
          const label = item.label.toUpperCase(), available = numeric ? itemWidth * .55 - 20 : itemWidth
          const labelSize = Math.min(28, itemWidth * .05)
          ctx.fillStyle = '#747b83'; ctx.font = `400 ${labelSize}px monospace`
          const size = Math.min(labelSize, labelSize * available / Math.max(1, ctx.measureText(label).width))
          ctx.font = `400 ${size}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 38)
        } },
        ...(numeric ? [{ id: `${identity}/value`, frame: { x: left + itemWidth * .55, y: 0, width: itemWidth * .45, height: 86 }, draw: (ctx: CanvasRenderingContext2D) => {
          const size = Math.min(68, itemWidth * .12), suffixSize = Math.min(30, itemWidth * .056), baseline = 38 + size * .38
          ctx.fillStyle = '#12171d'; ctx.font = `500 ${size}px "Mogging Share", Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
          const numberWidth = rollingNumberWidth(ctx, numeric[1])
          ctx.font = `400 ${suffixSize}px "Mogging Share", Arial, sans-serif`
          const suffixWidth = ctx.measureText(numeric[2]).width, right = itemWidth * .45
          ctx.font = `500 ${size}px "Mogging Share", Arial, sans-serif`
          drawRollingNumber(ctx, Number(numeric[1]), numeric[1].split('.')[1]?.length ?? 0, right - suffixWidth - 12 - numberWidth, baseline, size, meter)
          ctx.font = `400 ${suffixSize}px "Mogging Share", Arial, sans-serif`; ctx.fillStyle = '#747b83'; ctx.textAlign = 'right'; ctx.fillText(numeric[2], right, baseline)
        } }] : []),
        { id: `${identity}/visual`, frame: { x: left + 8, y: 110, width: itemWidth - 16, height: 230 }, draw: (ctx: CanvasRenderingContext2D) => drawMetricTimeline(ctx, { width: itemWidth - 16, height: numeric ? 230 : 140, position, progress: meter, variant, ink: '#12171d', muted: '#99a3ad', line: '#e5e9ec', accent: '#343d46', labels: Boolean(numeric && scale), maximum, cursorLabel: numeric ? undefined : item.value, paintLabel: (ctx, frame, draw) => paint(ctx, { id: `${identity}/value`, label: item.value, frame, draw }) }) },
      ]
    }) })
  } else drawReportComponent(ctx, component.slide, component.region, component.frame, meter, paint, component.region.id === 'action-plan' ? (text, index) => {
    const spokenEnd = actionMentionEnd(scene, text)
    const check = scene.tracks.find(track => track.primitive === 'todo-check' && (track.section ?? scene.focus) === `action-plan/item:${index}`)
    return { reveal: reduced ? 1 : elementEntrance(localMs, start + index * 240, 650), checked: check ? elementEntrance(localMs, check.startMs, Math.min(350, check.durationMs)) : spokenEnd === null ? 0 : elementEntrance(localMs, spokenEnd, Math.min(350, Math.max(100, scene.durationMs - spokenEnd - 20))) }
  } : undefined)
  ctx.restore()
}

export function expandInPlace(rect: VideoFrame, frame: VideoFrame, amount: number, intensity: number): VideoFrame {
  const scale = 1 + Math.min(.24 * intensity, Math.max(0, frame.width * .98 / rect.width - 1)) * amount
  return { x: rect.x - rect.width * (scale - 1) / 2, y: rect.y - rect.height * (scale - 1) / 2, width: rect.width * scale, height: rect.height * scale }
}

export function reportRegion(regions: ReportRegion[], id: string) {
  return regions.find(region => region.id === id) ?? regions.find(region => region.id === 'features') ?? regions[0]
}

export function sectionScroll(region: ReportRegion, viewportHeight: number, max: number) {
  if (region.id === 'hero' || region.id === 'scores') return 0
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

export const reportEmphasisPrimitives = new Set(['section-lift', 'section-expand', 'section-spotlight', 'border-beam', 'gradient-outline'])

// A report has one focus owner. Group targets resolve to a single native tile;
// they never lift every child out of its grid cell.
export function reportEmphasis(scene: VideoScene, localMs: number, reduced = false) {
  const active = scene.tracks.filter(track => reportEmphasisPrimitives.has(track.primitive) && (track.target === 'report' || track.target === 'element') && localMs >= track.startMs && localMs < track.startMs + track.durationMs)
  const track = active.reduce<typeof active[number] | undefined>((selected, candidate) => !selected || candidate.startMs > selected.startMs || candidate.startMs === selected.startMs && (candidate.elementId ?? candidate.section ?? scene.focus) !== 'features' ? candidate : selected, undefined)
  if (!track) return null
  let section = track.elementId ?? track.section ?? scene.focus
  if (section === 'features') {
    const features = scene.source.report?.features ?? []
    const named = features.find(feature => scene.narration.toLowerCase().includes(feature.label.toLowerCase()))
    const index = named ? features.indexOf(named) : 0
    section = scene.focus.startsWith('feature:') ? scene.focus : `feature:${features[index]?.id ?? index}`
  }
  if (!section.startsWith('feature:') && !['scores', 'category-score', 'potential', 'action-plan'].includes(section)) return null
  const fade = reduced ? 1 : Math.min(elementEntrance(localMs, track.startMs, 160), elementEntrance(track.startMs + track.durationMs - localMs, 0, 180))
  return { section, amount: fade * Math.min(1, track.intensity) }
}

export function drawAppReport(ctx: CanvasRenderingContext2D, asset: AppReportAsset, scene: VideoScene, localMs: number, reduced: boolean, paintOverlay: typeof import('./report-overlay').drawReportOverlay, paint: CanvasPainter = paintCanvasNode, cull = true) {
  const { frame, viewportHeight, scroll } = reportMotion(scene, asset, localMs, reduced)
  const metricPaint: CanvasPainter = (ctx, node) => {
    if (!asset.narratedMetrics || !node.id.startsWith('feature:') || node.id.includes('/')) return paint(ctx, node)
    const state = metricRevealState(localMs, asset.entryTimes?.[node.id] ?? Infinity, reduced)
    paint(ctx, { ...node, draw: (ctx, painter) => {
      if (state.content < 1) {
        ctx.save(); ctx.globalAlpha *= 1 - state.content
        drawMetricPlaceholder(ctx, node.frame.width, node.frame.height, localMs, reduced); ctx.restore()
      }
      if (state.content > 0) {
        ctx.save(); ctx.globalAlpha *= state.content
        node.draw?.(ctx, painter); ctx.restore()
      }
    } })
  }
  ctx.save(); ctx.translate(frame.x, frame.y)
  drawMockReport(ctx, { ...asset.slide, mockReport: { ...asset.slide.mockReport!, scroll } }, asset.image, asset.overlay, frame.width, frame.height, reduced ? 4000 : localMs, paintOverlay, {
    viewportHeight, paint: metricPaint, presentation: 'video', regions: asset.regions, cull, metricProgress: reduced || asset.continuousReport ? 1 : elementEntrance(localMs, 100, 1050),
    featureProgress: asset.entryTimes ? id => asset.narratedMetrics ? metricRevealState(localMs, asset.entryTimes![id] ?? Infinity, reduced).chart : reduced ? 1 : elementEntrance(localMs, asset.entryTimes![id] ?? 0, 650) : undefined,
    growthProgress: asset.entryTimes ? reduced ? 1 : elementEntrance(localMs, asset.entryTimes.potential ?? 0, 800) : 1,
  })
  ctx.restore()
}
