import { expect, test } from 'bun:test'
import { editorialPortraitStage, portraitDetailRegion, portraitIsDetail, portraitImageFrame, portraitFadeStart, drawPortraitEdgeFade, registeredPortraitCrop } from './video-portrait'
import { captionDesign, portraitStage, videoSize } from './video-layout'
import type { VideoScene } from './video-composition'

test('normal portraits reserve caption clearance and occupy at most three quarters of the viewport', () => {
  expect(captionDesign.top).toBeGreaterThanOrEqual(360)
  for (const stage of ['context', 'detail', 'compare'] as const) {
    const frame = editorialPortraitStage(stage)
    expect(frame).toEqual(portraitStage)
    expect(frame.x).toBe(0)
    expect(frame.width).toBe(videoSize.width)
    expect(frame.x + frame.width).toBe(videoSize.width)
    expect(frame.y).toBeGreaterThanOrEqual(captionDesign.top + 80)
    expect(frame.height).toBeLessThanOrEqual(videoSize.height * .75)
    expect(frame.y + frame.height).toBeLessThan(videoSize.height)
  }
})

test('detail crops follow detected geometry, remain in the source and reject missing landmarks', () => {
  expect(portraitDetailRegion([], 400, 500)).toBeNull()
  expect(portraitDetailRegion([{ x: NaN, y: 0 }], 400, 500)).toBeNull()
  const points = [{ x: 350, y: 420 }, { x: 395, y: 470 }, { x: 370, y: 490 }]
  const crop = portraitDetailRegion(points, 400, 500)!
  expect(crop.x + crop.width).toBeLessThanOrEqual(400)
  expect(crop.y + crop.height).toBeLessThanOrEqual(500)
  expect(crop.x).toBeGreaterThanOrEqual(0)
  expect(crop.y).toBeGreaterThanOrEqual(0)
  expect(portraitDetailRegion(points, 400, 500)).toEqual(crop)
})

test('whole-face arguments cannot inherit a detail zoom from the scene template', () => {
  const portrait = (categoryId: string, narration: string) => ({ source: { categoryId }, narration, editorial: 'detail' }) as VideoScene
  for (const category of ['overall', 'symmetry', 'proportions', 'face-shape']) expect(portraitIsDetail(portrait(category, 'Consider the relationships.'))).toBe(false)
  expect(portraitIsDetail(portrait('jaw', 'Back to the whole face.'))).toBe(false)
  expect(portraitIsDetail(portrait('eyes', 'Look at the eyelid shape.'))).toBe(true)
  expect(portraitIsDetail(portrait('brows', 'The brow is a contour rather than a straight line.'))).toBe(true)
  expect(portraitIsDetail(portrait('eyes', 'A close-up of the eyelid shape.'))).toBe(true)
  expect(portraitIsDetail({ ...portrait('overall', 'A local variation.'), photoStudy: { feature: 'nose', amount: .12 } })).toBe(false)
})

test('main portraits fill the width without cutting source sides or stretching', () => {
  for (const [width, height] of [[2160, 3840], [2000, 3000], [1200, 675], [399, 501]]) for (const stage of [{ width: 1080, height: 1430 }, { width: 1080, height: 1160 }]) {
    const image = { width, height }, frame = portraitImageFrame(image, stage)
    expect(frame.x).toBe(0)
    expect(Number.isFinite(frame.y)).toBe(true)
    expect(frame.width).toBeCloseTo(stage.width)
    expect(frame.width / frame.height).toBeCloseTo(width / height)
    expect(frame.y).toBeCloseTo(Math.max(0, (stage.height - frame.height) / 2))
  }
  const image = { width: 2000, height: 3000 }, stage = { width: 1080, height: 1430 }, crop = { x: 600, y: 1100, width: 800, height: 400 }
  const detail = portraitImageFrame(image, stage, crop)
  expect(detail.width).toBeGreaterThan(portraitImageFrame(image, stage).width)
  expect(detail.x + (crop.x + crop.width / 2) / image.width * detail.width).toBeCloseTo(stage.width / 2)
})

test('original-photo evidence coordinates register precisely into the separately cropped portrait', () => {
  const source = { x: 100, y: 200, width: 800, height: 1000 }
  expect(registeredPortraitCrop({ x: 300, y: 400, width: 200, height: 300 }, source, 400, 500)).toEqual({ x: 100, y: 100, width: 100, height: 150 })
  expect(registeredPortraitCrop({ x: 0, y: 0, width: 20, height: 20 }, source, 400, 500)).toBeUndefined()
})

test('detail framing retains surrounding photo context and cannot pan beyond its image edges', () => {
  const image = { width: 1200, height: 1600 }, stage = { width: 1080, height: 1720 }
  const frame = portraitImageFrame(image, stage, { x: 10, y: 1350, width: 180, height: 120 })
  expect(frame.width).toBeLessThanOrEqual(stage.width * 1.45)
  expect(frame.x).toBeLessThanOrEqual(0)
  expect(frame.y).toBeLessThanOrEqual(0)
  expect(frame.x + frame.width).toBeGreaterThanOrEqual(stage.width)
  expect(frame.y + frame.height).toBeGreaterThanOrEqual(stage.height)
})


test('face-aware framing enlarges a small face in a wide source and centers it above the metric', () => {
  const image = { width: 1200, height: 675 }, stage = { width: 1080, height: 1480 }
  const landmarks = { confidence: .95, anchors: { forehead: { x: .5, y: .2 }, chin: { x: .5, y: .6 } } } as Parameters<typeof portraitImageFrame>[3]
  const frame = portraitImageFrame(image, stage, undefined, landmarks)
  const faceHeight = (.6 - .2) * image.height * frame.height / image.height
  expect(faceHeight).toBeGreaterThan(520)
  expect(frame.width / frame.height).toBeCloseTo(image.width / image.height)
  expect(frame.x + image.width * .5 * frame.width / image.width).toBeCloseTo(stage.width / 2)
  const foreheadY = frame.y + landmarks!.anchors.forehead!.y * frame.height
  const chinY = frame.y + landmarks!.anchors.chin!.y * frame.height
  expect(foreheadY).toBeGreaterThan(0)
  expect(chinY).toBeLessThan(stage.height)
})


test('the portrait fade stays beneath the chin or selected feature', () => {
  expect(portraitFadeStart(1480, 1150)).toBeGreaterThan(1150)
  expect(portraitFadeStart(1480, 1300)).toBeGreaterThan(1300)
  expect(portraitFadeStart(1480, 1800)).toBeLessThan(1480)
})


test('close-up fades keep overflowing photo pixels covered to the viewport bottom', () => {
  const fills: Array<{ color: unknown; rect: number[] }> = []
  const stops: Array<[number, string]> = []
  const native = { save() {}, restore() {}, fillStyle: '' as unknown,
    createLinearGradient: () => ({ addColorStop: (position: number, color: string) => stops.push([position, color]) }),
    fillRect(...rect: number[]) { fills.push({ color: this.fillStyle, rect }) },
  }
  const ctx = native as unknown as CanvasRenderingContext2D
  drawPortraitEdgeFade(ctx, 1080, 1755, 1400, 1860)
  expect(fills[0].rect[1]).toBeGreaterThan(1400)
  expect(fills[0].rect[1] + fills[0].rect[3]).toBeGreaterThanOrEqual(1860)
  expect(fills.some(fill => fill.color === '#fff')).toBe(false)
  expect(stops).toContainEqual([1, 'rgba(255,255,255,1)'])
})


test('a broad metric guide never zooms out from the context portrait', () => {
  const image = { width: 1200, height: 1800 }, stage = { width: 1080, height: 1430 }
  const context = portraitImageFrame(image, stage)
  const detail = portraitImageFrame(image, stage, { x: 0, y: 500, width: 1200, height: 900 }, undefined, undefined, 1.9)
  expect(detail.width).toBeGreaterThanOrEqual(context.width)
})

test('bottom-filling feature portraits keep the original aspect and extend through the bottom of the stage',()=>{
  for(const image of [{width:1200,height:1600},{width:1200,height:2400}]){
    const stage={width:1080,height:1700}
    for(const focus of [undefined,{x:350,y:350,width:250,height:150}]){
      const frame=portraitImageFrame(image,stage,focus,undefined,undefined,2.8,true)
      expect(frame.y+frame.height).toBeGreaterThanOrEqual(stage.height-.001)
      expect(frame.width/frame.height).toBeCloseTo(image.width/image.height)
      expect(Object.values(frame).every(Number.isFinite)).toBe(true)
    }
  }
})
