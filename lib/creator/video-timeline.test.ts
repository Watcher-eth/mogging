import { expect, test } from 'bun:test'
import { drawMetricTimeline, metricTimelineVariant } from './video-timeline'

test('rulers enter from zero and finish with legible inactive graduations', () => {
  for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) for (const progress of [0, .25, .6, 1]) {
    let alpha = 1
    const stack: number[] = [], ticks: number[] = []
    const ctx = new Proxy({}, {
      get: (_, key) => key === 'save' ? () => stack.push(alpha) : key === 'restore' ? () => { alpha = stack.pop()! } : key === 'globalAlpha' ? alpha : key === 'stroke' ? () => ticks.push(alpha) : () => {},
      set: (_, key, value) => { if (key === 'globalAlpha') alpha = value; return true },
    }) as CanvasRenderingContext2D
    drawMetricTimeline(ctx, { width: 396, height: 220, position: .62, progress, variant, ink: '#11151a', muted: '#76808b', line: '#e1e8ee', accent: '#32b1ed', labels: false })
    expect(ticks.length).toBeGreaterThan(9)
    if(progress===0) expect(Math.max(...ticks)).toBe(0)
    else if(progress===1) expect(Math.min(...ticks)).toBeGreaterThanOrEqual(.24)
    else { expect(Math.min(...ticks)).toBeGreaterThanOrEqual(0); expect(Math.max(...ticks)).toBeGreaterThan(0) }
    expect(alpha).toBe(1)
    expect(stack).toHaveLength(0)
  }
})

test('instrument shapes are chosen by the measurement rather than cue order', () => {
  expect(metricTimelineVariant('jaw', 'Jaw angle')).toBe(1)
  expect(metricTimelineVariant('jaw', 'Jaw width')).toBe(0)
  expect(metricTimelineVariant('eyes', 'Eye shape')).toBe(4)
  expect(metricTimelineVariant('eyes', 'Canthal tilt')).toBe(1)
  expect(metricTimelineVariant('symmetry', 'Facial balance')).toBe(5)
  expect(metricTimelineVariant('skin', 'Skin texture')).toBe(2)
  expect(metricTimelineVariant('nose', 'Nasal projection')).toBe(3)
  expect(metricTimelineVariant('cheeks', 'Cheek width')).toBe(0)
  expect(metricTimelineVariant('jaw', 'Jaw angle', 1)).toBe(4)
  expect(metricTimelineVariant('overall', 'Overall score')).toBe(6)
})
