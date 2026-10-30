import { videoSize } from './video-layout'
import { expect, test } from 'bun:test'
import { compileAnalysisVideo, parseComposition } from './video-composition'
import { actionMentionEnd, alignVideoVoiceover, captionWordCues, narrationText } from './video-voiceover'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import { featureStageLayout } from './video-layout'
import { reportCategories } from './mock-report-data'
import { drawMockReport } from './mock-report'
import type { ContentSlide } from './content-generator'

const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Sample', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' }
const build = () => compileAnalysisVideo(scriptToPlan('Open eyes. Highlight jaw contour.'), input, ['face'], 'brand', reportCategories)
const words = [
  { text: 'Open', startMs: 300, endMs: 550 }, { text: 'eyes.', startMs: 700, endMs: 1000 },
  { text: 'Highlight', startMs: 1700, endMs: 2200 }, { text: 'jaw', startMs: 2500, endMs: 2800 }, { text: 'contour.', startMs: 2900, endMs: 3400 },
]

test('caption swishes follow word timestamps and preserve long spoken pauses', () => {
  const scene = { narration: 'Highlight jaw contour.', durationMs: 4000, words: words.slice(2) }
  const cues = captionWordCues(scene, 'Jaw contour.')
  expect(cues.map(cue => cue.startMs)).toEqual([2500, 2900])
  expect(cues.every(cue => cue.matched)).toBe(true)
  const estimate = captionWordCues({ ...scene, words: undefined }, 'Jaw contour.')
  expect(estimate.every(cue => !cue.matched && cue.endMs > cue.startMs)).toBe(true)
  expect(estimate[1].startMs).toBeGreaterThanOrEqual(estimate[0].startMs)
})

test('restoring narration preserves complete cues so repeated recuts cannot turn an app instruction into a graphic fragment', () => {
  const script = 'Read the scale before judging a single feature. Open the eye report and highlight eye spacing.'
  const original = compileAnalysisVideo(scriptToPlan(script), input, ['face'], 'brand', reportCategories, { recipe: 'hybrid-story' })
  const restored = narrationText(original)
  expect(restored).toBe('Read the scale before judging a single feature.\n\nOpen the eye report and highlight eye spacing.')
  const recut = compileAnalysisVideo(scriptToPlan(restored), input, ['face'], 'brand', reportCategories, { recipe: 'hybrid-story' })
  expect(recut.scenes.map(scene => ({ narration: scene.narration, kind: scene.source.kind, cueId: scene.cueId }))).toEqual(original.scenes.map(scene => ({ narration: scene.narration, kind: scene.source.kind, cueId: scene.cueId })))
})

test('checkbox cues require mentioned actions and wait until the matching speech finishes', () => {
  const scene = { narration: 'Keep your grooming routine consistent.', durationMs: 4000, words: [
    { text: 'grooming', startMs: 900, endMs: 1400 }, { text: 'routine', startMs: 1600, endMs: 1900 }, { text: 'consistent.', startMs: 2300, endMs: 2700 },
  ] }
  expect(actionMentionEnd(scene, 'Keep your grooming routine consistent.')).toBe(2700)
  expect(actionMentionEnd(scene, 'Review your daily Protocol tasks each morning.')).toBeNull()
  expect(actionMentionEnd(scene, '')).toBeNull()
})

test('voice alignment preserves pauses, exact narration and the complete audio duration', () => {
  const source = build()
  const result = alignVideoVoiceover(source, { words }, 4000)
  expect(result.durationMs).toBe(4000)
  expect(result.scenes.map(scene => scene.startMs)).toEqual([0, 1700])
  expect(result.scenes[0].words![0].startMs).toBe(300)
  expect(result.scenes[1].words!.at(-1)!.endMs).toBe(1700)
  expect(narrationText(result)).toBe(narrationText(source))
  expect(result.scenes[0].tracks.find(track => track.target === 'report')?.startMs).toBe(300)
  expect(result.scenes[1].tracks.find(track => track.target === 'overlay')?.startMs).toBe(0)
  expect(parseComposition(JSON.parse(JSON.stringify(result)))).toEqual(result)
  expect(source.scenes[0].words).toBeUndefined()
})

test('word-bound cues resolve to actual speech rather than stretching guessed timings', () => {
  const source = build()
  source.scenes[1].tracks.find(track => track.target === 'overlay')!.wordIndex = 1
  const result = alignVideoVoiceover(source, { words }, 4000)
  expect(result.scenes[1].tracks.find(track => track.target === 'overlay')?.startMs).toBe(800)
  expect(result.scenes[1].words![1].text).toBe('jaw')
})

test('alignment rejects mismatched scripts, extra words, overlaps and invalid timestamps', () => {
  expect(() => alignVideoVoiceover(build(), { words: words.slice(1) }, 4000)).toThrow('does not match')
  expect(() => alignVideoVoiceover(build(), { words: [...words, { text: 'Extra', startMs: 3500, endMs: 3700 }] }, 4000)).toThrow('after the end')
  expect(() => alignVideoVoiceover(build(), { words: words.map((word, index) => index === 1 ? { ...word, startMs: 500 } : word) }, 4000)).toThrow('non-overlapping')
  expect(() => alignVideoVoiceover(build(), { words }, 3000)).toThrow('within the audio')
  expect(() => alignVideoVoiceover(build(), { words }, NaN)).toThrow()
  const source = build()
  source.scenes[1].tracks[0].wordIndex = 20
  expect(() => alignVideoVoiceover(source, { words }, 4000)).toThrow('beyond its narration')
})

test('editorial cards overlap the lower portrait while retaining safe margins and native proportions', () => {
  for (const layout of ['stacked', 'split', 'portrait'] as const) for (const region of [{ width: 354, height: 145 }, { width: 354, height: 410 }]) {
    const { face, metric } = featureStageLayout(region, layout)
    for (const rect of [face, metric]) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(260)
      expect(rect.x + rect.width).toBeLessThanOrEqual(1316)
      expect(rect.y + rect.height).toBeLessThanOrEqual(videoSize.height - 120)
    }
    const overlap = face.y + face.height - metric.y
    expect(overlap).toBeGreaterThanOrEqual(150)
    expect(overlap).toBeLessThanOrEqual(400)
    expect(metric.width / metric.height).toBeCloseTo(region.width / region.height)
  }
})


test('video reports use the entire viewport and ease into white without app controls', () => {
  const render = (presentation: 'app' | 'video') => {
    const labels: string[] = [], clips: number[][] = [], stops: Array<[number, string]> = []
    let closeButtons = 0
    const ctx = new Proxy({}, { get: (_, key) => {
      if (key === 'fillText') return (text: string) => { labels.push(text) }
      if (key === 'moveTo') return (x: number, y: number) => { if (x === 359 && y === 76) closeButtons++ }
      if (key === 'rect') return (...rect: number[]) => clips.push(rect)
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (key === 'createLinearGradient') return (_x: number, y: number, _endX: number, endY: number) => ({ addColorStop: (position: number, color: string) => { if (y === 510 && endY === 620) stops.push([position, color]) } })
      return () => {}
    }, set: () => true }) as CanvasRenderingContext2D
    const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: reportCategories[0], scroll: 0 } } as ContentSlide
    drawMockReport(ctx, slide, null, null, 390, 620, 2000, undefined, { viewportHeight: 620, presentation })
    return { labels, clips, stops, closeButtons }
  }
  const video = render('video'), app = render('app')
  expect(video.clips).toContainEqual([0, 0, 390, 620])
  expect(video.labels).not.toContain('SHARE YOUR SCORE')
  expect(video.closeButtons).toBe(0)
  expect(app.labels).toContain('SHARE YOUR SCORE')
  expect(app.closeButtons).toBe(1)
  expect(video.stops[0]).toEqual([0, 'rgba(255,255,255,0)'])
  expect(video.stops.at(-1)).toEqual([1, 'rgba(255,255,255,1)'])
  expect(video.stops[3][1]).toContain('0.146446')
})

test('legacy compact layouts upgrade to a large centered face without changing scene timing', () => {
  const source = build()
  source.scenes[1].layout = 'split'
  const result = parseComposition(source)
  expect(result.scenes[1].layout).toBe('stacked')
  expect(result.durationMs).toBe(source.durationMs)
  expect(featureStageLayout({ width: 354, height: 145 }, result.scenes[1].layout).face.width).toBe(videoSize.width)
})
