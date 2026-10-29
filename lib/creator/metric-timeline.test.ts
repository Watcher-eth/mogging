import { expect, test } from 'bun:test'
import { drawReportMetricTimeline, metricTimelineGeometry, metricTimelineStyles, metricTimelineVariant } from './metric-timeline'

test('all industrial ruler families keep finite geometry, visible inactive ticks and bounded cursors', () => {
  for (let variant = 0; variant < metricTimelineStyles.length; variant++) for (const positions of [[], [0], [.62], [1], [.3, .8]]) {
    const geometry = metricTimelineGeometry({ width: 900, height: 340, positions, progress: 1, variant, labels: true })
    expect(geometry.ticks.length).toBeGreaterThan(9)
    expect(geometry.ticks.every(tick => tick.opacity >= .24 && [tick.x, tick.y, tick.rotation, tick.length].every(Number.isFinite))).toBe(true)
    expect(geometry.cursors).toHaveLength(positions.length)
    expect(geometry.cursors.every(cursor => [cursor.x, cursor.y, cursor.rotation].every(Number.isFinite))).toBe(true)
  }
})

test('metric meaning chooses the ruler, while PSL retains its actual eight-point scale', () => {
  expect(metricTimelineVariant('Jaw angle')).toBe(1)
  expect(metricTimelineVariant('Skin texture')).toBe(2)
  expect(metricTimelineVariant('Symmetry')).toBe(5)
  expect(metricTimelineVariant('Nasal projection')).toBe(3)
  const psl = metricTimelineGeometry({ width: 900, height: 340, positions: [5.7 / 8], progress: 1, variant: 0, labels: true, maximum: 8 })
  expect(psl.ticks.filter(tick => tick.label !== undefined).map(tick => tick.label)).toEqual(['0', '2', '4', '6', '8'])
  expect(psl.cursors[0].x).toBeCloseTo(900 * 5.7 / 8)
})

test('curved instruments fill the aperture and expose their lower measurement boundary', () => {
  for (const variant of [1, 4, 7]) {
    const geometry = metricTimelineGeometry({ width: 876, height: 340, positions: [.5, .8], progress: 1, variant })
    expect(geometry.ticks[0].x).toBeCloseTo(12)
    expect(geometry.ticks.at(-1)!.x).toBeCloseTo(864)
    expect(geometry.ticks.length).toBeLessThan(60)
    expect(geometry.bottom).toBeGreaterThan(Math.max(...geometry.cursors.map(point => point.y + Math.cos(point.rotation) * geometry.majorLength)))
  }
})

test('sparse reference instruments retain the scale with larger graduation spacing', () => {
  expect(metricTimelineVariant('PSL score')).toBe(6)
  expect(metricTimelineVariant('Eye area')).toBe(7)
  for (const variant of [6, 7]) {
    const sparse = metricTimelineGeometry({ width: 876, height: 340, positions: [.62], progress: 1, variant })
    expect(sparse.sparse).toBe(true)
    expect(sparse.ticks).toHaveLength(11)
    expect(sparse.ticks[1].x - sparse.ticks[0].x).toBeGreaterThan(60)
    expect(new Set(sparse.ticks.map(tick => tick.length)).size).toBe(2)
  }
  const psl = metricTimelineGeometry({ width: 800, height: 300, positions: [.7], progress: 1, variant: 6, labels: true, maximum: 8 })
  expect(psl.ticks).toHaveLength(9)
  expect(psl.ticks.map(tick => tick.x)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800])
  expect(psl.ticks.filter(tick => tick.label !== undefined).map(tick => tick.label)).toEqual(['0', '2', '4', '6', '8'])
})

test('ungraded or missing metrics never acquire an invented default score', () => {
  let draws = 0
  const context = new Proxy({}, { get: () => () => { draws++ } }) as CanvasRenderingContext2D
  drawReportMetricTimeline(context, { label: 'Jaw', value: 'Unavailable', visual: 'Rail', grade: null }, 0, 0, 300, 100)
  drawReportMetricTimeline(context, { label: 'Symmetry', value: 'Unavailable', visual: 'Orbit', positions: [] }, 0, 0, 300, 100)
  expect(draws).toBe(0)
})

test('native report instruments use distinct rulers, dials, and the real PSL scale', async () => {
  const { timelineStyle, timelineGeometry, timelineAxisLabels } = await import('./mobile-report-geometry')
  expect(timelineStyle('overall.psl')).toBe('psl')
  expect(timelineStyle('overall.eyes')).toBe('arc')
  expect(timelineStyle('skin.texture')).toBe('dial')
  expect(timelineStyle('overall.cheeks')).toBe('triangulation')
  const marks = timelineAxisLabels(140, 'psl', { kind: 'Orbit', grade: null, positions: [5.8 / 8] })
  expect(marks.map(mark => mark.text)).toEqual(['1','2','3','4','5','6','7','8'])
  expect(timelineGeometry(322, 'dial').ticks.every(tick => Number.isFinite(tick.end.x + tick.end.y))).toBe(true)
})
