import { expect, test } from 'bun:test'
import { faceMetricGuides, faceMetricAreas, metricFaceOverlay, narratedFaceMetric } from './face-metric-guides'
import { compileAnalysisVideo } from './video-composition'
import { creatorSubjects } from './creator-catalog'
import { reportCategories } from './mock-report-data'
import { scriptToPlan } from './script-edit'
import type { FaceLandmarksPayload } from './mobile-overlay-engine/landmarks'
import type { ReportOverlay } from './report-overlay'
import type { AnalysisPostInput } from './analysis-post'
const ellipse = (x: number, y: number, rx: number, ry: number) => Array.from({ length: 16 }, (_, index) => ({ x: x + Math.cos(index / 15 * Math.PI * 2) * rx, y: y + Math.sin(index / 15 * Math.PI * 2) * ry }))
const face: FaceLandmarksPayload = { version: 1, source: 'mediapipe-face-landmarker', confidence: .98, image: { width: 1200, height: 1800 }, anchors: {
  forehead: { x: .5, y: .15 }, chin: { x: .5, y: .85 }, leftPupil: { x: .35, y: .4 }, rightPupil: { x: .65, y: .4 }, leftEyeOuter: { x: .25, y: .4 }, leftEyeInner: { x: .43, y: .4 }, rightEyeInner: { x: .57, y: .4 }, rightEyeOuter: { x: .75, y: .4 }, leftBrow: { x: .35, y: .32 }, rightBrow: { x: .65, y: .32 }, noseBridge: { x: .5, y: .4 }, noseTip: { x: .5, y: .57 }, mouthLeft: { x: .35, y: .67 }, mouthRight: { x: .65, y: .67 }, mouthCenter: { x: .5, y: .67 }, upperLip: { x: .5, y: .64 }, lowerLip: { x: .5, y: .71 }, leftCheek: { x: .23, y: .54 }, rightCheek: { x: .77, y: .54 }, jawLeft: { x: .25, y: .72 }, jawRight: { x: .75, y: .72 },
}, contours: { faceOutline: ellipse(.5, .5, .3, .35), leftEye: ellipse(.35, .4, .09, .035), rightEye: ellipse(.65, .4, .09, .035), leftBrow: ellipse(.35, .32, .1, .025), rightBrow: ellipse(.65, .32, .1, .025), noseBridge: ellipse(.5, .46, .025, .06), noseBase: ellipse(.5, .57, .08, .03), mouth: ellipse(.5, .67, .15, .04), jawline: Array.from({ length: 15 }, (_, index) => ({ x: .2 + index / 14 * .6, y: .85 - Math.abs(index / 14 - .5) * .3 })), cheekbones: ellipse(.5, .54, .27, .04) } }
const base: ReportOverlay = { size: { width: 360, height: 540 }, dots: [], primitives: [] }

test('the expanded catalog provides distinct registered geometry across nine face areas', () => {
  expect(faceMetricGuides.length).toBeGreaterThanOrEqual(40)
  expect(faceMetricAreas).toHaveLength(9)
  const signatures = new Set<string>()
  for (const metric of faceMetricGuides) {
    const overlay = metricFaceOverlay(base, { width: 1200, height: 1800, landmarks: face }, metric.id)
    expect(overlay.primitives.length).toBeGreaterThan(0)
    const paths = overlay.primitives.flatMap(item => item.kind === 'polyline' ? [item.pixelPoints] : [])
    expect(paths.flat().every(point => Number.isFinite(point.x) && point.x >= 0 && point.x <= 360 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 540)).toBe(true)
    signatures.add(JSON.stringify(paths))
    expect(metricFaceOverlay(base, { width: 1200, height: 1800 }, metric.id).primitives).toEqual([])
  }
  expect(signatures.size).toBeGreaterThanOrEqual(25)
})

test('metric selection follows specific spoken features and fails closed without their anchors', () => {
  expect(narratedFaceMetric('Compare the inner-eye gap.', 'eyes')?.id).toBe('eyes.inner-gap')
  expect(narratedFaceMetric('The nose bridge width.', 'nose')?.id).toBe('nose.bridge-width')
  expect(narratedFaceMetric('Compare the upper and lower lips.', 'mouth')?.id).toBe('mouth.lip-ratio')
  expect(narratedFaceMetric('Compare the eye spacing.', 'jaw')).toBeUndefined()
  expect(narratedFaceMetric('Brows, eyelids and expression all affect attention.', 'brows')).toBeUndefined()
  expect(metricFaceOverlay(base, { width: 1200, height: 1800, landmarks: { ...face, anchors: {} } }, 'eyes.spacing').primitives).toEqual([])
  expect(metricFaceOverlay(base, { width: 1200, height: 1800, landmarks: { ...face, confidence: .2 } }, 'mouth.width').primitives).toEqual([])
})

test('Feature breakdown frames narrated metrics as focused details rather than floating image boards', () => {
  const example = creatorSubjects[0].example
  const input = { formatId: 'feature-audit', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' } as AnalysisPostInput
  const plan = scriptToPlan('Start with the whole face. Compare the eye spacing. Look at the nose width. Compare the lip ratio. Observe the chin height.')
  const composition = compileAnalysisVideo(plan, input, example.images!.map(image => image.id), 'brand', reportCategories, { recipe: 'measurement-explainer' })
  const focused = composition.scenes.filter(scene => scene.focus.startsWith('metric:'))
  expect(focused.length).toBeGreaterThanOrEqual(3)
  expect(focused.every(scene => scene.source.kind === 'portrait' && scene.editorial === 'detail' && !scene.study)).toBe(true)
  expect(focused.map(scene => scene.focus)).toEqual(expect.arrayContaining(['metric:eyes.spacing', 'metric:nose.width', 'metric:mouth.lip-ratio', 'metric:jaw.height']))
})


test('metric rulers distinguish vertical thickness from horizontal length', () => {
  for (const [id, axis] of [['brows.thickness', 'x'], ['brows.length', 'y']] as const) {
    const overlay = metricFaceOverlay(base, { width: 1200, height: 1800, landmarks: face }, id)
    for (const path of overlay.primitives) if (path.kind === 'polyline') {
      expect(new Set(path.pixelPoints.map(point => point[axis])).size).toBe(1)
    }
  }
})


test('bilateral jaw traces join below the chin and specific narration selects the new guides', () => {
  const overlay = metricFaceOverlay(base, { width:1200,height:1800,landmarks:face }, 'detail.jaw-offset')
  expect(overlay.primitives).toHaveLength(2)
  const paths=overlay.primitives.flatMap(p=>p.kind==='polyline'?[p.pixelPoints]:[])
  expect(paths[0].at(-1)).toEqual(paths[1].at(-1))
  expect(paths[0].at(-1)!.y).toBeGreaterThan(face.anchors.chin!.y*540)
  for (const [text,id] of [['trace the gonial angle','detail.gonial'],['trace under-eye bags','detail.under-eyes'],['show smile lines','detail.smile-lines'],['map the cheekbones','detail.cheekbones'],['facial thirds','detail.facial-thirds'],['eyelid creases','detail.eye-creases'],['mouth creases','detail.mouth-creases'],['facial dimorphism','detail.dimorphism']]) expect(narratedFaceMetric(text)?.id).toBe(id)
})

test('proportion edits use measured distances, remain bounded, and freckles keep irregular stable placement', async () => {
  const { measuredProportionWarp,naturalFreckleField }=await import('./portrait-detail-edits')
  const span=face.anchors.rightPupil!.x-face.anchors.leftPupil!.x,ratio=face.image.height/face.image.width
  for(const kind of ['thirds','width'] as const){
    const warp=measuredProportionWarp(face,kind,1)!
    expect(warp).toBeDefined()
    for(const shift of warp.shifts!)expect(Math.hypot(shift.x,shift.y*ratio)).toBeLessThanOrEqual(span*.02+1e-9)
    expect(measuredProportionWarp({...face,confidence:.4},kind,1)).toBeUndefined()
  }
  const freckles=naturalFreckleField(face)
  expect(freckles.length).toBeGreaterThan(40)
  expect(freckles).toEqual(naturalFreckleField(face))
  expect(new Set(freckles.map(dot=>dot.rx)).size).toBeGreaterThan(30)
  expect(freckles.every(dot=>dot.opacity<.32 && dot.y>face.anchors.leftPupil!.y && dot.y<face.anchors.upperLip!.y)).toBe(true)
  expect(naturalFreckleField({...face,confidence:.4})).toEqual([])
})
