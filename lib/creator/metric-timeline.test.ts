import { videoThemeContext } from './video-theme'
import { expect, test } from 'bun:test'
import { drawReportMetricTimeline, metricTimelineGeometry, metricTimelineStyles, metricTimelineVariant, reportTimelineGeometry, reportTimelineStyle } from './metric-timeline'

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
  expect(psl.cursors[0].x).toBeCloseTo(24 + (900 - 48) * 5.7 / 8)
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
    expect(sparse.ticks).toHaveLength(21)
    expect(sparse.ticks[1].x - sparse.ticks[0].x).toBeGreaterThan(30)
    expect(new Set(sparse.ticks.map(tick => tick.length)).size).toBe(2)
  }
  const psl = metricTimelineGeometry({ width: 800, height: 300, positions: [.7], progress: 1, variant: 6, labels: true, maximum: 8 })
  expect(psl.ticks).toHaveLength(17)
  expect(psl.ticks.map(tick => tick.x)).toEqual(Array.from({length:17},(_,index)=>24+index*(800-48)/16))
  expect(psl.ticks.filter(tick => tick.label !== undefined).map(tick => tick.label)).toEqual(['0', '2', '4', '6', '8'])
})

test('ungraded or missing metrics never acquire an invented default score', () => {
  let draws = 0
  const context = new Proxy({}, { get: () => () => { draws++ } }) as CanvasRenderingContext2D
  drawReportMetricTimeline(context, { label: 'Jaw', value: 'Unavailable', visual: 'Rail', grade: null }, 0, 0, 300, 100)
  drawReportMetricTimeline(context, { label: 'Symmetry', value: 'Unavailable', visual: 'Orbit', positions: [] }, 0, 0, 300, 100)
  expect(draws).toBe(0)
})

test('native report rulers fill full and half cards at the mobile tick weight and color', () => {
  for (const width of [140, 322]) for (const label of ['Cheek width', 'Jaw angle', 'Eye spacing', 'Skin texture', 'Overall score']) {
    const geometry = reportTimelineGeometry(width, reportTimelineStyle('', label))
    expect(geometry.ticks[0].x).toBeCloseTo(10)
    expect(geometry.ticks.at(-1)!.x).toBeCloseTo(width - 10)
    expect(geometry.height).toBeGreaterThan(45)
    const scales: number[][] = [], colors: string[] = []
    const context = new Proxy({}, { get: (_, method) => method === 'scale' ? (...values: number[]) => scales.push(values) : method === 'globalAlpha' ? 1 : () => {}, set: (_, method, value) => { if (method === 'strokeStyle') colors.push(value); return true } }) as CanvasRenderingContext2D
    drawReportMetricTimeline(context, { label, value: '6.2 / 10', visual: 'Rail', grade: 6.2 }, 0, 0, width, geometry.height)
    expect(scales).toHaveLength(0)
    expect(colors).toContain('#83909d')
    expect(colors).toContain(geometry.sparse ? '#ed982b' : '#32b1ed')
  }
})


test('report instruments use the mobile dial, tapered and category-specific ruler families', () => {
  expect(reportTimelineStyle('jaw.width', 'Jaw / cheek width')).toBe('balanced')
  expect(reportTimelineStyle('jaw.height', 'Chin / lower-face height')).toBe('dial')
  expect(reportTimelineStyle('brows.length', 'Brow length')).toBe('tapered')
  expect(reportTimelineStyle('overall.psl', 'PSL score')).toBe('psl')
  for (const style of ['dial', 'tapered', 'psl'] as const) {
    const geometry = reportTimelineGeometry(322, style)
    expect(geometry.ticks.every(tick => [tick.x, tick.y, tick.start, tick.length, tick.rotation].every(Number.isFinite))).toBe(true)
    expect(reportTimelineGeometry(322, style)).toBe(geometry)
  }
})

test('a native ruler batches static ticks into one draw rather than one draw per tick', () => {
  let strokes = 0, saves = 0
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : key === 'stroke' ? () => strokes++ : key === 'save' ? () => saves++ : key === 'restore' ? () => saves-- : () => {}, set: () => true }) as CanvasRenderingContext2D
  drawReportMetricTimeline(ctx, { id: 'jaw.width', label: 'Jaw width', value: '0.79×', positions: [.56] }, 0, 0, 322, 70)
  expect(strokes).toBe(2)
  expect(saves).toBe(0)
})


test('dark report instruments retain charcoal ticks, warm highlights and the amber active marker', () => {
  const strokes: string[] = []
  const state = { strokeStyle: '', fillStyle: '', globalAlpha: 1, lineWidth: 1 }
  const native = new Proxy(state, { get(target, key) {
    if (key === 'stroke') return () => strokes.push(target.strokeStyle)
    if (key in target) return Reflect.get(target, key)
    return () => {}
  } }) as unknown as CanvasRenderingContext2D
  drawReportMetricTimeline(videoThemeContext(native, 'dark'), { id: 'jaw.angle', label: 'Jaw angle', value: '120°', positions: [.6] }, 0, 0, 300, 100)
  expect(strokes).toContain('#42403d')
  expect(strokes).toContain('#f5eee2')
  expect(strokes).toContain('#ff9d00')
  expect(strokes).not.toContain('#32b1ed')
})


test('rulers reveal from zero, keep evenly spaced half-unit ticks and label the actual scale', () => {
  for(const maximum of [8,10]) {
    const start=metricTimelineGeometry({width:900,height:230,progress:0,variant:6,labels:true,maximum,positions:[.7]})
    expect(start.ticks.every(tick=>tick.opacity===0)).toBe(true)
    const mid=metricTimelineGeometry({width:900,height:230,progress:.4,variant:6,labels:true,maximum})
    expect(mid.ticks[0].opacity).toBeGreaterThan(mid.ticks.at(-1)!.opacity)
    const end=metricTimelineGeometry({width:900,height:230,progress:1,variant:6,labels:true,maximum})
    expect(end.ticks).toHaveLength(maximum*2+1)
    const spacing=end.ticks[1].x-end.ticks[0].x
    end.ticks.slice(1).forEach((tick,index)=>expect(tick.x-end.ticks[index].x).toBeCloseTo(spacing))
    expect(end.ticks.filter(tick=>tick.label!==undefined).map(tick=>Number(tick.label))).toEqual(Array.from({length:maximum/2+1},(_,index)=>index*2))
  }
})
