import { expect, test } from 'bun:test'
import { drawMockProgress, sampleProgress, mockProgressScrollMax } from './mock-progress'

test('progress exports draw current navigation and handle endpoints without invalid geometry', () => {
  for (const score of [0, 7.2, 10, Number.NaN]) for (const scroll of [0, mockProgressScrollMax]) {
    let saves = 0
    const labels: string[] = []
    const context = new Proxy({}, { get: (_target, key) => {
      if (key === 'fillText') return (value: string) => labels.push(value)
      if (key === 'measureText') return (value: string) => ({ width: value.length * 14 })
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} })
      if (key === 'save') return () => saves++
      if (key === 'restore') return () => saves--
      return (...args: unknown[]) => { for (const arg of args) if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true) }
    } }) as CanvasRenderingContext2D
    drawMockProgress(context, { ...sampleProgress, score, scroll }, 1170, 2532, 1200)
    expect(labels).toContain('Courses')
    expect(labels).toContain('Progress')
    expect(labels).not.toContain('Battle')
    expect(labels).not.toContain('Leaderboard')
    expect(labels.some(label => label.includes('NaN'))).toBe(false)
    expect(saves).toBe(0)
  }
})
