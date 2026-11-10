import { expect, test } from 'bun:test'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { portraitEffectsSchema, portraitLightingSchema, portraitLightGeometry, warpDestinationPoint, warpSourcePoint, type PortraitWarp } from './video-portrait-effects'
import { drawPhotoStudy, photoStudyGesture, photoStudyRegions, warpStudyOverlay } from './video-photo-study'
import type { ReportOverlay } from './report-overlay'
import type { CanvasNode } from './canvas-layout'
import { faceRegionContours } from './video-face-treatment'
import { compileAnalysisVideo, compositionSchema } from './video-composition'
import { portraitEffectsLab } from './video-subject-studies'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'

const landmarks: FaceLandmarksPayload = {
  version: 1, source: 'mediapipe-face-landmarker', confidence: .95, image: { width: 1200, height: 1800 },
  anchors: { leftPupil: { x: .35, y: .4 }, rightPupil: { x: .65, y: .4 }, leftBrow: { x: .35, y: .35 }, rightBrow: { x: .65, y: .35 }, noseTip: { x: .5, y: .55 }, noseBridge: { x: .5, y: .42 }, leftCheek: { x: .25, y: .55 }, rightCheek: { x: .75, y: .55 }, forehead: { x: .5, y: .2 }, chin: { x: .5, y: .8 }, jawLeft: { x: .3, y: .7 }, jawRight: { x: .7, y: .7 }, mouthCenter: { x: .5, y: .65 }, mouthLeft: { x: .4, y: .65 }, mouthRight: { x: .6, y: .65 }, lowerLip: { x: .5, y: .68 }, leftEyeOuter: { x: .3, y: .4 }, rightEyeOuter: { x: .7, y: .4 } },
  contours: { faceOutline: [{ x: .3, y: .2 }, { x: .7, y: .2 }, { x: .8, y: .55 }, { x: .5, y: .8 }, { x: .2, y: .55 }], noseBridge: [{ x: .48, y: .42 }, { x: .52, y: .42 }], noseBase: [{ x: .45, y: .55 }, { x: .55, y: .55 }] },
}

test('liquify tools have compact support, preserve the source at rest and invert for exact cursor tracking', () => {
  for (const mode of ['pinch', 'stretch', 'drag'] as const) for (const axis of ['both', 'x', 'y'] as const) for (const strength of [-.25, .25]) {
    const warp: PortraitWarp = { mode, axis, strengths: [strength], regions: [{ x: .5, y: .5, rx: .2, ry: .15 }] }
    expect(warpSourcePoint({ x: .1, y: .1 }, warp)).toEqual({ x: .1, y: .1 })
    expect(warpSourcePoint({ x: .7, y: .5 }, warp)).toEqual({ x: .7, y: .5 })
    const source = { x: .55, y: .52 }, destination = warpDestinationPoint(source, warp), sample = warpSourcePoint(destination, warp)
    expect(sample.x).toBeCloseTo(source.x, 9); expect(sample.y).toBeCloseTo(source.y, 9)
    if (axis === 'x') expect(destination.y).toBe(source.y)
    if (axis === 'y') expect(destination.x).toBe(source.x)
    expect(warpSourcePoint(source, { ...warp, strengths: [0] })).toEqual(source)
  }
})

test('all seven feature tools use real anchors, preserve pixel aspect and reject missing geometry', () => {
  for (const feature of ['nose', 'cheeks', 'face-width', 'jaw', 'eyes', 'lips', 'brows'] as const) {
    const regions = photoStudyRegions(landmarks, feature)
    expect(regions.length).toBeGreaterThan(0)
    expect(regions.every(region => region.rx > 0 && region.ry > 0)).toBe(true)
    expect(() => photoStudyRegions({ ...landmarks, quality: { score: .9, yawRadians: .9 } }, feature)).toThrow('near-frontal')
  }
  const portrait = photoStudyRegions(landmarks, 'nose')[0], square = photoStudyRegions({ ...landmarks, image: { width: 1200, height: 1200 } }, 'nose')[0]
  expect(portrait.rx).toBe(square.rx)
  expect(portrait.ry * 1800).toBeCloseTo(square.ry * 1200)
  for (const feature of ['jaw', 'lips', 'brows'] as const) expect(() => photoStudyRegions({ ...landmarks, anchors: { leftPupil: landmarks.anchors.leftPupil, rightPupil: landmarks.anchors.rightPupil, noseTip: landmarks.anchors.noseTip } }, feature)).toThrow('anchors')
})

test('the cursor grabs the actual warped point, edits paired anchors in sequence and releases to the original', () => {
  const study = { feature: 'cheeks' as const, amount: .24, mode: 'stretch' as const }, regions = photoStudyRegions(landmarks, study.feature)
  expect(photoStudyGesture(study, regions, 0, 5000).warp.strengths).toEqual([0, 0])
  expect(photoStudyGesture(study, regions, 5000, 5000).warp.strengths).toEqual([0, 0])
  const first = photoStudyGesture(study, regions, 1000, 5000), second = photoStudyGesture(study, regions, 2000, 5000)
  expect(first.pressed).toBe(true); expect(second.pressed).toBe(true)
  expect(first.warp.strengths[0]).toBeGreaterThan(0); expect(first.warp.strengths[1]).toBe(0)
  expect(second.warp.strengths[1]).toBeGreaterThan(0)
  for (const time of [600, 1000, 1500, 1800, 3000, 4700]) {
    const gesture = photoStudyGesture(study, regions, time, 5000)
    const source = warpSourcePoint(gesture.target, gesture.warp)
    expect(source.x).toBeCloseTo(gesture.grab.x, 9); expect(source.y).toBeCloseTo(gesture.grab.y, 9)
    expect(gesture).toEqual(photoStudyGesture(study, regions, time, 5000))
  }
  expect(photoStudyGesture(study, regions, 1000, 5000, true)).toEqual(photoStudyGesture(study, regions, 4000, 5000, true))
  expect(photoStudyGesture({ ...study, cursor: false }, regions, 1000, 5000).opacity).toBe(0)
})

test('edited contours, anchors, markers and facial boundaries follow the exact pixel warp without changing the source geometry', () => {
  const point = { x: 198, y: 312 }, outside = { x: 18, y: 30 }
  const overlay: ReportOverlay = { size: { width: 360, height: 540 }, dots: [{ ...point, band: 2 }], faceBoundary: [point, outside], measurement: { kind: 'symmetry', anchors: { noseTip: point, forehead: outside } }, primitives: [{ id: 'nose', kind: 'polyline', points: [], pixelPoints: [outside, point, { x: 200, y: 315 }], closed: false }, { id: 'anchor', kind: 'point', at: { anchor: 'noseTip' }, point }] }
  const original = structuredClone(overlay)
  for (const mode of ['pinch', 'stretch', 'drag'] as const) for (const axis of ['x', 'y', 'both'] as const) {
    const warp: PortraitWarp = { mode, axis, regions: [{ x: .5, y: .55, rx: .2, ry: .18 }], strengths: [.24] }, moved = warpStudyOverlay(overlay, warp)
    const sample = warpSourcePoint({ x: moved.measurement!.anchors.noseTip!.x / 360, y: moved.measurement!.anchors.noseTip!.y / 540 }, warp)
    expect(sample.x).toBeCloseTo(point.x / 360, 9)
    expect(sample.y).toBeCloseTo(point.y / 540, 9)
    expect(moved.faceBoundary![0]).toEqual(moved.measurement!.anchors.noseTip!)
    expect(moved.dots[0]).toEqual({ ...moved.faceBoundary![0], band: 2 })
    const contour = moved.primitives[0]
    expect(contour.kind === 'polyline' && contour.pixelPoints[1]).toEqual(moved.faceBoundary![0])
    const marker = moved.primitives[1]
    expect(marker.kind === 'point' && marker.point).toEqual(moved.faceBoundary![0])
    expect(moved.faceBoundary![1]).toEqual(outside)
    expect(warpStudyOverlay(overlay, { ...warp, strengths: [0] })).toBe(overlay)
  }
  expect(overlay).toEqual(original)
})

test('photo edits expose an independently targetable outline node even when the cursor is disabled', () => {
  const nodes: CanvasNode[] = [], overlay: ReportOverlay = { size: { width: 360, height: 540 }, primitives: [], dots: [] }
  drawPhotoStudy({ drawImage() {} } as unknown as CanvasRenderingContext2D, { width: 1200, height: 1800 } as HTMLImageElement, landmarks, { feature: 'nose', amount: .2, cursor: false }, 2000, 5000, true, { overlay, measuring: true, paint: (_ctx, node) => { nodes.push(node) } })
  expect(nodes.map(node => node.id)).toEqual(['overlay'])
  expect(nodes[0].frame).toEqual({ x: 0, y: 0, width: 1200, height: 1800 })
})

test('light targets follow registered anatomical anchors and the head field includes hair rather than only facial skin', () => {
  const left = portraitLightGeometry(landmarks, portraitLightingSchema.parse({ target: 'cheeks', side: 'left' }))
  const right = portraitLightGeometry(landmarks, portraitLightingSchema.parse({ target: 'cheeks', side: 'right' }))
  expect(left.target).toEqual([.25, .55]); expect(right.target).toEqual([.75, .55])
  expect(left.head[1] - left.head[3]).toBeLessThan(landmarks.anchors.forehead!.y)
  expect(left.head[2]).toBeGreaterThan(left.face[2])
  for (const target of ['eyes', 'nose', 'jaw', 'mouth', 'hair', 'whole'] as const) expect(portraitLightGeometry(landmarks, portraitLightingSchema.parse({ target })).target.every(Number.isFinite)).toBe(true)
  expect(() => portraitLightGeometry(null, portraitLightingSchema.parse({}))).toThrow('anchors')
  expect(() => portraitLightGeometry({ ...landmarks, confidence: .2 }, portraitLightingSchema.parse({}))).toThrow('reliable')
  expect(() => portraitLightingSchema.parse({ intensity: 20 })).toThrow()
  expect(() => portraitEffectsSchema.parse({ overlay: { opacity: 0 } })).toThrow()
})

test('editorial zones use detected anatomy, fail closed without anchors and select the explanatory category', () => {
  expect(faceRegionContours(landmarks, 'overall')).toHaveLength(5)
  expect(faceRegionContours(landmarks, 'cheeks').map(region => region.id)).toEqual(['left-cheek', 'right-cheek'])
  expect(faceRegionContours({ ...landmarks, anchors: {} }, 'cheeks')).toHaveLength(0)
  expect(faceRegionContours({ ...landmarks, confidence: .2 }, 'overall')).toHaveLength(0)
})

test('effect directions survive compilation and JSON without changing script words or report scores', () => {
  const input = { formatId: 'feature-audit', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', productFeatures: [] } as unknown as AnalysisPostInput
  const example = portraitEffectsLab
  const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, ['johnson-front'], 'brand', [], { recipe: example.recipe, directions: example.directions })
  expect(composition.scenes.filter(scene => scene.portraitFX?.lighting)).toHaveLength(3)
  expect(new Set(composition.scenes.flatMap(scene => scene.photoStudy ? [scene.photoStudy.mode] : []))).toEqual(new Set(['pinch', 'stretch', 'drag']))
  expect(compositionSchema.parse(JSON.parse(JSON.stringify(composition)))).toEqual(composition)
  const report = composition.scenes.find(scene => scene.source.kind === 'report')!
  expect(report.source.currentScore).toBe(7.1)
  report.portraitFX = portraitEffectsSchema.parse({ lighting: {} })
  expect(() => compositionSchema.parse(composition)).toThrow('only to portrait')
})
