import { expect, test } from 'bun:test'
import { morphFaceOverlay } from './face-overlay-morph'
import { narratedFaceOverlays } from './face-treatment'
import type { ReportOverlay } from './report-overlay'
import type { GeneratorImage } from './content-generator'

const overlay = (id: string, x: number): ReportOverlay => ({ size: { width: 360, height: 500 }, dots: [], primitives: [{ id, kind: 'polyline', points: [], closed: false, pixelPoints: [{ x, y: 0 }, { x, y: 25 }, { x, y: 100 }] }] })

test('unrelated contours redraw in place without falling or rotating strands', () => {
  const from = overlay('brow', 20), to = overlay('jaw', 100)
  expect(morphFaceOverlay(from, to, 0)).toBe(from)
  expect(morphFaceOverlay(from, to, 1)).toBe(to)
  const middle = morphFaceOverlay(from, to, .5)
  expect(middle.primitives).toHaveLength(1)
  const contour = middle.primitives[0]
  if (contour.kind !== 'polyline') throw new Error('Expected contour')
  expect(contour.pixelPoints.length).toBeGreaterThan(1)
  expect(contour.pixelPoints.every(point => point.x === 100 && Number.isFinite(point.y))).toBe(true)
  expect(morphFaceOverlay(from, to, .5)).toEqual(middle)
  expect(morphFaceOverlay(from, { ...to, primitives: [] }, .5).primitives).toHaveLength(0)
})

test('spoken feature changes use word timestamps and identical evidence does not replay', () => {
  const source = { width: 360, height: 500, landmarks: { confidence: .95, anchors: {}, contours: { leftBrow: [{ x: .2, y: .2 }, { x: .3, y: .18 }, { x: .4, y: .2 }], jawline: [{ x: .2, y: .5 }, { x: .5, y: .8 }, { x: .8, y: .5 }] } } } as GeneratorImage
  const cues = narratedFaceOverlays(overlay('original', 0), source, 'overall', [
    { text: 'Brows.', startMs: 100 }, { text: 'The', startMs: 1100 }, { text: 'jaw.', startMs: 1300 }, { text: 'Jaw.', startMs: 2500 },
  ])
  expect(cues.map(cue => cue.startMs)).toEqual([0, 1100])
  expect(cues[0].overlay.primitives.map(item => item.id)).toEqual(['feature-leftBrow'])
  expect(cues[1].overlay.primitives.map(item => item.id)).toEqual(['feature-jawline'])
  expect(cues.every(cue => cue.overlay.measurement === undefined)).toBe(true)
})


test('nearby matching contours retain smooth interpolation without changing direction', () => {
  const from=overlay('jaw',20),to=overlay('jaw',24)
  const middle=morphFaceOverlay(from,to,.5).primitives[0]
  if(middle.kind!=='polyline')throw new Error('Expected contour')
  expect(middle.pixelPoints.every(point=>point.x===22)).toBe(true)
  expect(middle.pixelPoints).toHaveLength(65)
})
