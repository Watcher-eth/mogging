import { expect, test } from 'bun:test'
import { drawFaceTreatment } from './face-treatment'
import type { FaceLandmarksPayload } from './mobile-overlay-engine/landmarks'
import type { ReportOverlay } from './report-overlay'

test('horizontal measurement guides stay softer than endpoint ticks and face contours', () => {
  const strokes: { horizontal: boolean; opacity: number; width: number }[] = []
  const stack: { opacity: number; width: number }[] = []
  let from = { x: 0, y: 0 }, to = from
  const context = {
    globalAlpha: 1, lineWidth: 1,
    save() { stack.push({ opacity: this.globalAlpha, width: this.lineWidth }) },
    restore() { const state = stack.pop()!; this.globalAlpha = state.opacity; this.lineWidth = state.width },
    scale() {}, translate() {}, rotate() {}, setLineDash() {}, beginPath() {},
    getTransform: () => ({ a: 1, b: 0 }),
    moveTo(x: number, y: number) { from = { x, y } },
    lineTo(x: number, y: number) { to = { x, y } },
    stroke() { strokes.push({ horizontal: Math.abs(to.y - from.y) < .01, opacity: this.globalAlpha, width: this.lineWidth }) },
  }
  const overlay: ReportOverlay = { size: { width: 100, height: 100 }, primitives: [], dots: [], measurement: {
    kind: 'width', anchors: { leftPupil: { x: 30, y: 30 }, rightPupil: { x: 70, y: 30 }, leftCheek: { x: 15, y: 60 }, rightCheek: { x: 85, y: 60 } },
  } }
  drawFaceTreatment(context as unknown as CanvasRenderingContext2D, overlay, 100, 5000, true)
  const horizontal = strokes.filter(stroke => stroke.horizontal), vertical = strokes.filter(stroke => !stroke.horizontal)
  expect(horizontal.length).toBeGreaterThan(0)
  expect(vertical.length).toBeGreaterThan(0)
  expect(horizontal[0].opacity / vertical[0].opacity).toBeCloseTo(.62)
  expect(horizontal[0].width / vertical[0].width).toBeCloseTo(.78)
})


test('brow outlines retain their upper and lower edges and close around the feature', async () => {
  const { preciseFaceOverlay } = await import('./face-treatment')
  const { enrichFaceLandmarks } = await import('./mobile-overlay-engine/enrich-landmarks')
  const { default: portrait } = await import('../../components/landing/primer-portrait.json')
  const landmarks = enrichFaceLandmarks(portrait as FaceLandmarksPayload)!
  expect(landmarks.contours?.leftBrow).toEqual(portrait.contours.leftBrow)
  expect(landmarks.contours?.rightBrow).toEqual(portrait.contours.rightBrow)
  const overlay = preciseFaceOverlay({ size: { width: 390, height: 520 }, primitives: [], dots: [] }, { ...portrait.image, landmarks }, 'brows')
  const brows = overlay.primitives.filter(primitive => primitive.kind === 'polyline')
  expect(brows).toHaveLength(2)
  for (const brow of brows) {
    if (brow.kind !== 'polyline') throw Error('Expected brow outline')
    expect(brow.closed).toBe(true)
    expect(brow.pixelPoints.at(-1)).toEqual(brow.pixelPoints[0])
  }
})
