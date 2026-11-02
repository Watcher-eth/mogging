import { CREATOR_TIER_ONE_COUNTRIES } from '../../lib/creator/audience'

export type OcrLine = { text: string; confidence: number; x: number; y: number; width: number; height: number }
export type OcrFrame = { path: string; timestamp: number; lines: OcrLine[] }
export type CountryReading = { country: string; percent: number; timestamp: number; raw: string }

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const countryNames = new Map<string, string>()
// ICU supplies localized country labels without another package or a duplicate country catalog.
for (const locale of ['en', 'de', 'fr', 'es', 'pt']) {
  const display = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' })
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b)
    const name = display.of(code)
    if (name) countryNames.set(normalize(name), new Intl.DisplayNames(['en'], { type: 'region' }).of(code)!)
  }
}
for (const [alias, name] of Object.entries({ USA: 'United States', US: 'United States', UK: 'United Kingdom', 'Republic of Korea': 'South Korea' })) countryNames.set(normalize(alias), name)
const tierOne = new Set<string>(CREATOR_TIER_ONE_COUNTRIES)

export function countryName(text: string) { return countryNames.get(normalize(text)) ?? null }
export function audienceLocation(text: string) { return /^other$/i.test(text.trim()) ? 'Other' : countryName(text) }

function percent(text: string) {
  const match = text.match(/(?:^|\s)(\d{1,3}(?:[.,]\d+)?)\s*%/)
  const value = match ? Number(match[1].replace(',', '.')) : NaN
  return value >= 0 && value <= 100 ? value : null
}

export function readCountryRows(frame: OcrFrame): CountryReading[] {
  const readings: CountryReading[] = []
  for (const line of frame.lines) {
    if (line.confidence < 0.3) continue
    const name = audienceLocation(line.text.replace(/\s*\d[\d.,]*\s*%.*$/, ''))
    if (!name) continue
    const inline = percent(line.text)
    const candidates = frame.lines.filter(other => other !== line && other.confidence >= 0.3
      && other.x > line.x && percent(other.text) !== null
      && Math.abs((other.y + other.height / 2) - (line.y + line.height / 2)) < Math.max(other.height, line.height) * 0.65)
    // Ambiguous row associations remain unknown rather than choosing a nearby percentage.
    const value = inline ?? (candidates.length === 1 ? percent(candidates[0].text) : null)
    if (value !== null) readings.push({ country: name, percent: value, timestamp: frame.timestamp,
      raw: inline !== null ? line.text : `${line.text} | ${candidates[0].text}` })
  }
  return readings
}

export function summarizeCountries(readings: CountryReading[]) {
  const groups = new Map<string, CountryReading[]>()
  for (const row of readings) groups.set(row.country, [...(groups.get(row.country) ?? []), row])
  const locations = [...groups].map(([country, rows]) => {
    const values = [...new Set(rows.map(row => row.percent))]
    return { country, tierOne: tierOne.has(country), percent: values.length === 1 ? values[0] : null,
      conflictingValues: values.length > 1 ? values : [], timestamps: [...new Set(rows.map(row => row.timestamp))] }
  })
  const countries = locations.filter(row => row.country !== 'Other')
  const other = locations.find(row => row.country === 'Other') ?? null
  const knownTier1Sum = countries.reduce((total, row) => total + (row.tierOne ? row.percent ?? 0 : 0), 0)
  const visibleSum = countries.reduce((total, row) => total + (row.percent ?? 0), 0)
  return { countries, other, observedTier1Percent: countries.length ? Math.round(knownTier1Sum * 1000) / 1000 : null,
    visiblePercent: Math.round(visibleSum * 1000) / 1000,
    completeTier1Percent: null,
    needsReview: true,
    reasons: [!countries.length ? 'No readable country rows' : 'Audience scope and list completeness need verification',
      ...(locations.some(row => row.percent === null) ? ['Conflicting location percentages'] : []),
      ...(visibleSum > 100.5 ? ['Visible percentages exceed 100%; possible OCR error or mixed analytics screens'] : [])] }
}

export function optionalMetricCandidates(frames: OcrFrame[]) {
  const labels = /average watch time|avg\.? watch time|total viewers|video views|total views|most viewers stopped|drop.?off|retention|\b(?:13\s*[-–]\s*17|18\s*[-–]\s*24|25\s*[-–]\s*34|35\s*[-–]\s*44|45\s*[-–]\s*54|55\s*\+)/i
  return frames.flatMap(frame => frame.lines.filter(line => labels.test(line.text)).map(line => ({
    timestamp: frame.timestamp, label: line.text,
    // Raw nearby text is evidence for annotation, not a guessed numerical metric.
    nearbyText: frame.lines.filter(other => Math.abs(other.y - line.y) < Math.max(line.height * 4, 0.06)).map(other => other.text),
  })))
}

export function selectAnalyticsFrames(frames: OcrFrame[]) {
  const selected = new Map<number, OcrFrame>()
  const cover = (labels: (frame: OcrFrame) => string[], count: number) => {
    const seen = new Set<string>()
    for (let i = 0; i < count; i++) {
      const ranked = frames.map(frame => ({ frame, labels: labels(frame).filter(label => !seen.has(label)) }))
        .sort((a, b) => b.labels.length - a.labels.length)
      if (!ranked[0]?.labels.length) break
      const { frame, labels: fresh } = ranked[0]
      selected.set(frame.timestamp, frame)
      fresh.forEach(label => seen.add(label))
    }
  }
  const best = (score: (frame: OcrFrame) => number, count: number) => {
    const ranked = frames.map(frame => ({ frame, score: score(frame) })).filter(row => row.score > 0).sort((a, b) => b.score - a.score)
    for (const { frame } of ranked.slice(0, count)) selected.set(frame.timestamp, frame)
  }
  cover(frame => readCountryRows(frame).map(row => row.country), 3)
  cover(frame => frame.lines.filter(line => /^(?:13\s*[-–]\s*17|18\s*[-–]\s*24|25\s*[-–]\s*34|35\s*[-–]\s*44|45\s*[-–]\s*54|55\s*\+)$/.test(line.text))
    .map(line => line.text.replace(/\s+/g, '')), 2)
  for (const pattern of [/average watch time|avg\.? watch time/i, /total viewers/i, /video views|total views/i,
    /most viewers stopped|drop.?off|retention/i]) {
    best(frame => frame.lines.filter(line => pattern.test(line.text)).reduce((total, line) => total + line.confidence, 0), 1)
  }
  // If OCR found no analytics at all, retain a bounded visual fallback from the tail.
  if (!selected.size) for (const frame of frames.slice(-5)) selected.set(frame.timestamp, frame)
  return [...selected.values()].sort((a, b) => a.timestamp - b.timestamp)
}
