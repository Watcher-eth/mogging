import { expect, test } from 'bun:test'
import { captionDesign, captionLines, captionScroll, drawLyricsCaption } from './video-captions'
import type { VideoScene } from './video-composition'

test('lyrics wrap the complete text without changing word timing or word order', () => {
  const words = ['Look', 'at', 'the', 'eyes', 'then', 'the', 'jaw'].map((text, index) => ({ text, startMs: index * 400, endMs: index * 400 + 300 }))
  const scene = { text: words.map(word => word.text).join(' '), narration: words.map(word => word.text).join(' '), words, durationMs: 3000 } as VideoScene
  const lines = captionLines(scene, text => text.length * 90)
  expect(lines.flat().map(({ text, startMs, endMs }) => ({ text, startMs, endMs }))).toEqual(words)
  expect(lines.every(line => line.map(word => word.text).join(' ').length * 90 <= captionDesign.width)).toBe(true)
  expect(captionLines(scene, text => text.length * 90)).toEqual(lines)
})

test('one regular font is used throughout, with prominent report captions and larger explainers', () => {
  const fonts: string[] = []
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'globalAlpha' ? 1 : () => {}, set: (_, key, value) => { if (key === 'font') fonts.push(value); return true } }) as CanvasRenderingContext2D
  for (const kind of ['report', 'portrait', 'explainer'] as const) drawLyricsCaption(ctx, { source: { kind }, text: 'Look at the eyes.', narration: 'Look at the eyes.', durationMs: 3000 } as VideoScene, 1500, true, '#000')
  expect(fonts.map(font => font.match(/^400 (\d+)px/)?.[1])).toEqual(['68', '68', '76'])
  expect(fonts.every(font => font.includes('Mogging Share'))).toBe(true)
})

test('image captions frost only the glyphs without painting a white background', () => {
  const stops: [number, string][] = [], painted: string[] = []
  const styles = new Map<PropertyKey, unknown>()
  const gradient = { addColorStop: (offset: number, color: string) => stops.push([offset, color]) }
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'createLinearGradient' ? () => gradient : key === 'globalAlpha' ? 1 : () => { if (['fillRect', 'fill'].includes(String(key))) painted.push(String(key)) },
    set: (_, key, value) => { styles.set(key, value); return true },
  }) as CanvasRenderingContext2D
  drawLyricsCaption(ctx, { source: { kind: 'report' }, text: 'Open the report.', narration: 'Open the report.', durationMs: 3000 } as VideoScene, 1500, true, '#fff')
  expect(styles.get('fillStyle')).toBe(gradient)
  expect(styles.get('shadowBlur')).toBe(9)
  expect(stops).toHaveLength(3)
  expect(painted).toEqual([])
})

test('full-photo captions are slightly larger without changing the original regular font', () => {
  let font = ''
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'globalAlpha' ? 1 : () => {}, set: (_, key, value) => { if (key === 'font') font = value; return true } }) as CanvasRenderingContext2D
  drawLyricsCaption(ctx, { source: { kind: 'portrait', overlay: 'face-map' }, text: 'Look at the eyes.', narration: 'Look at the eyes.', durationMs: 3000 } as VideoScene, 1500, true, '#000')
  expect(font).toStartWith('400 72px "Mogging Share"')
})


test('fast caption cues continue their unfinished upward rolls without a boundary jump', () => {
  const words = ['One', 'Two', 'Three', 'Four', 'Five'].map((text, index) => ({ text, startMs: index * 100, endMs: (index + 1) * 100 }))
  const scene = { text: words.map(word => word.text).join(' '), narration: words.map(word => word.text).join(' '), words, durationMs: 1200 } as VideoScene
  const lines = captionLines(scene, text => text.includes(' ') ? captionDesign.width + 1 : 300)
  for (const boundary of [200, 300, 400]) {
    expect(captionScroll(lines, boundary + .01) - captionScroll(lines, boundary - .01)).toBeLessThan(.002)
  }
  expect(captionScroll(lines, 250)).toBeGreaterThan(0)
  expect(captionScroll(lines, 250)).toBeLessThan(1)
  expect(captionScroll(lines, 900)).toBe(3)
  expect(captionScroll(lines, 299, true)).toBe(1)
  expect(captionScroll(lines, 300, true)).toBe(2)
})

test('caption handoffs draw both groups moving upward through the same clipped window', () => {
  const previous = { source: { kind: 'portrait' }, text: 'Old caption', narration: 'Old caption', durationMs: 2000 } as VideoScene
  const scene = { ...previous, text: 'New caption', narration: 'New caption' }
  function render(progress: number, reduced = false) {
    let y = 0
    const stack: number[] = [], words: Array<{ text: string; y: number }> = []
    const ctx = new Proxy({}, { get: (_, key) => {
      if (key === 'save') return () => stack.push(y)
      if (key === 'restore') return () => { y = stack.pop()! }
      if (key === 'translate') return (_x: number, dy: number) => { y += dy }
      if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
      if (key === 'globalAlpha') return 1
      if (key === 'fillText') return (text: string, _x: number, baseline: number) => words.push({ text, y: y + baseline })
      return () => {}
    }, set: () => true }) as CanvasRenderingContext2D
    drawLyricsCaption(ctx, scene, 100, reduced, '#000', { previous, progress })
    return words
  }
  const before = render(.499), after = render(.501)
  for (const text of ['Old', 'New']) {
    const yBefore = before.find(word => word.text === text)!.y, yAfter = after.find(word => word.text === text)!.y
    expect(yAfter).toBeLessThan(yBefore)
    expect(yBefore - yAfter).toBeLessThan(1)
  }
  expect(render(0).some(word => word.text === 'New')).toBe(false)
  expect(render(1).some(word => word.text === 'Old')).toBe(false)
  expect(render(.5, true).some(word => word.text === 'Old')).toBe(false)
})
