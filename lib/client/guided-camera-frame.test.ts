import { expect, test } from 'bun:test'
import { frontGuideCoverage, guidedCameraFrame, guidedFaceAlignment } from './guided-camera-frame'

const portraitCamera = {
  videoWidth: 720,
  videoHeight: 960,
  clientWidth: 390,
  clientHeight: 680,
} as HTMLVideoElement

test('the mobile preview fits the entire camera frame until the user zooms', () => {
  const normal = guidedCameraFrame(portraitCamera, 1)
  const zoomed = guidedCameraFrame(portraitCamera, 1.8)
  expect(normal.width).toBe(1)
  expect(normal.height).toBeLessThan(1)
  expect(zoomed.width).toBeCloseTo(1.8)
  expect(zoomed.height).toBeCloseTo(normal.height * 1.8)
})

test('a partly overlapping face can start the scan and the same face too far to one side cannot', () => {
  const frame = guidedCameraFrame(portraitCamera, 1)
  const face = { centerX: .75, centerY: .45, width: .47, height: .42 }
  const partlyInside = guidedFaceAlignment(face, frame)
  expect(partlyInside.x).toBeCloseTo(.25)
  expect(partlyInside.coverage).toBeGreaterThanOrEqual(frontGuideCoverage)
  expect(partlyInside.coverage).toBeLessThan(1)
  expect(guidedFaceAlignment({ ...face, centerX: .78 }, frame).coverage).toBeLessThan(frontGuideCoverage)
})
