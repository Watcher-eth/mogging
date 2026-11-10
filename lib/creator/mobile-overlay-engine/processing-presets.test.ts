import { expect, test } from 'bun:test'
import { processingOverlaySteps } from './processing-presets'
import { getReportOverlayPreset } from './report-presets'
import { resolveOverlayPreset } from './resolve'

test('loading loops cover distinct report categories without result claims or blank phases', () => {
  expect(processingOverlaySteps.map(step => step.categoryId)).toEqual(['eyes', 'symmetry', 'jaw', 'nose', 'proportions', 'overall'])
  expect(new Set(processingOverlaySteps.map(step => step.label)).size).toBe(processingOverlaySteps.length)
  expect(processingOverlaySteps.every(step => !/balanced|ideal|score|rated/i.test(step.label))).toBe(true)
})

test('loading categories never draw demo coordinates when a real face has no anchors', () => {
  for (const step of processingOverlaySteps) {
    const preset = getReportOverlayPreset(step.categoryId)
    if (!preset) continue
    const resolved = resolveOverlayPreset({ preset, landmarks: { version: 1, source: 'mediapipe-face-landmarker', confidence: 1, image: { width: 360, height: 640 }, anchors: {} }, viewport: { width: 360, height: 640 }, fit: 'contain' })
    expect(resolved.primitives).toEqual([])
  }
})
