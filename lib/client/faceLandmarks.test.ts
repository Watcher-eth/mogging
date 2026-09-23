import { describe, expect, test } from 'bun:test'
import { landmarksFromFaces } from './faceLandmarks'

const image = { width: 1000, height: 2000 }
function detectedFace() {
  const points = Array.from({ length: 478 }, (_, index) => ({ x: .3 + (index % 10) * .03, y: .3 + (index % 7) * .03 }))
  points[468] = { x: .3, y: .3 }
  points[473] = { x: .5, y: .4 }
  return points
}

describe('local face detection', () => {
  test('distinguishes no face from ambiguous multiple faces', () => {
    expect(landmarksFromFaces([], image).status).toBe('no-face')
    expect(landmarksFromFaces([detectedFace(), detectedFace()], image).status).toBe('multiple-faces')
  })
  test('calculates roll in physical pixels rather than normalized square coordinates', () => {
    const result = landmarksFromFaces([detectedFace()], image)
    expect(result.status).toBe('detected')
    if (result.status !== 'detected') throw new Error('Expected detection')
    expect(result.landmarks.quality?.rollRadians).toBeCloseTo(Math.PI / 4)
    expect(result.landmarks.anchors.leftPupil).toEqual({ x: .3, y: .3 })
  })
  test('drops a broken contour without shifting the remaining vertex indices', () => {
    const points = detectedFace()
    points[246] = { x: NaN, y: .4 }
    points[1] = { x: 2, y: .5 }
    const result = landmarksFromFaces([points], image)
    if (result.status !== 'detected') throw new Error('Expected detection')
    expect(result.landmarks.contours?.leftEye).toEqual([])
    expect(result.landmarks.anchors.noseTip).toBeUndefined()
    expect(result.landmarks.contours?.rightEye?.length).toBeGreaterThan(0)
  })
})
