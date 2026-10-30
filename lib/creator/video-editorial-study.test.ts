import { expect, test } from 'bun:test'
import { videoSize, portraitStage, smoothMotion } from './video-layout'
import { editorialStudySchema, studyPortraitFrame, studyReferenceFrames, drawStudyReferences, studyReferenceCrop, studyReferenceImageId, studyMosaicCrops, studyMosaicSeparation, studyReferenceDesign } from './video-editorial-study'
import { compileAnalysisVideo, videoImageIds } from './video-composition'
import { subjectStudies } from './video-subject-studies'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import type { CanvasNode, CanvasPainter } from './canvas-layout'

const study = editorialStudySchema.parse({ id: 'argument', operation: 'compare', activeId: 'frame', references: [{ id: 'frame', imageId: 'front', categoryId: 'jaw', label: 'Frame' }, { id: 'contour', imageId: 'detail', categoryId: 'cheeks', label: 'Contour' }, { id: 'softness', imageId: 'front', categoryId: 'mouth', label: 'Softness' }] })

test('persistent reference identities enlarge into the recap without inventing new visual objects', () => {
  const ids = (operation: typeof study.operation) => {
    const nodes: CanvasNode[] = []
    const painter = ((_ctx, node) => nodes.push(node)) as CanvasPainter
    drawStudyReferences({} as CanvasRenderingContext2D, painter, { ...study, operation }, study.references.map(reference => ({ ...reference, image: {} as HTMLImageElement, crop: { x: 0, y: 0, width: 200, height: 140 } })), 8000, false)
    expect(nodes.every(node => node.opacity === 1)).toBe(true)
    return nodes.map(node => node.id)
  }
  expect(ids('compare')).toEqual(ids('recap'))
  expect(ids('establish')).toEqual([])
  const rail = studyReferenceFrames(study), recap = studyReferenceFrames({ ...study, operation: 'recap' })
  recap.forEach((frame, index) => {
    expect(frame.width * frame.height).toBeGreaterThan(rail[index].width * rail[index].height)
    expect(frame.y).toBeGreaterThan(350)
    expect(frame.x + frame.width).toBeLessThanOrEqual(1080)
    expect(frame.y + frame.height).toBeLessThan(videoSize.height - 180)
  })
  expect(studyPortraitFrame('compare')).toEqual(studyPortraitFrame('planes'))
  expect(studyPortraitFrame('compare')).toEqual(studyPortraitFrame('light'))
})

test('references fail closed on invalid identities and all referenced photos belong to the project manifest', () => {
  expect(() => editorialStudySchema.parse({ ...study, activeId: 'missing' })).toThrow('Active evidence')
  expect(() => editorialStudySchema.parse({ ...study, references: [study.references[0], study.references[0]] })).toThrow('unique')
  expect(videoImageIds([{ source: { imageId: 'front' }, study }] as Parameters<typeof videoImageIds>[0])).toEqual(new Set(['front', 'detail']))
})

test('detail references fill their rounded aperture without letterboxing or unequal border padding', () => {
  const region = { x: 300, y: 250, width: 260, height: 190 }
  for (const [width, height] of [[290, 246], [920, 396], [440, 426]]) {
    const crop = studyReferenceCrop(region, 1200, 1800, width, height)
    expect(crop.width / crop.height).toBeCloseTo(width / height)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(1200)
    expect(crop.y + crop.height).toBeLessThanOrEqual(1800)
    expect(crop.x).toBeLessThanOrEqual(region.x)
    expect(crop.y).toBeLessThanOrEqual(region.y)
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(region.x + region.width)
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(region.y + region.height)
  }
})

test('recap tiles partition one registered photograph, while detail rails retain their original evidence', () => {
  const recap = { ...study, operation: 'recap' as const }
  expect(study.references.map((_, index) => studyReferenceImageId(study, index))).toEqual(['front', 'detail', 'front'])
  expect(study.references.map((_, index) => studyReferenceImageId(recap, index))).toEqual(['front', 'front', 'front'])
  const image = { width: 1200, height: 1800 } as HTMLImageElement
  const references = study.references.map((reference, index) => ({ ...reference, image, crop: { x: 350 + index * 25, y: 500 + index * 100, width: 400, height: 200 } }))
  const frames = studyReferenceFrames(recap, references), crops = studyMosaicCrops(references, frames)
  expect(frames[1].y).toBeLessThan(frames[0].y)
  const scale = frames[0].width / crops[0].width
  for (const [index, crop] of crops.entries()) {
    expect(frames[index].width / crop.width).toBeCloseTo(scale)
    expect(frames[index].height / crop.height).toBeCloseTo(scale)
    expect(frames[index].x - crop.x * scale).toBeCloseTo(frames[0].x - crops[0].x * scale)
    expect(frames[index].y - crop.y * scale).toBeCloseTo(frames[0].y - crops[0].y * scale)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y + crop.height).toBeLessThanOrEqual(image.height)
  }
  for (const count of [1, 2]) {
    const subset = { ...recap, references: recap.references.slice(0, count) }
    expect(studyMosaicCrops(references.slice(0, count), studyReferenceFrames(subset))).toHaveLength(count)
  }
})

test('mosaics open from a seamless photo and smoothly rejoin on one operation clock', () => {
  expect(studyMosaicSeparation(0, 8000)).toBe(0)
  expect(studyMosaicSeparation(800, 8000)).toBe(0)
  expect(studyMosaicSeparation(4000, 8000)).toBe(1)
  expect(studyMosaicSeparation(8000, 8000)).toBe(0)
  expect(studyMosaicSeparation(0, 8000, true)).toBe(1)
  expect(studyMosaicSeparation(7900, 8000, true)).toBe(1)
  for (let time = 0; time < 8000; time += 20) expect(Math.abs(studyMosaicSeparation(time + 20, 8000) - studyMosaicSeparation(time, 8000))).toBeLessThan(.03)
  const recap = { ...study, operation: 'recap' as const }, closed = studyReferenceFrames(recap)
  const top = closed.find(frame => frame.y === Math.min(...closed.map(frame => frame.y)))!, bottom = closed.filter(frame => frame.y !== Math.min(...closed.map(frame => frame.y)))
  expect(top.y + top.height).toBe(bottom[0].y)
  expect(bottom.map(frame => frame.width).reduce((sum, width) => sum + width, 0)).toBe(top.width)
  expect(Math.abs(bottom[0].x - bottom[1].x)).toBe(bottom[0].width)
  const portrait = studyPortraitFrame('compare'), orbit = studyReferenceFrames(study)
  expect(portrait.x + portrait.width / 2).toBe(540)
  expect(portrait.width).toBeGreaterThan(800)
  expect(Math.min(...orbit.map(frame => frame.x))).toBeGreaterThan(portrait.x)
  expect(Math.max(...orbit.map(frame => frame.x + frame.width))).toBeLessThan(portrait.x + portrait.width)
  expect(orbit.some(frame => frame.x > 540)).toBe(true)
})

test('authored studies sustain an argument rather than rotating portrait, metric and dashboard templates', () => {
  const input = { formatId: 'feature-audit', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', productFeatures: [] } as unknown as AnalysisPostInput
  for (const example of subjectStudies) {
    const composition = compileAnalysisVideo(scriptToPlan(example.script, example.readingPace), input, example.images!.map(image => image.id), 'brand', [], { recipe: example.recipe, directions: example.directions })
    const chapters = composition.scenes.filter(scene => scene.study)
    expect(new Set(chapters.map(scene => scene.study!.operation))).toEqual(new Set(['establish', 'planes', 'contour', 'light', 'inspect', 'compare', 'recap']))
    expect(new Set(chapters.map(scene => JSON.stringify(scene.study!.references))).size).toBe(1)
    expect(composition.scenes.filter(scene => scene.source.kind === 'report')).toHaveLength(1)
    expect(chapters.every(scene => !scene.tracks.some(track => track.target === 'camera' || track.elementId === 'subject'))).toBe(true)
    expect(composition.scenes.filter(scene => scene.graphic).every(scene => scene.graphic!.items.every(item => item.diagram && !item.value))).toBe(true)
    const recapIndex = composition.scenes.findIndex(scene => scene.study?.operation === 'recap')
    const beforeRecap = composition.scenes[recapIndex - 1]
    expect(beforeRecap.study?.id).toBe(composition.scenes[recapIndex].study?.id)
    expect(beforeRecap.source.imageId).toBe(composition.scenes[recapIndex].source.imageId)
    let run = 0, longest = 0, image = ''
    for (const scene of composition.scenes) {
      run = scene.study && scene.source.imageId === image ? run + scene.durationMs : scene.study ? scene.durationMs : 0
      image = scene.source.imageId ?? ''; longest = Math.max(longest, run)
    }
    expect(longest).toBeGreaterThan(10000)
  }
})

test('small rounded details float at the portrait edges and leave the central face clear', () => {
  const portrait = studyPortraitFrame('planes'), frames = studyReferenceFrames(study)
  expect(portrait).toEqual(portraitStage)
  expect(studyReferenceDesign.border).toBe(5)
  expect(studyReferenceDesign.radius).toBe(40)
  for (const frame of frames) {
    expect(frame.y).toBeGreaterThan(portrait.y)
    expect(frame.y + frame.height).toBeLessThan(portrait.y + portrait.height)
    expect(frame.width).toBeLessThanOrEqual(352)
    expect(frame.x + frame.width <= 384 || frame.x >= 696).toBe(true)
  }
  for (const [index, first] of frames.entries()) for (const second of frames.slice(index + 1)) {
    expect(first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true)
  }
  const recap = studyReferenceFrames({ ...study, operation: 'recap' })
  expect((Math.min(...recap.map(frame => frame.y)) + Math.max(...recap.map(frame => frame.y + frame.height))) / 2).toBe(portraitStage.y + portraitStage.height / 2)
})

test('detail apertures follow the highlighted feature rather than a fixed square', () => {
  const frames = studyReferenceFrames(study)
  const jaw = frames[0], cheeks = frames[1], mouth = frames[2]
  expect(jaw.height).toBeGreaterThan(jaw.width)
  expect(cheeks.width).toBeGreaterThan(cheeks.height)
  expect(mouth.width / mouth.height).toBeGreaterThan(1.5)
  expect(frames.every(frame => frame.x >= 32 && frame.x + frame.width <= 1048)).toBe(true)
})


test('normalized easing remains bounded near floating-point endpoints used by canvas radii', () => {
  for (const progress of [-1e-7, 0, 1e-7, .1, .5, .9, .9999999, 1, 1.0000001]) {
    expect(smoothMotion(progress)).toBeGreaterThanOrEqual(0)
    expect(smoothMotion(progress)).toBeLessThanOrEqual(1)
    expect(studyMosaicSeparation(progress * 8000, 8000)).toBeGreaterThanOrEqual(0)
    expect(studyMosaicSeparation(progress * 8000, 8000)).toBeLessThanOrEqual(1)
  }
})
