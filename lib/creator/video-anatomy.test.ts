import { videoSize } from './video-layout'
import { expect, test } from 'bun:test'
import { anatomyAlphaBounds, anatomyMotion, anatomyStageFrame, deformBonePoint, registeredHeadFrame, registeredHeadOrientation } from './video-anatomy'
import type { ReportOverlay } from './report-overlay'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

test('bone variations are bounded, local, symmetric and reversible rather than whole-object scaling', () => {
  const near = { x: .27, y: -.03, z: .25 }, far = { x: .27, y: .5, z: -.5 }
  expect(deformBonePoint(near, 'cheeks', 0)).toEqual(near)
  const fuller = deformBonePoint(near, 'cheeks', .5), slimmer = deformBonePoint(near, 'cheeks', -.5)
  expect(fuller.x - near.x).toBeCloseTo(near.x - slimmer.x)
  expect(fuller.x - near.x).toBeGreaterThan(deformBonePoint(far, 'cheeks', .5).x - far.x)
  expect(deformBonePoint({ ...near, x: -near.x }, 'cheeks', .5).x).toBeCloseTo(-fuller.x)
  expect(deformBonePoint(near, 'whole', 1).x).toBeCloseTo(near.x * 1.12)
  expect(deformBonePoint(near, 'whole', 100)).toEqual(deformBonePoint(near, 'whole', 1))
})

test('anatomy reveals at the face then moves to a centered inspection stage without returning between anatomy cuts', () => {
  const registration = { frame: { x: 180, y: 250, width: 500, height: 750 }, reveal: true }
  expect(anatomyStageFrame(registration, 0, 4000)).toEqual(registration.frame)
  const center = anatomyStageFrame(registration, 4000, 4000)
  expect(center.x + center.width / 2).toBe(videoSize.width / 2)
  expect(center.y + center.height / 2).toBe(1100)
  expect(center.width).toBeGreaterThan(registration.frame.width)
  expect(anatomyStageFrame({ ...registration, reveal: false }, 0, 4000)).toEqual(center)
  expect(anatomyStageFrame(registration, 1500, 4000)).toEqual(anatomyStageFrame(registration, 1500, 4000))
})

test('anatomy registration follows the photographed head rather than a fixed graphic slot', () => {
  const overlay: ReportOverlay = { size: { width: 360, height: 500 }, primitives: [], dots: [], faceBoundary: [{ x: 100, y: 100 }, { x: 260, y: 100 }, { x: 260, y: 350 }, { x: 100, y: 350 }] }
  const placement = { a: 1080, b: 0, c: 0, d: 1500, e: -40, f: 80 }
  const frame = registeredHeadFrame(overlay, placement)!
  expect(frame.x + frame.width / 2).toBeCloseTo(500)
  expect(frame.y + frame.height).toBeCloseTo(1115)
  expect(frame.width).toBeLessThan(480)
  const moved = registeredHeadFrame(overlay, { ...placement, e: 60, f: 280 })!
  expect(moved.x - frame.x).toBeCloseTo(100)
  expect(moved.y - frame.y).toBeCloseTo(200)
  expect(moved.width).toBe(frame.width)
  expect(registeredHeadFrame({ ...overlay, faceBoundary: [] }, placement)).toBeUndefined()
})

test('skull registration starts at the source yaw and eye-line roll regardless of anchor naming', () => {
  const landmarks = { image: { width: 1000, height: 1000 }, anchors: { leftPupil: { x: .35, y: .4 }, rightPupil: { x: .65, y: .43 }, noseTip: { x: .56, y: .58 } } } as FaceLandmarksPayload
  const pose = registeredHeadOrientation(landmarks)
  expect(pose.yaw).toBeGreaterThan(0)
  expect(pose.roll).toBeCloseTo(-Math.atan2(30, 300))
  expect(registeredHeadOrientation({ ...landmarks, anchors: { ...landmarks.anchors, leftPupil: landmarks.anchors.rightPupil, rightPupil: landmarks.anchors.leftPupil } })).toEqual(pose)
  expect(registeredHeadOrientation({ ...landmarks, quality: { score: 1, yawRadians: -.3, rollRadians: .2 } })).toEqual({ yaw: -.3, roll: -.2 })
  expect(registeredHeadOrientation()).toEqual({ yaw: 0, roll: 0 })
  expect(anatomyMotion(0, 4000, { action: 'reveal' }).yaw).toBe(0)
})

test('visible alpha bounds exclude transparent renderer padding and account for WebGL row order', () => {
  const pixels = new Uint8Array(8 * 10 * 4)
  for (let row = 2; row < 7; row++) for (let column = 1; column < 6; column++) pixels[(row * 8 + column) * 4 + 3] = 255
  expect(anatomyAlphaBounds(pixels, 8, 10)).toEqual({ x: 1, y: 3, width: 5, height: 5 })
})

test('regional anatomy motions zoom, turn, isolate and cut away deterministically without deforming the mesh', () => {
  for (const action of ['reveal', 'focus', 'isolate', 'cutaway'] as const) {
    const pose = { focus: 'jaw' as const, action }
    const start = anatomyMotion(0, 4000, pose), middle = anatomyMotion(2000, 4000, pose), end = anatomyMotion(4000, 4000, pose)
    expect(start).toEqual(end)
    expect(middle).toEqual(anatomyMotion(2000, 4000, pose))
    expect(middle.zoom).toBe(action === 'reveal' ? 1 : 1.22)
    expect(middle.cutaway).toBe(['isolate', 'cutaway'].includes(action) ? 1 : 0)
    expect(anatomyMotion(0, 4000, pose, true)).toEqual(anatomyMotion(3000, 4000, pose, true))
  }
})
