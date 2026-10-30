import { expect, test } from 'bun:test'
import { brandBackdrop, captionBackdrop, reportBackdrop, drawCaptionBackdrop } from './video-progressive-blur'

test('progressive blur reuses small canvas surfaces and never paints a white wash on the video', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let allocations = 0, videoFills = 0
  const context = (video = false) => new Proxy({ canvas: { width: 1080, height: 1920 } }, {
    get: (target, key) => key === 'canvas' ? target.canvas : key === 'globalAlpha' ? 1 : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : key === 'fillRect' ? () => { if (video) videoFills++ } : () => {},
    set: () => true,
  }) as CanvasRenderingContext2D
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { allocations++; return { width: 0, height: 0, getContext: () => context() } } } })
  try {
    const ctx = context(true)
    for (let frame = 0; frame < 100; frame++) drawCaptionBackdrop(ctx)
    expect(allocations).toBe(3)
    for (let frame = 0; frame < 100; frame++) drawCaptionBackdrop(ctx, { edge: 'bottom' })
    expect(allocations).toBe(6)
    for (let frame = 0; frame < 100; frame++) drawCaptionBackdrop(ctx, { edge: 'bottom', role: 'brand' })
    expect(allocations).toBe(9)
    for (let frame = 0; frame < 100; frame++) drawCaptionBackdrop(ctx, { edge: 'bottom', role: 'report', tint: 'light' })
    expect(allocations).toBe(12)
    for (let frame = 0; frame < 100; frame++) drawCaptionBackdrop(ctx, { edge: 'bottom', role: 'metric', tint: 'light', height: 780 })
    expect(allocations).toBe(15)
    expect(reportBackdrop.height).toBeGreaterThan(captionBackdrop.height)
    expect(reportBackdrop.blur).toBeGreaterThan(captionBackdrop.blur)
    expect(brandBackdrop.height).toBeLessThan(captionBackdrop.height)
    expect(brandBackdrop.blur).toBeLessThan(captionBackdrop.blur)
    expect(captionBackdrop.width).toBeLessThan(540)
    expect(captionBackdrop.height).toBeLessThan(400)
    expect(videoFills).toBe(0)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
