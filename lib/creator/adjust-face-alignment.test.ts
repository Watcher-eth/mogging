import { describe, expect, test } from 'bun:test'
import { adjustFaceAlignment } from './adjust-face-alignment'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

const face: FaceLandmarksPayload = {
  version: 1, source: 'mediapipe-face-landmarker', confidence: 0.9,
  image: { width: 1000, height: 1000 },
  anchors: { noseTip: { x: 0.5, y: 0.5 }, chin: { x: 0.5, y: 0.9 } },
  contours: { noseBase: [{ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.5 }, { x: 0.8, y: 0.5 }] },
}

describe('manual face alignment', () => {
  test('moves nearby contour geometry without moving distant points or mutating the baseline', () => {
    const before = structuredClone(face)
    const result = adjustFaceAlignment(face, 'noseTip', { x: 0.55, y: 0.52 })
    expect(result.anchors.noseTip).toEqual({ x: 0.55, y: 0.52 })
    expect(result.contours?.noseBase?.[0]).toEqual(result.anchors.noseTip)
    expect(result.contours?.noseBase?.[1].x).toBeGreaterThan(0.55)
    expect(result.contours?.noseBase?.[2]).toEqual(face.contours?.noseBase?.[2])
    expect(result.anchors.chin).toEqual(face.anchors.chin)
    expect(face).toEqual(before)
  })

  test('clamps off-image dragging and rejects invalid coordinates', () => {
    const result = adjustFaceAlignment(face, 'noseTip', { x: -1, y: 2 })
    expect(result.anchors.noseTip).toEqual({ x: 0, y: 1 })
    for (const point of result.contours?.noseBase ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    }
    expect(adjustFaceAlignment(face, 'noseTip', { x: NaN, y: 0 })).toBe(face)
  })

  test('preserves corrections through the preview/export landmark normalization', () => {
    const result = adjustFaceAlignment(face, 'noseTip', { x: 0.54, y: 0.51 })
    const normalized = enrichFaceLandmarks(result)
    expect(normalized?.anchors.noseTip).toEqual(result.anchors.noseTip)
    expect(normalized?.contours?.noseBase?.[0]).toEqual(result.contours?.noseBase?.[0])
  })
})
