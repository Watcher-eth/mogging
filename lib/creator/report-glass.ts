import { smoothMotion } from './report-motion'
import type { CanvasRect } from './canvas-layout'

const samples = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

// Sample the content beneath each control, not the whole portrait or page.
export function reportGlassInk(canvas: HTMLCanvasElement, rect: CanvasRect): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark'
  let context = samples.get(canvas)
  if (!context) {
    const surface = document.createElement('canvas')
    surface.width = 8; surface.height = 4
    context = surface.getContext('2d', { willReadFrequently: true })!
    samples.set(canvas, context)
  }
  const scale = canvas.width / 390
  try {
    context.drawImage(canvas, rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale, 0, 0, 8, 4)
    const pixels = context.getImageData(0, 0, 8, 4).data
    let luminance = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const channels = [pixels[i], pixels[i + 1], pixels[i + 2]].map(value => {
        const tinted = (value * .9 + 255 * .1) / 255
        return tinted <= .04045 ? tinted / 12.92 : ((tinted + .055) / 1.055) ** 2.4
      })
      luminance += .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
    }
    return luminance / 32 < .179 ? 'light' : 'dark'
  } catch {
    // Cross-origin portraits can prevent pixel reads; keep the light glass legible.
    return 'dark'
  }
}

const headerSurfaces = new WeakMap<CanvasRenderingContext2D, { source: HTMLCanvasElement; layer: HTMLCanvasElement }>()

export function drawReportHeaderGlass(ctx: CanvasRenderingContext2D, width: number, scroll: number) {
  const amount = smoothMotion((scroll - 24) / 160)
  if (!amount) return
  ctx.save(); ctx.globalAlpha *= amount
  const height = 152
  if (typeof document !== 'undefined') {
    let surfaces = headerSurfaces.get(ctx)
    if (!surfaces) {
      const create = () => { const canvas = document.createElement('canvas'); canvas.width = 585; canvas.height = 264; return canvas }
      surfaces = { source: create(), layer: create() }; headerSurfaces.set(ctx, surfaces)
    }
    const { source, layer } = surfaces, snapshot = source.getContext('2d')!, blurred = layer.getContext('2d')!
    const matrix = ctx.getTransform(), scale = source.width / width
    snapshot.clearRect(0, 0, source.width, source.height)
    snapshot.drawImage(ctx.canvas, matrix.e, matrix.f, width * matrix.a, 176 * matrix.d, 0, 0, source.width, source.height)
    blurred.clearRect(0, 0, layer.width, layer.height); blurred.globalCompositeOperation = 'source-over'
    blurred.filter = `blur(${16 * scale}px)`; blurred.drawImage(source, 0, 0); blurred.filter = 'none'
    blurred.globalCompositeOperation = 'destination-in'
    const mask = blurred.createLinearGradient(0, 0, 0, height * scale)
    for (let i = 0; i <= 16; i++) mask.addColorStop(i / 16, `rgba(255,255,255,${smoothMotion(1 - i / 16)})`)
    blurred.fillStyle = mask; blurred.fillRect(0, 0, layer.width, layer.height)
    ctx.drawImage(layer, 0, 0, width, 176)
  }
  const tint = ctx.createLinearGradient(0, 0, 0, height)
  for (let i = 0; i <= 16; i++) tint.addColorStop(i / 16, `rgba(255,255,255,${.08 * smoothMotion(1 - i / 16)})`)
  ctx.fillStyle = tint; ctx.fillRect(0, 0, width, height); ctx.restore()
}
