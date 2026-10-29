import { smoothMotion } from './report-motion'
import type { ReportRegion } from './mock-report'

export function nativeReportEntry(milliseconds: number) {
  const seconds = Math.max(0, milliseconds) / 1000
  return Math.max(0, Math.min(1, 1 - Math.exp(-12 * seconds) * (Math.cos(6 * seconds) + 2 * Math.sin(6 * seconds))))
}

// Semantic destinations, measured from the report painter rather than a second
// coordinate table. These use the video engine's scroll → expand → settle rhythm.
export function reportTourStops(regions: ReportRegion[]) {
  const metrics = regions.filter(region => region.id.startsWith('feature:') && region.showVisual)
  const feature = metrics.find(region => region.width > 300 && region.id !== metrics[0]?.id) ?? metrics[1]
  return [
    { region: regions.find(region => region.id === 'hero')!, duration: 2600 },
    ...[metrics[0], feature].filter((region): region is ReportRegion => Boolean(region)).map(region => ({ region, duration: 5800 })),
    ...['potential', 'action-plan'].map(id => ({ region: regions.find(region => region.id === id)!, duration: 5200 })),
    { region: regions.find(region => region.id === 'hero')!, duration: 1800 },
  ]
}

export function sampleReportTour(time: number, regions: ReportRegion[], maximum: number) {
  const stops = reportTourStops(regions), duration = stops.reduce((total, stop) => total + stop.duration, 0)
  const clock = ((time % duration) + duration) % duration
  const scrollFor = (region: ReportRegion) => region.id === 'hero' ? 0 : Math.max(0, Math.min(maximum, region.y - (region.height > 340 ? 140 : 265)))
  let start = 0
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]
    if (clock < start + stop.duration) {
      const elapsed = clock - start, previous = stops[(index + stops.length - 1) % stops.length]
      const scroll = scrollFor(previous.region) + (scrollFor(stop.region) - scrollFor(previous.region)) * smoothMotion(elapsed / 1800)
      const lift = stop.region.id === 'hero' ? 0 : smoothMotion((elapsed - 2200) / 900) * (1 - smoothMotion((elapsed - stop.duration + 1200) / 900))
      return { region: stop.region, scroll, lift, elapsed, cycle: Math.floor(time / duration), duration }
    }
    start += stop.duration
  }
  return { region: stops[0].region, scroll: 0, lift: 0, elapsed: 0, cycle: 0, duration }
}

// Same 55% visibility gate as the native report, inside its fixed app chrome.
export function reportInstrumentIsVisible(top: number, height: number, scroll: number, viewportTop = 104, viewportBottom = 734) {
  const available = viewportBottom - viewportTop
  const visible = Math.max(0, Math.min(top + height - scroll, viewportBottom) - Math.max(top - scroll, viewportTop))
  return height > 0 && available > 0 && visible / Math.min(height, available) >= .55
}
