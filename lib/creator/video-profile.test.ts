import { expect, test } from 'bun:test'
import { profileGeometry, projectedAngle, profileFeatureForText } from './video-profile'
import { subjectStudies } from './video-subject-studies'
import { compileAnalysisVideo } from './video-composition'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import type { GeneratorImage } from './content-generator'

test('projected angles use image pixels, reject degenerate geometry and are not skeletal measurements', () => {
  expect(projectedAngle({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90)
  expect(projectedAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull()
  const image = { id: 'face', name: 'Face', width: 1200, height: 675, landmarks: null } as GeneratorImage
  expect(() => profileGeometry(image, { view: 'profile', side: 'right', feature: 'jaw' })).toThrow('reliable detected contours')
})

test('multi-image studies direct every script sentence to the right subject photo and preserve nuance', () => {
  const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample', hook: '', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: '', productFeatures: [], cta: '' }
  for (const example of subjectStudies) {
    const plan = scriptToPlan(example.script, example.readingPace)
    expect(Object.keys(example.directions!)).toHaveLength(plan.scenes.length)
    const ids = example.images!.map(image => image.id)
    const composition = compileAnalysisVideo(plan, input, ids, 'brand', [], { recipe: example.recipe, directions: example.directions })
    expect(new Set(composition.scenes.filter(scene => scene.source.kind === 'portrait').map(scene => scene.source.imageId))).toEqual(new Set(ids))
    expect(composition.scenes.filter(scene => scene.profileStudy).every(scene => scene.source.imageId?.endsWith('-angle'))).toBe(true)
    expect(composition.scenes.every(scene => scene.delivery)).toBe(true)
    expect(composition.scenes.some(scene => scene.graphic?.layout === 'statement')).toBe(false)
    expect(composition.scenes.map(scene => scene.narration).join(' ').replace(/\s+/g, ' ')).toBe(example.script.replace(/\s+/g, ' '))
    expect(composition.durationMs).toBeLessThan(70000)
    expect(composition.scenes.find(scene => scene.source.kind === 'report')?.source.imageId).toBe(ids[0])
  }
})


const profileImage = (mirror = false) => {
  const point = (x: number, y: number) => ({ x: mirror ? 1-x : x, y })
  const jaw = Array.from({ length: 13 }, (_, i) => point(.3 + i * .04, .65 + .16 * Math.sin(i / 12 * Math.PI)))
  return { id: 'profile', name: 'Profile', dataUrl: '/profile.png', status: 'ready', width: 1200, height: 2000, landmarks: {
    version: 1, source: 'mediapipe-face-landmarker', confidence: .95, image: { width: 1200, height: 2000 },
    anchors: { noseTip: point(.2,.48), noseBridge: point(.26,.37), leftCheek: point(.32,.47), rightCheek: point(.8,.47), jawLeft: jaw[0], jawRight: jaw[12], chin: jaw[6], upperLip: point(.22,.56), mouthCenter: point(.23,.58), lowerLip: point(.23,.6) },
    contours: { jawline: jaw, faceOutline: [point(.5,.2),point(.8,.3),point(.8,.47),...jaw.slice().reverse(),point(.32,.47)], noseBase: [point(.23,.51), point(.24,.51), point(.25,.51), point(.24,.52)] },
  } } as GeneratorImage
}

test('visible-side geometry overrides a stale side hint and stays registered after mirroring', () => {
  for (const mirror of [false,true]) {
    const image = profileImage(mirror)
    const geometry = profileGeometry(image, { view: 'profile', side: 'left', feature: 'angle' })
    const right = image.landmarks!.anchors.jawRight!
    expect(geometry.angle!.vertex).toEqual({x:right.x*image.width,y:right.y*image.height})
    expect(geometry.contour).toHaveLength(7)
    const chin = profileGeometry(image, { view: 'profile', side: 'left', feature: 'chin' })
    expect(chin.contour).toHaveLength(4)
    expect(chin.contour.at(-1)).toEqual(geometry.contour[0])
  }
})

test('focused profile guides use detected nose/lip anchors and never substitute guessed points', () => {
  const image = profileImage()
  const nose = profileGeometry(image,{view:'profile',side:'left',feature:'nose'})
  expect(nose.contour[1]).toEqual({x:240,y:960})
  expect(profileGeometry(image,{view:'profile',side:'left',feature:'lips'}).contour).toHaveLength(3)
  delete image.landmarks!.anchors.noseTip
  expect(()=>profileGeometry(image,{view:'profile',side:'left',feature:'nose'})).toThrow('reliable nose anchors')
})

test('voiceover focus selects distinct, simple profile guides', () => {
  for (const [text, feature] of [['The nose projection','nose'],['The lip position','lips'],['Follow the chin','chin'],['The cheek outline','cheek'],['The jaw angle','angle'],['Follow the jaw','jaw']] as const) expect(profileFeatureForText(text)).toBe(feature)
})
