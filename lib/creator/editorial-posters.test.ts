import { expect, test } from 'bun:test'
import { refinePortraitMask, refinePortraitEdges } from './editorial-posters'

test('portrait mask refinement preserves solid regions and source dimensions', () => {
  const pixels = new Uint8ClampedArray(8 * 4).fill(128)
  expect([...refinePortraitMask(new Float32Array([1, 1]), 2, 1, pixels, 4, 2)]).toEqual(Array(8).fill(255))
  expect([...refinePortraitMask(new Float32Array([0, 0]), 2, 1, pixels, 4, 2)]).toEqual(Array(8).fill(0))
})

test('source colour edges guide the enlarged matte rather than bleeding across the silhouette', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255])
  const alpha = refinePortraitMask(new Float32Array([0, 1]), 2, 1, pixels, 4, 1)
  expect([...alpha]).toEqual([0, 0, 255, 255])
})


test('edge cleanup preserves opaque hair, skin and light detail beside the background', () => {
  const pixels = new Uint8ClampedArray([240,240,240,255, 235,225,215,255, 180,120,90,255, 40,30,20,255])
  const original = pixels.slice()
  refinePortraitEdges(pixels, new Uint8ClampedArray([0,255,255,255]), 4, 1)
  expect([...pixels.slice(4)]).toEqual([...original.slice(4)])
  expect(pixels[3]).toBe(0)
})

test('edge cleanup keeps the model silhouette and bounds colour corrections', () => {
  const pixels = new Uint8ClampedArray([240,240,240,255, 140,140,140,255, 40,40,40,255])
  refinePortraitEdges(pixels, new Uint8ClampedArray([0,128,255]), 3, 1)
  expect(pixels[7]).toBe(128)
  expect(pixels[4]).toBe(108)
  expect([...pixels.slice(8)]).toEqual([40,40,40,255])
})

test('existing source transparency and colours are preserved', () => {
  const pixels = new Uint8ClampedArray([255,255,255,255, 180,120,90,128, 40,30,20,255])
  refinePortraitEdges(pixels, new Uint8ClampedArray([0,128,255]), 3, 1)
  expect([...pixels.slice(4,8)]).toEqual([180,120,90,64])
})
