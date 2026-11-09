import { expect, test } from 'bun:test'
import { resolveOverlayPreset } from './mobile-overlay-engine/resolve'
import type { FaceLandmarksPayload } from './mobile-overlay-engine/landmarks'
import { getSideReportOverlay } from './profile-report-overlay'
import { sampleProfileGuides, sampleProfilePhoto } from './profile-report-sample'

const image = { src: sampleProfilePhoto, width: 540, height: 960 }

test('sample jaw, eye and cheek guides use their own contours and drawing styles', () => {
  const jaw = getSideReportOverlay('jaw', image, null, null, sampleProfilePhoto)!
  const eye = getSideReportOverlay('eyes', image, null, null, sampleProfilePhoto)!
  const cheek = getSideReportOverlay('cheeks', image, null, null, sampleProfilePhoto)!
  expect(jaw.primitives).toContainEqual(expect.objectContaining({ id: 'jaw-angle', dashed: false }))
  expect(jaw.primitives).toContainEqual(expect.objectContaining({ id: 'jaw-axis-upper', dashed: true }))
  expect(eye.primitives).toEqual([expect.objectContaining({ id: 'eyelid', dotted: true, closed: true })])
  expect(cheek.primitives).toContainEqual(expect.objectContaining({ kind: 'region', fillOpacity: .13 }))
  const resolved = resolveOverlayPreset({ preset: eye, landmarks: null, imageSize: image, viewport: { width: 640, height: 480 }, fit: 'contain' })
  const eyelid = resolved.primitives[0]
  if (eyelid.kind !== 'polyline') throw new Error('Missing projected eyelid')
  expect(eyelid.pixelPoints[0].x).toBeCloseTo(185 + sampleProfileGuides.eye[0].x * 270)
  expect(eyelid.pixelPoints[0].y).toBeCloseTo(sampleProfileGuides.eye[0].y * 480)
})

test('a full profile with only segmentation keeps its outline without guessing feature locations', () => {
  const silhouette = {
    facing: 'left' as const,
    outline: sampleProfileGuides.outline,
    skin: sampleProfileGuides.skin,
    hair: sampleProfileGuides.hair,
  }
  const source = 'data:image/jpeg;base64,uploaded'
  const overall = getSideReportOverlay('overall', image, null, silhouette, source)
  expect(overall?.primitives).toContainEqual(expect.objectContaining({
    id: 'profile-outline', points: silhouette.outline.map(point => ({ point })),
  }))
  expect(getSideReportOverlay('skin', image, null, silhouette, source)).toBeNull()
  expect(getSideReportOverlay('eyes', image, null, silhouette, source)).toBeNull()
  expect(getSideReportOverlay('symmetry', image, null, silhouette, source)).toBeNull()
})

test('skin dots reveal from under the eye down to the jaw with one delay per dot', () => {
  const skin = getSideReportOverlay('skin', image, null, null, sampleProfilePhoto)!
  const dots = skin.primitives.flatMap(primitive => primitive.kind === 'point' && 'point' in primitive.at ? [primitive] : [])
  expect(dots).toHaveLength(26)
  const points = dots.flatMap(dot => 'point' in dot.at ? [dot.at.point] : [])
  expect(points[0].y).toBeGreaterThan(Math.max(...sampleProfileGuides.eye.map(point => point.y)))
  expect(points[0].x).toBeLessThan(Math.max(...sampleProfileGuides.eye.map(point => point.x)))
  expect(points.at(-1)!.y).toBeGreaterThan(Math.max(...sampleProfileGuides.lowerCheek.map(point => point.y)))
  expect(points.at(-1)!.y).toBeLessThan(Math.max(...sampleProfileGuides.jaw.map(point => point.y)))
  expect(dots.map(dot => dot.animation?.delay)).toEqual(Array.from({ length: 26 }, (_, index) => 85 + 28 * index))
})

test('a detected side photo maps the near eye, brow, cheek and lip half in either direction', () => {
  const guide = sampleProfileGuides
  const [upperLip, upperMid, upperOuter, corner, lowerOuter, lowerMid, lowerLip] = guide.lips
  const hiddenCorner = { x: upperLip.x - .02, y: corner.y }
  const face: FaceLandmarksPayload = {
    version: 1, source: 'mediapipe-face-landmarker', confidence: 1, image,
    anchors: {
      noseTip: guide.nose[5], noseBridge: guide.nose[0], leftCheek: guide.cheek[0], rightCheek: guide.nose[1],
      chin: guide.jaw[7], upperLip, lowerLip, mouthLeft: corner, mouthRight: hiddenCorner,
    },
    contours: {
      leftEye: guide.eye, rightEye: guide.eye.map(point => ({ ...point, x: point.x - .06 })),
      leftBrow: guide.brow, rightBrow: guide.brow.map(point => ({ ...point, x: point.x - .06 })),
      leftCheekbone: guide.cheek, rightCheekbone: guide.cheek.map(point => ({ ...point, x: point.x - .2 })),
      mouth: [upperLip, upperMid, upperOuter, corner, lowerOuter, lowerMid, lowerLip, hiddenCorner],
    },
  }
  for (const facing of ['left', 'right'] as const) {
    const reflect = (point: { x: number; y: number }) => facing === 'left' ? point : { ...point, x: 1 - point.x }
    const mirroredFace = {
      ...face,
      anchors: Object.fromEntries(Object.entries(face.anchors).map(([key, point]) => [key, reflect(point)])),
      contours: Object.fromEntries(Object.entries(face.contours!).map(([key, points]) => [key, points.map(reflect)])),
    }
    for (const [category, id, points] of [
      ['eyes', 'eyelid', guide.eye], ['brows', 'brow-outline', guide.brow], ['cheeks', 'cheek-ridge', guide.cheek],
      ['mouth', 'lip-contour', [upperLip, upperMid, upperOuter, corner, lowerOuter, lowerMid, lowerLip]],
    ] as const) {
      const overlay = getSideReportOverlay(category, image, mirroredFace, null, 'uploaded')
      expect(overlay?.primitives).toContainEqual(expect.objectContaining({ id, points: points.map(point => ({ point: reflect(point) })) }))
    }
  }
})
