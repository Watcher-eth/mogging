import { expect, test } from 'bun:test'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'

function recordingContext() {
  const points: number[][] = []
  const ctx = new Proxy({
    lineTo: (x: number, y: number) => points.push([x, y]),
  }, { get: (target, key) => target[key as keyof typeof target] ?? (() => {}) }) as unknown as CanvasRenderingContext2D
  return { ctx, points }
}

const overlay: ReportOverlay = {
  size: { width: 360, height: 520 }, dots: [],
  primitives: [{
    id: 'contour', kind: 'polyline', points: [],
    pixelPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 90 }],
    animation: { delay: 100, duration: 1000, entrance: 'draw' },
  }],
}

test('contours grow along their length and finish exactly at the final anchor', () => {
  const before = recordingContext()
  drawReportOverlay(before.ctx, overlay, 360, 99)
  expect(before.points).toEqual([])
  const entering = recordingContext()
  drawReportOverlay(entering.ctx, overlay, 360, 101)
  expect(entering.points).toHaveLength(1)
  expect(entering.points[0][0]).toBeGreaterThan(0)
  expect(entering.points[0][0]).toBeLessThan(10)
  const middle = recordingContext()
  drawReportOverlay(middle.ctx, overlay, 360, 500)
  expect(middle.points[0]).toEqual([10, 0])
  expect(middle.points[1][1]).toBeGreaterThan(0)
  expect(middle.points[1][1]).toBeLessThan(90)
  const finished = recordingContext()
  drawReportOverlay(finished.ctx, overlay, 360, 1100)
  expect(finished.points).toEqual([[10, 0], [10, 90]])
})

test('cached paths do not leak into newly projected geometry after resize', () => {
  const primitive = overlay.primitives[0]
  if (primitive.kind !== 'polyline') throw new Error('Expected contour')
  const resized: ReportOverlay = { ...overlay, primitives: [{ ...primitive, pixelPoints: [{ x: 20, y: 30 }, { x: 40, y: 50 }] }] }
  const next = recordingContext()
  drawReportOverlay(next.ctx, resized, 360, 1100)
  expect(next.points).toEqual([[40, 50]])
  const original = recordingContext()
  drawReportOverlay(original.ctx, overlay, 360, 1100)
  expect(original.points).toEqual([[10, 0], [10, 90]])
})
