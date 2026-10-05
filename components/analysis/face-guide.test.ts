import { describe, expect, test } from 'bun:test'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { defaultFaceGuide, getFaceGuide } from './face-guide'

const face: FaceLandmarksPayload = {
  version: 1,
  source: 'mediapipe-face-landmarker',
  confidence: 1,
  image: { width: 360, height: 640 },
  anchors: { forehead: { x: 0.5, y: 0.2 }, chin: { x: 0.5, y: 0.7 } },
  contours: { faceOutline: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.3, y: 0.65 }, { x: 0.7, y: 0.65 }] },
}
const centered = { x: 50, y: 50, scale: 1 }

describe('uploaded face guide', () => {
  test('encloses the forehead, chin, and all facial contour points', () => {
    const guide = getFaceGuide(face, centered)
    const points = [...face.contours!.faceOutline!, face.anchors.forehead!, face.anchors.chin!]
    for (const point of points) {
      expect(Math.hypot((point.x * 360 - guide.cx) / guide.rx, (point.y * 640 - guide.cy) / guide.ry)).toBeLessThan(1)
    }
  })

  test('tracks the image crop and zoom for a landscape upload', () => {
    const landscape = { ...face, image: { width: 1280, height: 640 } }
    const guide = getFaceGuide(landscape, { x: 25, y: 50, scale: 1.5 })
    // Cover crops 920px horizontally at 25%; zoom pivots at x=90, y=320.
    expect(guide.cx).toBeCloseTo(570)
    expect(guide.cy).toBeCloseTo(272)
    const unzoomed = getFaceGuide(landscape, { x: 25, y: 50, scale: 1 })
    expect(guide.rx - 8).toBeCloseTo((unzoomed.rx - 8) * 1.5)
    expect(guide.ry - 8).toBeCloseTo((unzoomed.ry - 8) * 1.5)
  })

  test('keeps the initial guide until usable landmarks arrive', () => {
    expect(getFaceGuide(null, centered)).toEqual(defaultFaceGuide)
    expect(getFaceGuide({ ...face, anchors: {}, contours: {} }, centered)).toEqual(defaultFaceGuide)
  })
})
