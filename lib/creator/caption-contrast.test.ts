import { expect, test } from 'bun:test'
import { annotationAppearance, captionAppearance, sampleCaptionAppearance, settleCaptionAppearance, drawAdaptiveCaptionTint } from './caption-contrast'

const pixels = (...grays: number[]) => grays.flatMap(value => [value, value, value, 255])

test('captions select readable ink without tint on uniformly light or dark imagery', () => {
  expect(captionAppearance(pixels(255, 245, 235))).toEqual({ ink: '#000', tint: 'none' })
  expect(captionAppearance(pixels(0, 20, 35))).toEqual({ ink: '#fff', tint: 'none' })
  expect(captionAppearance([0, 0, 0, 0])).toEqual({ ink: '#000', tint: 'none' })
})

test('mixed imagery uses a translucent tint when neither ink has sufficient contrast', () => {
  expect(captionAppearance(pixels(0, 0, 0, 255, 255))).toEqual({ ink: '#000', tint: 'light' })
  expect(captionAppearance(pixels(0, 0, 0, 0, 255))).toEqual({ ink: '#fff', tint: 'dark' })
  let fills = 0
  const ctx = new Proxy({}, { get: (_, key) => key === 'fill' ? () => { fills++ } : () => {}, set: () => true }) as CanvasRenderingContext2D
  drawAdaptiveCaptionTint(ctx, { x: 60, y: 0, width: 960, height: 160 }, 'none')
  expect(fills).toBe(0)
})

test('caption sampling reuses a tiny surface and follows the rendered caption transform', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let allocations = 0
  const crops: number[][] = []
  const sample = { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage: (_source: unknown, ...args: number[]) => crops.push(args), getImageData: () => ({ data: pixels(255) }) }) }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { allocations++; return sample } } })
  try {
    const ctx = { canvas: {}, getTransform: () => ({ a: .5, d: .5, e: 0, f: 260 }) } as unknown as CanvasRenderingContext2D
    for (let frame = 0; frame < 30; frame++) expect(sampleCaptionAppearance(ctx, { x: 60, y: 0, width: 960, height: 160 }, '#fff').ink).toBe('#000')
    expect(allocations).toBe(1)
    expect(sample.width * sample.height).toBe(480)
    expect(crops[0]).toEqual([30, 260, 480, 80, 0, 0, 40, 12])
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})


test('caption tint changes blend from the current surface instead of popping at line changes', () => {
  const ctx = {} as CanvasRenderingContext2D
  const light = { ink: '#000', tint: 'none' as const }, dark = { ink: '#fff', tint: 'dark' as const }
  expect(settleCaptionAppearance(ctx, light, 0).dark).toBe(0)
  expect(settleCaptionAppearance(ctx, dark, 100).dark).toBe(0)
  const middle = settleCaptionAppearance(ctx, dark, 210)
  expect(middle.dark).toBeCloseTo(.5)
  expect(settleCaptionAppearance(ctx, light, 211).dark).toBeGreaterThan(.5)
  expect(settleCaptionAppearance(ctx, light, 431).dark).toBe(0)
  expect(settleCaptionAppearance(ctx, dark, 432, true).dark).toBe(1)
  expect(settleCaptionAppearance(ctx, light, 433).dark).toBe(0)
  expect(settleCaptionAppearance(ctx, light, 10).dark).toBe(0)
})


test('adaptive caption contrast feathers across the screen without a rounded dark panel', () => {
  const fills: number[][] = [], stops: Array<[number, string]> = []
  let panels = 0
  const ctx = { globalAlpha: 1, save() {}, restore() {}, fillStyle: '',
    createLinearGradient: () => ({ addColorStop: (position: number, color: string) => stops.push([position, color]) }),
    fillRect: (...rect: number[]) => fills.push(rect), roundRect: () => { panels++ },
  } as unknown as CanvasRenderingContext2D
  drawAdaptiveCaptionTint(ctx, { x: 60, y: 0, width: 960, height: 160 }, 'dark')
  expect(panels).toBe(0)
  expect(fills).toEqual([[0, -180, 1316, 520]])
  expect(stops[0]).toEqual([0, 'rgba(8,8,8,0)'])
  expect(stops.at(-1)).toEqual([1, 'rgba(8,8,8,0)'])
  expect(stops[16]).toEqual([.5, 'rgba(8,8,8,0.44)'])
})

test('annotation ink only turns dark on neutral white space, keeping skin, prints and dark imagery light', () => {
  expect(annotationAppearance(pixels(255,250,240)).ink).toBe('#171717')
  expect(annotationAppearance(pixels(17,40,100)).ink).toBe('#fff')
  expect(annotationAppearance([245,210,185,255,230,195,170,255]).ink).toBe('#fff')
  expect(annotationAppearance(pixels(255,255,255,255,100)).ink).toBe('#fff')
})
