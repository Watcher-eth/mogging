import { smoothMotion } from './report-motion'
import type { CanvasRect } from './canvas-layout'
import { videoSize } from './video-layout'

export type CaptionAppearance = { ink: string; tint: 'none' | 'light' | 'dark' }
const samples = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
const luminance = (value: number) => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4 }

export function captionAppearance(pixels: ArrayLike<number>): CaptionAppearance {
  const values: number[] = []
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255
    values.push((.2126 * luminance(pixels[index]) + .7152 * luminance(pixels[index + 1]) + .0722 * luminance(pixels[index + 2])) * alpha + 1 - alpha)
  }
  if (!values.length) return { ink: '#000', tint: 'none' }
  values.sort((a, b) => a - b)
  const darkContrast = (values[Math.floor((values.length - 1) * .1)] + .05) / .05
  const lightContrast = 1.05 / (values[Math.ceil((values.length - 1) * .9)] + .05)
  if (Math.max(darkContrast, lightContrast) >= 5) return { ink: darkContrast >= lightContrast ? '#000' : '#fff', tint: 'none' }
  const light = values.reduce((sum, value) => sum + value, 0) / values.length >= .4
  return { ink: light ? '#000' : '#fff', tint: light ? 'light' : 'dark' }
}

export function sampleCaptionAppearance(ctx: CanvasRenderingContext2D, frame: CanvasRect, fallback: string, classify = captionAppearance): CaptionAppearance {
  if (typeof document === 'undefined' || !ctx.canvas) return { ink: fallback, tint: 'none' }
  let sample = samples.get(ctx)
  if (!sample) {
    sample = document.createElement('canvas'); sample.width = 40; sample.height = 12
    samples.set(ctx, sample)
  }
  try {
    const target = sample.getContext('2d', { willReadFrequently: true })!, matrix = ctx.getTransform()
    target.clearRect(0, 0, sample.width, sample.height)
    target.drawImage(ctx.canvas, matrix.e + frame.x * matrix.a, matrix.f + frame.y * matrix.d, frame.width * matrix.a, frame.height * matrix.d, 0, 0, sample.width, sample.height)
    return classify(target.getImageData(0, 0, sample.width, sample.height).data)
  } catch { return { ink: fallback, tint: fallback === '#fff' ? 'dark' : 'light' } }
}

export function drawAdaptiveCaptionTint(ctx: CanvasRenderingContext2D, frame: CanvasRect, tint: CaptionAppearance['tint'], strength = 1) {
  if (tint === 'none' || strength <= 0) return
  const color = tint === 'light' ? '255,255,255' : '8,8,8'
  const feather = 180, top = frame.y - feather, height = frame.height + feather * 2
  const gradient = ctx.createLinearGradient(0, top, 0, top + height)
  const opacity = tint === 'light' ? .68 : .44
  for (let index = 0; index <= 32; index++) {
    const position = index / 32
    const envelope = smoothMotion(1 - Math.abs(position * 2 - 1))
    gradient.addColorStop(position, `rgba(${color},${opacity * envelope})`)
  }
  ctx.save(); ctx.globalAlpha *= strength; ctx.fillStyle = gradient
  // Feather across the whole screen, so there are no visible panel corners or side edges.
  ctx.fillRect(0, top, videoSize.width, height); ctx.restore()
}


type Surface = { tone: number; light: number; dark: number }
const contrastTransitions = new WeakMap<CanvasRenderingContext2D, { from: Surface; target: CaptionAppearance; since: number; last: number }>()
const surfaceFor = (appearance: CaptionAppearance): Surface => ({ tone: appearance.ink === '#fff' ? 255 : 0, light: Number(appearance.tint === 'light'), dark: Number(appearance.tint === 'dark') })

export function settleCaptionAppearance(ctx: CanvasRenderingContext2D, appearance: CaptionAppearance, timeMs: number, reduced = false) {
  if (reduced) { const surface = surfaceFor(appearance); return { ink: appearance.ink, light: surface.light, dark: surface.dark } }
  let state = contrastTransitions.get(ctx)
  if (!state || timeMs < state.last || timeMs - state.last > 500) {
    state = { from: surfaceFor(appearance), target: appearance, since: timeMs, last: timeMs }
    contrastTransitions.set(ctx, state)
  }
  const target = surfaceFor(state.target), amount = smoothMotion((timeMs - state.since) / 220)
  const current = { tone: state.from.tone + (target.tone - state.from.tone) * amount, light: state.from.light + (target.light - state.from.light) * amount, dark: state.from.dark + (target.dark - state.from.dark) * amount }
  if (appearance.ink !== state.target.ink || appearance.tint !== state.target.tint) {
    state.from = current; state.target = appearance; state.since = timeMs
  }
  state.last = timeMs
  const tone = Math.round(current.tone)
  return { ink: tone === 0 ? '#000' : tone === 255 ? '#fff' : `rgb(${tone},${tone},${tone})`, light: current.light, dark: current.dark }
}

// Annotation labels stay white on skin and dark imagery. Only a predominantly
// neutral, near-white surface switches to dark ink; warm highlights are not paper.
export function annotationAppearance(pixels: ArrayLike<number>): CaptionAppearance {
  let white=0, count=0
  for(let i=0;i<pixels.length;i+=4) {
    const channels=[pixels[i],pixels[i+1],pixels[i+2]], alpha=pixels[i+3]/255
    if(alpha<.1 || Math.min(...channels)>=224 && Math.max(...channels)-Math.min(...channels)<=18) white++
    count++
  }
  return {ink:count && white/count>=.82?'#171717':'#fff',tint:'none'}
}
