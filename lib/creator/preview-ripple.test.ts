import { expect, test } from 'bun:test'
import { drawVideoRipple, prepareVideoRipple } from './preview-ripple'

test('video ripple prepares once, bounds its raster and updates textures without reallocating', () => {
  const calls: string[] = []
  const gl = new Proxy({}, { get: (_, key) => (..._args: unknown[]) => {
    calls.push(String(key))
    if (key === 'getShaderParameter' || key === 'getProgramParameter') return true
    return {}
  } }) as WebGLRenderingContext
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const canvas = () => ({ width: 0, height: 0, getContext: (kind: string) => kind === 'webgl' ? gl : { drawImage() {} } }) as unknown as HTMLCanvasElement
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: canvas } })
  try {
    const incoming = canvas(), previous = canvas()
    incoming.width = previous.width = 1080; incoming.height = previous.height = 2340
    const prepared = prepareVideoRipple(incoming), key = {}
    expect(prepared.canvas.width).toBe(720)
    expect(prepared.canvas.height).toBe(1560)
    const initialized = calls.length
    const ctx = { drawImage() {} } as unknown as CanvasRenderingContext2D
    for (const amount of [0, .2, .5, .8, 1, 0]) expect(drawVideoRipple(ctx, previous, incoming, key, amount)).toBe(true)
    expect(calls.filter(call => call === 'createProgram')).toHaveLength(1)
    expect(calls.filter(call => call === 'texImage2D')).toHaveLength(2)
    expect(calls.slice(initialized).includes('texImage2D')).toBe(false)
    expect(calls.filter(call => call === 'texSubImage2D')).toHaveLength(8)
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
