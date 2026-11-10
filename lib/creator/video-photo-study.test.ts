import { expect, test } from 'bun:test'
import { photoStudyRegions, photoStudySchema, photoStudyGesture } from './video-photo-study'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { compileAnalysisVideo, compositionSchema } from './video-composition'
import { buildAnalysisPost, type AnalysisPostInput } from './analysis-post'

const landmarks = { confidence: .95, anchors: { leftPupil: { x: .35, y: .4 }, rightPupil: { x: .65, y: .4 }, noseTip: { x: .5, y: .55 }, leftCheek: { x: .25, y: .55 }, rightCheek: { x: .75, y: .55 }, forehead: { x: .5, y: .2 }, chin: { x: .5, y: .8 } } } as FaceLandmarksPayload

test('image studies round-trip authored settings but cannot alter report scenes', () => {
  const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Test', hook: 'Mapped', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: 'Mogging' }
  const composition = compileAnalysisVideo(buildAnalysisPost(input), input, ['face'], 'brand', [])
  const scene = composition.scenes[0]
  scene.source.kind = 'portrait'
  scene.photoStudy = { feature: 'nose', amount: .12 }
  expect(compositionSchema.parse(composition).scenes[0].photoStudy).toEqual(scene.photoStudy)
  scene.source.kind = 'report'
  expect(() => compositionSchema.parse(composition)).toThrow('never report measurements')
})

test('image variations use detected local regions and reject missing or unreliable anchors', () => {
  expect(photoStudyRegions(landmarks, 'nose')).toHaveLength(1)
  expect(photoStudyRegions(landmarks, 'cheeks')).toHaveLength(2)
  expect(photoStudyRegions(landmarks, 'face-width')[0].ry).toBeGreaterThan(.4)
  expect(() => photoStudyRegions(null, 'nose')).toThrow('anchors')
  expect(() => photoStudyRegions({ ...landmarks, confidence: .2 }, 'nose')).toThrow('clear')
  expect(() => photoStudyRegions({ ...landmarks, anchors: { ...landmarks.anchors, leftCheek: undefined } }, 'cheeks')).toThrow('cheek')
})

const progress = (time: number, duration: number, reduced = false) => photoStudyGesture({ feature: 'nose', amount: .06 }, photoStudyRegions(landmarks, 'nose'), time, duration, reduced).warp.strengths[0] / .06

test('study animation returns to the untouched original and is deterministic when seeking', () => {
  expect(photoStudyGesture({ feature: 'nose', amount: .25 }, photoStudyRegions(landmarks, 'nose'), 2000, 4000).warp.strengths[0]).toBe(.08)
  expect(progress(0, 4000)).toBe(0)
  expect(progress(2000, 4000)).toBe(1)
  expect(progress(4000, 4000)).toBe(0)
  expect(progress(1500, 4000)).toBe(progress(1500, 4000))
  expect(progress(0, 4000, true)).toBe(progress(3000, 4000, true))
  expect(() => photoStudySchema.parse({ feature: 'nose', amount: 2 })).toThrow()
  expect(photoStudySchema.parse({ feature: 'nose', amount: -.15 }).amount).toBe(-.15)
})
