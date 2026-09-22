import { expect, test } from 'bun:test'
import { resolveShareOverallOverlay } from './overall-overlay'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
const face: FaceLandmarksPayload = {
  version: 1, source: 'mediapipe-face-landmarker', confidence: .98,
  image: { width: 1600, height: 900 },
  anchors: {
    forehead: { x: .5, y: .2 }, chin: { x: .5, y: .8 },
    leftEyeOuter: { x: .45, y: .4 }, rightEyeOuter: { x: .55, y: .4 },
    mouthLeft: { x: .47, y: .65 }, mouthRight: { x: .53, y: .65 },
    mouthCenter: { x: .5, y: .65 }, noseTip: { x: .5, y: .5 },
  },
  contours: { faceOutline: Array.from({ length: 15 }, (_, i) => ({ x: .5 + .1 * Math.cos(i / 15 * 2 * Math.PI), y: .5 + .3 * Math.sin(i / 15 * 2 * Math.PI) })) },
}
test('uses all Overall geometry while excluding the PSL label', () => {
  const overlay = resolveShareOverallOverlay(face, 1080, 1920)
  expect(overlay.map(p => p.id)).toEqual(['face-region', 'face-outline', 'center-axis', 'eye-line', 'mouth-line', 'forehead', 'left-eye', 'right-eye', 'mouth', 'chin'])
  const axis = overlay.find(p => p.id === 'center-axis')!
  if (axis.kind !== 'line') throw new Error('Expected center axis')
  expect(axis.fromPoint.x).toBeCloseTo(540)
  expect(axis.fromPoint.y).toBeCloseTo(384)
  expect(axis.toPoint.x).toBeCloseTo(540)
  expect(axis.toPoint.y).toBeCloseTo(1536)
  const eyes = overlay.find(p => p.id === 'eye-line')!
  if (eyes.kind !== 'line') throw new Error('Expected eye line')
  expect(eyes.toPoint.x - eyes.fromPoint.x).toBeCloseTo(.1 * 1600 * 1920 / 900)
})
test('unusable landmarks never produce guessed share geometry', () => {
  expect(resolveShareOverallOverlay(null, 1080, 1920)).toEqual([])
  expect(resolveShareOverallOverlay({ ...face, confidence: .1 }, 1080, 1920)).toEqual([])
})
