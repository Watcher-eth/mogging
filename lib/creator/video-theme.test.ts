import { expect, test } from 'bun:test'
import { darkVideoColor, originalVideoContext, videoThemeContext } from './video-theme'

test('dark graphics invert into neutral shades while preserving every alpha stop', () => {
  expect(darkVideoColor('#fff')).toBe('rgba(17,17,17,1)')
  expect(darkVideoColor('#000')).toBe('rgba(245,245,245,1)')
  for (const color of ['#fafbfc', '#171a20', '#00aaff', '#ffffff00', '#ffffff80', 'rgba(8,16,28,0.44)', 'rgba(255,255,255,0.125)']) {
    const channels = darkVideoColor(color).match(/[\d.]+/g)!.map(Number)
    expect(channels[0]).toBe(channels[1]); expect(channels[1]).toBe(channels[2])
  }
  expect(darkVideoColor('#fff0')).toBe('rgba(17,17,17,0)')
  expect(darkVideoColor('rgba(255,255,255,0.125)')).toBe('rgba(17,17,17,0.125)')
})

test('the theme changes drawn graphics and gradients without filtering, recoloring or replacing photographs', () => {
  const stops: Array<[number, string]> = [], photographs: unknown[][] = []
  const native = { fillStyle: '', strokeStyle: '', shadowColor: '', filter: 'none', createLinearGradient: () => ({ addColorStop: (position: number, color: string) => stops.push([position, color]) }), drawImage: (...args: unknown[]) => photographs.push(args) } as unknown as CanvasRenderingContext2D
  const ctx = videoThemeContext(native, 'dark')
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#123456'; ctx.shadowColor = '#0008'
  expect(native.fillStyle).toBe('rgba(17,17,17,1)')
  expect(native.strokeStyle).toMatch(/^rgba\((\d+),\1,\1,1\)$/)
  const gradient = ctx.createLinearGradient(0, 0, 0, 100)
  gradient.addColorStop(0, '#fff0'); gradient.addColorStop(1, '#fff')
  expect(stops).toEqual([[0, 'rgba(17,17,17,0)'], [1, 'rgba(17,17,17,1)']])
  const image = {} as HTMLImageElement
  ctx.drawImage(image, 10, 20)
  expect(photographs).toEqual([[image, 10, 20]])
  expect(native.filter).toBe('none')
  expect(videoThemeContext(native, 'dark')).toBe(ctx)
  expect(videoThemeContext(native, 'light')).toBe(native)
  expect(originalVideoContext(ctx)).toBe(native)
})


test('dark grid cards stay visibly lighter than the page without introducing coloured tints', () => {
  const shade = (color: string) => Number(darkVideoColor(color).match(/[\d.]+/)![0])
  const page = shade('#ffffff')
  for (const surface of ['#fafbfc', '#f8fafc', '#fdfdfe', '#f6f7f8']) {
    expect(shade(surface) - page).toBeGreaterThanOrEqual(10)
    expect(shade(surface)).toBeLessThan(50)
  }
})
