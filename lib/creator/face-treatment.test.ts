import { overlayOutlineColor } from './glass-overlay'
import { portraitPrintStyles, portraitOverlayAppearance, preservePortraitTone } from './portrait-print'
import { expect, test } from 'bun:test'
import { drawFaceTreatment } from './face-treatment'
import type { ReportOverlay } from './report-overlay'

test('horizontal measurement guides stay softer than endpoint ticks and face contours', () => {
  const strokes: { horizontal: boolean; opacity: number; width: number }[] = []
  const stack: { opacity: number; width: number }[] = []
  let from = { x: 0, y: 0 }, to = from
  const context = {
    globalAlpha: 1, lineWidth: 1,
    save() { stack.push({ opacity: this.globalAlpha, width: this.lineWidth }) },
    restore() { const state = stack.pop()!; this.globalAlpha = state.opacity; this.lineWidth = state.width },
    scale() {}, translate() {}, rotate() {}, setLineDash() {}, beginPath() {},
    getTransform: () => ({ a: 1, b: 0 }),
    moveTo(x: number, y: number) { from = { x, y } },
    lineTo(x: number, y: number) { to = { x, y } },
    stroke() { strokes.push({ horizontal: Math.abs(to.y - from.y) < .01, opacity: this.globalAlpha, width: this.lineWidth }) },
  }
  const overlay: ReportOverlay = { size: { width: 100, height: 100 }, primitives: [], dots: [], measurement: {
    kind: 'width', anchors: { leftPupil: { x: 30, y: 30 }, rightPupil: { x: 70, y: 30 }, leftCheek: { x: 15, y: 60 }, rightCheek: { x: 85, y: 60 } },
  } }
  drawFaceTreatment(context as unknown as CanvasRenderingContext2D, overlay, 100, 5000, true)
  const horizontal = strokes.filter(stroke => stroke.horizontal), vertical = strokes.filter(stroke => !stroke.horizontal)
  expect(horizontal.length).toBeGreaterThan(0)
  expect(vertical.length).toBeGreaterThan(0)
  expect(horizontal[0].opacity / vertical[0].opacity).toBeCloseTo(.62)
  expect(horizontal[0].width / vertical[0].width).toBeCloseTo(.78)
})


test('filtered face measurements and contours use high-contrast neutral ink with an opposite-tone edge', () => {
  const overlay: ReportOverlay = { size: { width: 100, height: 100 }, dots: [],
    primitives: [{ id: 'jaw', kind: 'polyline', points: [], closed: false, pixelPoints: [{ x: 20, y: 50 }, { x: 50, y: 80 }, { x: 80, y: 50 }] }],
    measurement: { kind: 'width', anchors: { leftPupil: { x: 30, y: 30 }, rightPupil: { x: 70, y: 30 }, leftCheek: { x: 15, y: 60 }, rightCheek: { x: 85, y: 60 } } },
  }
  expect(portraitOverlayAppearance()).toBeUndefined()
  for (const style of portraitPrintStyles) expect(style.overlayColor).toMatch(/^#([0-9A-F]{2})\1\1$/)
  expect(overlayOutlineColor('#181818')).toBe('#FFFFFF')
  expect(overlayOutlineColor('#FFFFFF')).toBe('#111111')
  for (const style of portraitPrintStyles) {
    let state = { globalAlpha: 1, strokeStyle: '', lineWidth: 1 }
    const stack: typeof state[] = [], strokes: typeof state[] = []
    const ctx = new Proxy({}, {
      get: (_, key) => key === 'getTransform' ? () => ({ a: .5, b: 0 }) : key === 'save' ? () => stack.push({ ...state }) : key === 'restore' ? () => { state = stack.pop()! } : key === 'stroke' ? () => strokes.push({ ...state }) : state[key as keyof typeof state] ?? (() => {}),
      set: (_, key, value) => { Object.assign(state, { [key]: value }); return true },
    }) as CanvasRenderingContext2D
    const appearance = portraitOverlayAppearance(style.id, { pattern: 'dotted', opacity: .4, markers: false, regions: false })!
    drawFaceTreatment(ctx, overlay, 100, 5000, true, 1, { appearance })
    const colored = strokes.filter(stroke => stroke.strokeStyle === style.overlayColor)
    expect(colored.length).toBeGreaterThan(1)
    expect(colored.every(stroke => stroke.globalAlpha === 1 && stroke.lineWidth >= 4.8)).toBe(true)
    expect(strokes.some(stroke => stroke.strokeStyle === overlayOutlineColor(style.overlayColor))).toBe(true)
  }
})


test('portrait ink cannot whiten, recolour or erase the source across skin tones and alpha edges', () => {
  const source = new Uint8ClampedArray([48,29,19,255, 110,65,42,255, 178,119,86,255, 232,184,153,255, 75,40,24,64, 0,0,0,0])
  for (const ink of [[255,255,255], [0,0,0], [255,0,180], [0,220,240]]) {
    const printed = new Uint8ClampedArray(source.length)
    for(let offset=0;offset<printed.length;offset+=4) printed.set([...ink,255],offset)
    preservePortraitTone(source,printed)
    for(let offset=0;offset<source.length;offset+=4) {
      expect(printed[offset+3]).toBe(source[offset+3])
      for(let channel=0;channel<3;channel++) {
        expect(printed[offset+channel]).toBeLessThanOrEqual(source[offset+channel])
        expect(printed[offset+channel]).toBeGreaterThanOrEqual(Math.round(source[offset+channel]*.88))
      }
      if(source[offset]) expect(printed[offset+1]/printed[offset]).toBeCloseTo(source[offset+1]/source[offset],1)
    }
    if(ink[0]===255&&ink[1]===255) expect(printed).toEqual(source)
    if(ink[0]===0&&ink[1]===0) expect(printed[0]).toBeLessThan(source[0])
  }
})
