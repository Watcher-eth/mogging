import { expect, test } from 'bun:test'
import { drawFaceTreatment, faceFeatureContours, preciseFaceOverlay, revealContour } from './video-face-treatment'
import type { ReportOverlay } from './report-overlay'
import type { GeneratorImage } from './content-generator'


function drawingContext() {
  const strokes: number[] = [], labels: string[] = [], dashes: number[][] = []
  let alpha = 1
  const stack: number[] = []
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'getTransform' ? () => ({ a: 1, b: 0 }) : key === 'save' ? () => stack.push(alpha) : key === 'restore' ? () => { alpha = stack.pop()! } : key === 'stroke' ? () => strokes.push(alpha) : key === 'setLineDash' ? (value: number[]) => dashes.push(value) : key === 'fillText' ? (value: string) => labels.push(value) : key === 'globalAlpha' ? alpha : () => {},
    set: (_, key, value) => { if (key === 'globalAlpha') alpha = value; return true },
  }) as CanvasRenderingContext2D
  return { ctx, strokes, labels, dashes }
}
const overlay: ReportOverlay = { size: { width: 360, height: 500 }, dots: [], primitives: [{ id: 'feature-leftBrow', kind: 'polyline', points: [], closed: false, pixelPoints: [{ x: 50, y: 100 }, { x: 80, y: 90 }, { x: 100, y: 100 }] }] }

test('glass contours reveal real geometry, keep their pattern and settle without timer resets', () => {
  for (const pattern of ['solid', 'dashed', 'dotted'] as const) {
    const { ctx, strokes, dashes, labels } = drawingContext()
    drawFaceTreatment(ctx, overlay, 360, 0, false, 1, { appearance: { pattern, opacity: .5, markers: false, regions: false } })
    expect(strokes).toHaveLength(0)
    for (const time of [1500, 2400, 4800, 8000]) drawFaceTreatment(ctx, overlay, 360, time, false, 1, { appearance: { pattern, opacity: .5, markers: false, regions: false } })
    expect(strokes).toEqual([.5, .5, .5, .5])
    expect(dashes).toContainEqual(pattern === 'dotted' ? [.5, 4.5] : pattern === 'dashed' ? [7, 5] : [])
    expect(labels).toHaveLength(0)
  }
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }]
  expect(revealContour(points, .5)).toEqual([points[0], points[1], { x: 10, y: 10 }])
  expect(revealContour(points, 1)).toEqual(points)
})

test('numbered frosted callouts are anchored to contour endpoints, not arbitrary samples', () => {
  const { ctx, labels } = drawingContext()
  drawFaceTreatment(ctx, overlay, 360, 1800)
  expect(labels).toEqual(['01', '02'])
})

test('annotation renderer cannot relight or redraw the photo and ignores generic cross-face boxes', () => {
  const { ctx, strokes } = drawingContext()
  drawFaceTreatment(ctx, { ...overlay, primitives: [{ id: 'box', kind: 'box', from: { anchor: 'leftPupil' }, to: { anchor: 'chin' }, rect: { x: 30, y: 200, width: 300, height: 200 } }] }, 360, 1800)
  expect(strokes).toHaveLength(0)
})

test('glass outlines retract to their origin at exit and reduced motion keeps settled geometry', () => {
  const visible = drawingContext(), ended = drawingContext(), reduced = drawingContext()
  drawFaceTreatment(visible.ctx, overlay, 360, 3850, false, 1, { durationMs: 4000 })
  drawFaceTreatment(ended.ctx, overlay, 360, 4000, false, 1, { durationMs: 4000 })
  drawFaceTreatment(reduced.ctx, overlay, 360, 4000, true, 1, { durationMs: 4000 })
  expect(visible.strokes.length).toBeGreaterThan(0)
  expect(ended.strokes).toHaveLength(0)
  expect(reduced.strokes.length).toBeGreaterThan(0)
})

test('whole-face categories choose registered instruments without a generic forehead triangle', () => {
  const source = { width: 360, height: 500, landmarks: { confidence: .95, anchors: { leftPupil: { x: .3, y: .4 }, rightPupil: { x: .7, y: .4 }, forehead: { x: .5, y: .2 }, chin: { x: .5, y: .8 } } } } as GeneratorImage
  const base: ReportOverlay = { size: { width: 360, height: 500 }, primitives: [], dots: [] }
  expect(preciseFaceOverlay(base, source, 'overall').measurement?.kind).toBe('symmetry')
  expect(preciseFaceOverlay(base, source, 'symmetry').measurement?.kind).toBe('symmetry')
  expect(preciseFaceOverlay(base, source, 'proportions').measurement?.kind).toBe('thirds')
  expect(preciseFaceOverlay(base, source, 'face-shape').measurement?.kind).toBe('width')
  expect(faceFeatureContours('symmetry')).toEqual(['leftEye', 'rightEye', 'mouth', 'jawline'])
  expect(faceFeatureContours('overall')).not.toContain('faceOutline')
})

test('spoken features select distinct detected anatomy instead of default eyes and mouth', () => {
  expect(faceFeatureContours('overall', 'The nasal bridge creates a central contour.')).toEqual(['noseBridge'])
  expect(faceFeatureContours('overall', 'Dark brows frame the eyes.')).toEqual(['leftBrow', 'rightBrow', 'leftEye', 'rightEye'])
  expect(faceFeatureContours('overall', 'The chin tapers beneath the jaw.')).toEqual(['jawline'])
  expect(faceFeatureContours('overall', 'The silhouette of the whole face.')).toEqual(['leftBrow', 'rightBrow', 'noseBridge', 'jawline'])
  expect(faceFeatureContours('cheeks', 'The cheek contours support the frame.')).toEqual(['cheekbones'])
})

test('measurement instruments follow detected anchors, compensate for eye roll and suppress oblique comparisons', () => {
  const source = { width: 360, height: 500, landmarks: { confidence: .95, anchors: { leftPupil: { x: .3, y: .35 }, rightPupil: { x: .7, y: .4 }, leftEyeInner: { x: .4, y: .36 }, rightEyeInner: { x: .6, y: .39 }, forehead: { x: .5, y: .2 }, chin: { x: .5, y: .8 } }, quality: { yawRadians: .1 } } } as GeneratorImage
  const base: ReportOverlay = { size: { width: 360, height: 500 }, primitives: [], dots: [] }
  const symmetry = preciseFaceOverlay(base, source, 'symmetry', 'Facial harmony and symmetry')
  expect(symmetry.measurement?.kind).toBe('symmetry')
  expect(symmetry.measurement?.anchors.leftPupil).toEqual({ x: 108, y: 175 })
  expect(preciseFaceOverlay(base, source, 'eyes', 'inner-eye gap').measurement?.kind).toBe('inner-spacing')
  expect(preciseFaceOverlay(base, source, 'eyes', 'pupil spacing').measurement?.kind).toBe('spacing')
  expect(preciseFaceOverlay(base, source, 'eyes', 'canthal tilt').measurement?.kind).toBe('tilt')
  expect(preciseFaceOverlay(base, source, 'proportions', 'facial thirds').measurement?.kind).toBe('thirds')
  expect(preciseFaceOverlay(base, source, 'cheeks', 'Contrast between upper width and softness').measurement).toBeUndefined()
  expect(preciseFaceOverlay(base, source, 'cheeks', 'The facial width').measurement?.kind).toBe('width')
  source.landmarks!.quality!.yawRadians = .7
  expect(preciseFaceOverlay(base, source, 'symmetry').measurement).toBeUndefined()
})

test('pupil and inner-corner cues select real app anchors; upper and lower lids use different contour sections', () => {
  const source = { width: 360, height: 500, landmarks: { anchors: { leftPupil: { x: .3, y: .4 }, rightPupil: { x: .7, y: .4 }, leftEyeInner: { x: .4, y: .4 }, rightEyeInner: { x: .6, y: .4 } }, contours: { leftEye: [{ x: .2, y: .4 }, { x: .3, y: .35 }, { x: .4, y: .4 }, { x: .3, y: .45 }], rightEye: [{ x: .6, y: .4 }, { x: .7, y: .35 }, { x: .8, y: .4 }, { x: .7, y: .45 }] } } } as GeneratorImage
  const base: ReportOverlay = { size: { width: 360, height: 500 }, primitives: [], dots: [] }
  expect(preciseFaceOverlay(base, source, 'eyes', 'Pupil spacing').primitives.map(item => item.id)).toEqual(['feature-leftPupil', 'feature-rightPupil'])
  expect(preciseFaceOverlay(base, source, 'eyes', 'The inner-eye gap').primitives.map(item => item.id)).toEqual(['feature-leftEyeInner', 'feature-rightEyeInner'])
  const upper = preciseFaceOverlay(base, source, 'eyes', 'Upper eyelid contour').primitives
  const lower = preciseFaceOverlay(base, source, 'eyes', 'Lower eyelid contour').primitives
  expect(upper).toHaveLength(2)
  expect(lower).toHaveLength(2)
  expect(upper).not.toEqual(lower)
  expect(upper.every(item => item.kind === 'polyline' && !item.closed)).toBe(true)
})

test('a brow-corner explanation keeps eyebrow contours instead of selecting eye-corner anchors', () => {
  const source = { width: 360, height: 500, landmarks: { anchors: { leftEyeInner: { x: .4, y: .4 }, rightEyeInner: { x: .6, y: .4 } }, contours: { leftBrow: [{ x: .2, y: .35 }, { x: .3, y: .3 }, { x: .4, y: .34 }], rightBrow: [{ x: .6, y: .34 }, { x: .7, y: .3 }, { x: .8, y: .35 }] } } } as GeneratorImage
  const overlay = preciseFaceOverlay({ size: { width: 360, height: 500 }, primitives: [], dots: [] }, source, 'brows', 'The brow is a contour rather than a straight line; its corners give us useful reference points.')
  expect(overlay.primitives.map(primitive => primitive.id)).toEqual(['feature-leftBrow', 'feature-rightBrow'])
  expect(overlay.primitives.every(primitive => primitive.kind === 'polyline')).toBe(true)
})

test('a continuous face shot holds its geometry through the cut instead of retracting', () => {
  const held = drawingContext()
  drawFaceTreatment(held.ctx, overlay, 360, 4000, false, 1, { durationMs: 4000, hold: true })
  expect(held.strokes.length).toBeGreaterThan(0)
})
