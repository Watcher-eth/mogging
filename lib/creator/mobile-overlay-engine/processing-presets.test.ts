import { expect, test } from 'bun:test'
import type { FaceLandmarksPayload } from './landmarks'
import { processingOverlayPresets } from './processing-presets'
import { resolveOverlayPreset } from './resolve'

const landmarks: FaceLandmarksPayload = {
  version: 1, source: 'mediapipe-face-landmarker', confidence: 1,
  image: { width: 360, height: 640 },
  anchors: { noseTip: { x: .61, y: .52 } },
}

test('paywall nose marker follows the uploaded face through the wide cover crop', () => {
  const preset = processingOverlayPresets.find(preset => preset.id === 'processing-nose')!
  const overlay = resolveOverlayPreset({ preset, landmarks, viewport: { width: 500, height: 340 } })
  const dot = overlay.primitives.find(primitive => primitive.id === 'nose-dot')
  expect(dot?.kind).toBe('point')
  if (dot?.kind !== 'point') throw new Error('Missing nose marker')
  expect(dot.point.x).toBeCloseTo(305)
  expect(dot.point.y).toBeCloseTo(187.7777778)
})

test('scan presets never place demo overlays on a real face with missing measurements', () => {
  for (const preset of processingOverlayPresets) {
    const overlay = resolveOverlayPreset({ preset, landmarks: { ...landmarks, anchors: {} }, viewport: { width: 360, height: 450 } })
    expect(overlay.primitives).toEqual([])
  }
})
