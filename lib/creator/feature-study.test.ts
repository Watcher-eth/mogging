import { expect, test } from 'bun:test'
import { drawFeatureStudy, registeredFeatureWarp, featureClipFrame, featureFrames, featureFrameAt, featurePlacement, featureRegistration, featureTopics, featureWarp, featureCameraFrame, featureCardOpacity } from './feature-study'
import { productionVisualPlan } from './video-production'
import { createFeatureStudyDraft } from './feature-study-script'
import { compileProductionVideo, reviseProductionScript, productionCut, productionTimeline, sectionAudioKey } from './video-production'
import { featureVariantPhotos } from './feature-study-assets'
import { creatorSubjects, creatorSubjectPhotos } from './creator-catalog'
import { reportCategories } from './mock-report-data'
import { videoImageIds, parseComposition } from './video-composition'
import { voiceDirection, type VoiceDirection } from './video-speech'
import { warpSourcePoint } from './video-portrait-effects'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { AnalysisPostInput } from './analysis-post'

const landmarks: FaceLandmarksPayload = {
  version: 1, source: 'mediapipe-face-landmarker', confidence: .95, image: { width: 1200, height: 1800 },
  anchors: { leftPupil: {x:.35,y:.4}, rightPupil:{x:.65,y:.42}, forehead:{x:.5,y:.2}, chin:{x:.5,y:.8}, noseTip:{x:.5,y:.55}, upperLip:{x:.5,y:.62}, mouthCenter:{x:.5,y:.65}, lowerLip:{x:.5,y:.68}, mouthLeft:{x:.4,y:.65}, mouthRight:{x:.6,y:.67}, leftCheek:{x:.25,y:.55}, rightCheek:{x:.75,y:.55}, jawLeft:{x:.3,y:.7}, jawRight:{x:.7,y:.7}, leftBrow:{x:.35,y:.35},rightBrow:{x:.65,y:.35} }, contours: {},
}
const input: AnalysisPostInput = {formatId:'feature-audit',subject:'Marlon',hook:'',overallScore:'7.1',potentialScore:'8.2',strongestFeature:'Eye area',strongestScore:'8.1',opportunityFeature:'Jaw',opportunityScore:'6.2',recommendation:'',productFeatures:[],cta:''}
const voice: VoiceDirection = voiceDirection('editorial')

test('every topic has complete modular cuts, an early CTA and bounded master length', () => {
  for (const topic of featureTopics) for (const cap of [30,45,60,75] as const) {
    const script = productionCut(createFeatureStudyDraft('Marlon',topic),cap), timeline = productionTimeline(script)
    expect(timeline.at(-1)!.startMs + timeline.at(-1)!.durationMs).toBeLessThanOrEqual(cap*1000)
    expect(timeline.some(section=>section.id==='light')).toBe(true)
    expect(timeline.find(section=>section.role==='cta')!.startMs).toBeLessThanOrEqual(20000)
    expect(timeline.filter(section=>/Mogging/.test(section.text))).toHaveLength(cap<=45?2:3)
  }
})

test('compilation preserves recording identity, assigns semantic layouts and uses procedural freckles without inventing a registered texture photo', () => {
  const images = [...creatorSubjectPhotos(creatorSubjects[0])!,...featureVariantPhotos('marlon')]
  for (const topic of featureTopics) {
    const script = createFeatureStudyDraft('Marlon',topic)
    const video = compileProductionVideo(script,input,images,reportCategories,'feature-study',voice,0,topic)
    expect(video.script!.cues.map(c=>sectionAudioKey(c,voice))).toEqual(script.cues.map(c=>sectionAudioKey(c,voice)))
    const scenes = new Map(video.scenes.map(s=>[s.cueId,s]))
    const plan = productionVisualPlan(script, input, images, reportCategories, 'feature-study', 0, topic)
    expect(plan.flatMap(shot => shot.beat.quote).join(' ')).toBe(script.cues.map(cue => cue.text).join(' '))
    expect(plan.every(shot => shot.decision.alternatives.includes(shot.decision.primitive))).toBe(true)
    expect(scenes.get('cta')!.source.kind).toBe('portrait')
    expect(video.scenes.filter(s=>s.featureStudy).every(s=>s.source.imageId?.includes('front'))).toBe(true)
    if (topic==='freckles'||topic==='facial-hair') expect(videoImageIds(video.scenes).has(`marlon-study-${topic}`)).toBe(true)
    const invalid=structuredClone(video);invalid.scenes.find(scene => scene.featureStudy)!.source.kind='report'
    expect(()=>parseComposition(invalid)).toThrow('own their portrait')
  }
  const missing=compileProductionVideo(createFeatureStudyDraft('Marlon','freckles'),input,creatorSubjects[0].example.images!,reportCategories,'feature-study',voice,0,'freckles')
  expect(missing.scenes.filter(scene=>scene.featureStudy?.edit).every(scene=>scene.featureStudy!.topic==='freckles' && scene.featureStudy!.editMode==='warp')).toBe(true)
  expect(missing.scenes.some(scene=>scene.featureStudy?.topic==='freckles' && scene.featureStudy.edit>0)).toBe(true)
})

test('hero/detail/grid movements preserve exact source and destination geometry without overshoot', () => {
  const photo = {image:{width:1200,height:1800} as HTMLCanvasElement,landmarks}
  for(const fromLayout of ['hero','detail','compare','grid'] as const) for(const toLayout of ['hero','detail','compare','grid'] as const) {
    const from=featurePlacement(photo,fromLayout,featureFrames(fromLayout)[0],'philtrum'),to=featurePlacement(photo,toLayout,featureFrames(toLayout)[0],'philtrum')
    expect(featureFrameAt(from,to,0)).toEqual(from)
    expect(featureFrameAt(from,to,560)).toEqual(to)
    expect(featureFrameAt(from,to,0,true)).toEqual(to)
    for(const time of [80,200,400]) for(const key of ['x','y','width','height'] as const) {
      const current=featureFrameAt(from,to,time)[key]
      expect(current).toBeGreaterThanOrEqual(Math.min(from[key],to[key])-1e-8)
      expect(current).toBeLessThanOrEqual(Math.max(from[key],to[key])+1e-8)
    }
  }
})

test('edited portraits register both pupils despite resolution, translation and rotation differences', () => {
  const edited = structuredClone(landmarks)
  edited.anchors.leftPupil={x:.28,y:.32};edited.anchors.rightPupil={x:.54,y:.36}
  const size={width:941,height:1672},m=featureRegistration(landmarks,edited,landmarks.image,size)
  for(const name of ['leftPupil','rightPupil'] as const) {
    const p=edited.anchors[name]!,q=landmarks.anchors[name]!,x=p.x*size.width,y=p.y*size.height
    expect(m.a*x+m.c*y+m.e).toBeCloseTo(q.x*1200,6)
    expect(m.b*x+m.d*y+m.f).toBeCloseTo(q.y*1800,6)
  }
})

test('local shape edits protect distant anatomy and never fake texture with a warp', () => {
  expect(featureWarp(landmarks,'philtrum',0)).toBeUndefined()
  for(const topic of ['freckles','facial-hair'] as const) expect(featureWarp(landmarks,topic,1)).toBeUndefined()
  const warp=featureWarp(landmarks,'philtrum',1)!
  expect(warpSourcePoint(landmarks.anchors.leftPupil!,warp)).toEqual(landmarks.anchors.leftPupil!)
  expect(warpSourcePoint(landmarks.anchors.mouthCenter!,warp).y).toBeLessThan(landmarks.anchors.mouthCenter!.y)
  const symmetry=featureWarp(landmarks,'symmetry',1)!
  expect(symmetry.strengths[0]).toBeGreaterThan(0);expect(symmetry.strengths[1]).toBeLessThan(0)
  expect(()=>featureWarp({...landmarks,confidence:.2},'ears',1)).toThrow('clear front portrait')
})

test('the persistent face stays opaque while new grid cards arrive, and clip bounds start at the old canvas bounds', () => {
  const photo = { image: { width: 1200, height: 1800 } as HTMLCanvasElement, landmarks }
  const previous = { topic: 'philtrum', layout: 'detail', edit: 0, editMode: 'warp', annotation: '', images: [] } as const
  const study = { ...previous, layout: 'grid' as const }
  for (const time of [0, 280, 560]) {
    const drawn: number[] = [], alphas: number[] = []
    const ctx = {
      globalAlpha: 1,
      save() { alphas.push(this.globalAlpha) },
      restore() { this.globalAlpha = alphas.pop()! },
      createLinearGradient() { return { addColorStop() {} } },
      beginPath() {}, roundRect() {}, clip() {}, fillRect() {}, translate() {}, scale() {}, fillText() {},
      drawImage() { drawn.push(this.globalAlpha) },
    }
    drawFeatureStudy(ctx as unknown as CanvasRenderingContext2D, { ...study, images: [] }, photo, [photo, photo, photo], time, 4000, false, { ...previous, images: [] })
    expect(drawn).toHaveLength(4)
    expect(drawn[0]).toBe(1)
    expect(drawn.slice(1)).toEqual([1, 2, 3].map(index => featureCardOpacity(index, time)))
    if (time <= 280) expect(drawn.slice(1).every(alpha => alpha === 0)).toBe(true)
  }
  const old = featureClipFrame('detail', featureFrames('detail')[0]), next = featureClipFrame('grid', featureFrames('grid')[0])
  expect(featureFrameAt(old, next, 0)).toEqual(old)
  expect(old.y).toBe(0)
  expect(featureFrameAt(old, next, 560)).toEqual(next)
})

test('the same format and topic have distinct shot sequences for the launch subjects, with repeatable exports', () => {
  const sequences = []
  for (const subject of creatorSubjects) {
    const script = createFeatureStudyDraft(subject.name, 'philtrum')
    const images = creatorSubjectPhotos(subject)!
    const render = () => compileProductionVideo(script, input, images, reportCategories, 'feature-study', voice)
    const video = render()
    expect(render()).toEqual(video)
    const studies = video.scenes.filter(scene => scene.featureStudy)
    sequences.push(studies.map(scene => scene.featureStudy!.layout).join(','))
    const grids = studies.filter(scene => scene.featureStudy!.layout === 'grid')
    for (let i = 1; i < grids.length; i++) expect(grids[i].startMs - grids[i - 1].startMs).toBeGreaterThanOrEqual(16000)
    expect(new Set(studies.map(scene => scene.featureStudy!.layout)).size).toBeGreaterThan(1)
  }
  expect(new Set(sequences).size).toBeGreaterThanOrEqual(3)
})

test('rewriting narration changes the shot while keeping section identity, voice and timing authoritative', () => {
  const master = createFeatureStudyDraft('Marlon', 'philtrum')
  const make = (text: string) => {
    const cues = master.cues.map(cue => cue.sourceId === 'contour' ? { ...cue, text } : cue)
    const script = reviseProductionScript(master, cues)
    return compileProductionVideo(script, input, creatorSubjectPhotos(creatorSubjects[0])!, reportCategories, 'feature-study', voice)
  }
  const comparison = make('Compare the original and edited versions side by side.')
  const detail = make('Focus on the small space below the nose. Watch that detail.')
  expect(['hero', 'compare', 'grid']).toContain(comparison.scenes.find(scene => scene.cueId === 'contour')!.featureStudy!.layout)
  expect(['hero', 'detail']).toContain(detail.scenes.find(scene => scene.cueId === 'contour')!.featureStudy!.layout)
  expect(comparison.script!.cues.map(cue => cue.sourceId)).toEqual(detail.script!.cues.map(cue => cue.sourceId))
  expect(comparison.voice).toEqual(detail.voice)
  expect(comparison.scenes.find(scene => scene.cueId === 'cta')!.focus).toBe('hero')
})

test('profile-only narration uses the real side photo and missing angles never fabricate a repeated grid', () => {
  const master = createFeatureStudyDraft('Marlon', 'philtrum')
  const script = reviseProductionScript(master, master.cues.map(cue => cue.sourceId === 'perspective' ? { ...cue, text: 'Look at the side profile. The silhouette is visible from this angle.' } : cue))
  const images = creatorSubjectPhotos(creatorSubjects[0])!
  const video = compileProductionVideo(script, input, images, reportCategories, 'feature-study', voice)
  const profile = video.scenes.find(scene => scene.cueId === 'perspective')!
  expect(profile.source.imageId).toContain('profile')
  expect(profile.profileStudy).toBeDefined()
  expect(profile.photoStudy).toBeUndefined()
  const onePhoto = compileProductionVideo(script, input, [images[0]], reportCategories, 'feature-study', voice)
  expect(onePhoto.scenes.some(scene => scene.featureStudy?.layout === 'grid')).toBe(false)
})

test('camera motion is bounded, deterministic and finishes at the next shared-image handoff geometry', () => {
  const frame = featureFrames('hero')[0]
  expect(featureCameraFrame(frame, 'hold', .5)).toEqual(frame)
  expect(featureCameraFrame(frame, 'push', 0)).toEqual(frame)
  expect(featureCameraFrame(frame, 'pull', 1)).toEqual(frame)
  for (const motion of ['push', 'pull'] as const) for (const progress of [0, .25, .5, .75, 1]) {
    const moved = featureCameraFrame(frame, motion, progress)
    expect(moved.width).toBeGreaterThanOrEqual(frame.width)
    expect(moved.width).toBeLessThanOrEqual(frame.width * 1.035)
    expect(featureFrameAt(moved, frame, 0)).toEqual(moved)
  }
})


test('single-image studies retain the source through the viewport bottom beneath the fade', () => {
  const photo = {image:{width:2160,height:3840} as HTMLCanvasElement,landmarks}
  for (const layout of ['hero','detail'] as const) {
    const stage=featureFrames(layout)[0]
    expect(stage.y+stage.height).toBe(2340)
    expect(featureClipFrame(layout,stage).height).toBe(2340)
    const placement=featurePlacement(photo,layout,stage,'philtrum')
    for (const motion of ['hold','push','pull'] as const) for (const progress of [0,.5,1]) {
      const camera=featureCameraFrame(placement,motion,progress)
      expect(camera.y+camera.height).toBeGreaterThanOrEqual(2340-.001)
      expect(camera.width/camera.height).toBeCloseTo(2160/3840)
    }
  }
})


test('registered shape edits retain source anatomy, cap movement and do not compound overlapping handles', () => {
  const image = { width: 1200, height: 1800 } as HTMLCanvasElement
  const edited = structuredClone(landmarks)
  edited.anchors.upperLip!.y -= .06
  edited.anchors.lowerLip!.y += .06
  const warp = registeredFeatureWarp({ image, landmarks }, { image, landmarks: edited }, 'lips', 1)!
  for (const shift of warp.shifts!) expect(Math.hypot(shift.x, shift.y * 1.5)).toBeLessThanOrEqual(.0091)
  for (const fixed of [landmarks.anchors.leftPupil!, landmarks.anchors.rightPupil!, landmarks.anchors.chin!, { x: .5, y: .95 }]) expect(warpSourcePoint(fixed, warp)).toEqual(fixed)
  expect(registeredFeatureWarp({ image, landmarks }, { image, landmarks: edited }, 'lips', 0)).toBeUndefined()
  const point = { x: .5, y: .5 }, region = { ...point, rx: .2, ry: .2 }, shift = { x: .01, y: .015 }
  const overlapping = { mode: 'drag' as const, axis: 'both' as const, regions: [region, region, region], strengths: [0,0,0], shifts: [shift,shift,shift] }
  expect(warpSourcePoint(point, overlapping)).toEqual({ x: .49, y: .485 })
})
