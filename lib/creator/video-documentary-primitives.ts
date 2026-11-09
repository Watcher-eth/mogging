import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { videoSize, sharedElementMotion, type VideoFrame } from './video-layout'

const { width: W, height: H } = videoSize
const mono = 'ui-monospace, Menlo, monospace'
export const fernFont = '"Mogging Share", Arial, sans-serif'

type FernTints = readonly [mist: string, warmth: string, quiet: string, signal: string]

export function fernPalette(dark: boolean, tints?: FernTints) {
  const [mist, warmth, quiet, signal] = tints ?? (dark
    ? ['#263b3c', '#3a3026', '#a5b6b1', '#e9bc7e']
    : ['#d9e8e1', '#f0e3d4', '#52635d', '#845934'])
  return dark
    ? { dark, ground: '#101719', edge: '#080c0e', light: mist, warmth, ink: '#e8ece6', quiet, line: quiet + '4d', signal, paper: '#f6f4ef' }
    : { dark, ground: '#fcfdfc', edge: '#f7f9f8', light: mist, warmth, ink: '#212825', quiet, line: quiet + '45', signal, paper: '#faf8f2' }
}
export type FernPalette = ReturnType<typeof fernPalette>

export function fernType(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, ink: string, maxWidth = W - x - 120) {
  ctx.fillStyle = ink
  ctx.font = `500 ${size}px ${mono}`
  ctx.fillText(text, x, y, maxWidth)
}

export function lightField(ctx: CanvasRenderingContext2D, palette: FernPalette, drift: number) {
  if (palette.dark) {
    const light = ctx.createRadialGradient(610 + drift * 180, 850, 90, 610, 1080, 1330)
    light.addColorStop(0, palette.light)
    light.addColorStop(.64, palette.ground)
    light.addColorStop(1, palette.edge)
    ctx.fillStyle = light
    ctx.fillRect(0, 0, W, H)
    return
  }
  ctx.fillStyle = palette.ground
  ctx.fillRect(0, 0, W, H)
  // Overlapping elliptical light fields give the white canvas depth at any render scale.
  const pool = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(width, height)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    gradient.addColorStop(0, color + 'ce')
    gradient.addColorStop(.48, color + '72')
    gradient.addColorStop(1, color + '00')
    ctx.fillStyle = gradient
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
  pool(W * .08 + drift * 90, H * .50, W * .91, H * .64, palette.light)
  pool(W * .96 - drift * 70, H * .37, W * .75, H * .53, palette.warmth)
  pool(W * .58, -H * .05, W * .9, H * .48, '#ffffff')
}

export function fernGlass(ctx: CanvasRenderingContext2D, box: VideoFrame, palette: FernPalette, radius = 25) {
  const { x, y, width, height } = box
  const glass = ctx.createLinearGradient(x, y, x + width * .72, y + height)
  glass.addColorStop(0, palette.dark ? '#253234ed' : '#fffffff2')
  glass.addColorStop(.52, palette.dark ? '#1a2227e6' : '#ffffffb3')
  glass.addColorStop(1, palette.dark ? '#172124ef' : palette.light + '67')
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fillStyle = glass
  ctx.shadowColor = palette.dark ? '#0007' : '#465b5521'
  ctx.shadowBlur = 31
  ctx.shadowOffsetY = 13
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = palette.dark ? '#e4f0eb38' : '#ffffffee'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

export function aperture(ctx: CanvasRenderingContext2D, drift: number, direction: number, dark: boolean, strength = 1) {
  ctx.save()
  if (direction < 0) { ctx.translate(W, 0); ctx.scale(-1, 1) }
  ctx.translate(drift * 64, 0)
  const shadow = ctx.createLinearGradient(0, 0, 305, 40)
  shadow.addColorStop(0, dark ? '#060b10' : '#71878238')
  shadow.addColorStop(.42, dark ? '#080d12e8' : '#8ca09a22')
  shadow.addColorStop(1, '#1a221a00')
  ctx.globalAlpha *= strength
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.moveTo(-W, 0); ctx.lineTo(305, 0); ctx.lineTo(104, H); ctx.lineTo(-W, H); ctx.fill()
  ctx.restore()
}

export function occlusionWipe(ctx: CanvasRenderingContext2D, direction: number, progress: number, ink: string) {
  ctx.save()
  if (direction < 0) { ctx.translate(W, 0); ctx.scale(-1, 1) }
  const edge = W + 160 - progress * (W + 330)
  const fade = ctx.createLinearGradient(edge - 115, 0, edge + 92, 0)
  fade.addColorStop(0, ink); fade.addColorStop(.58, ink); fade.addColorStop(1, ink + '00')
  ctx.fillStyle = fade
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(edge + 92, 0)
  ctx.lineTo(edge - 53, H); ctx.lineTo(0, H); ctx.fill()
  ctx.restore()
}

export function edgeFade(ctx: CanvasRenderingContext2D, ground: string, topDark: boolean, bottomStart = topDark ? 1560 : 1740) {
  const top = ctx.createLinearGradient(0, 0, 0, 690)
  const color = topDark ? '#0a1113' : '#ffffff'
  top.addColorStop(0, color + (topDark ? 'b0' : 'a8'))
  top.addColorStop(.5, color + (topDark ? '72' : '65'))
  top.addColorStop(1, color + '00')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 690)
  fernFalloff(ctx, ground, bottomStart)
}

export function fernWash(ctx: CanvasRenderingContext2D, color: string, top: number, bottom: number, opacity = 1) {
  const wash = ctx.createLinearGradient(0, top, 0, bottom)
  wash.addColorStop(0, color + '00')
  wash.addColorStop(.36, color)
  wash.addColorStop(.72, color)
  wash.addColorStop(1, color + '00')
  ctx.save()
  ctx.globalAlpha *= opacity
  ctx.fillStyle = wash
  ctx.fillRect(0, top, W, bottom - top)
  ctx.restore()
}

export function fernFalloff(ctx: CanvasRenderingContext2D, ground: string, start: number, end: number = H) {
  const bottom = ctx.createLinearGradient(0, start, 0, end)
  bottom.addColorStop(0, ground + '00')
  bottom.addColorStop(.64, ground + 'a8')
  bottom.addColorStop(1, ground)
  ctx.fillStyle = bottom
  ctx.fillRect(0, start, W, H - start)
}

export function documentMat(ctx: CanvasRenderingContext2D, frame: VideoFrame, fill: string, radius = 16) {
  ctx.save()
  ctx.shadowColor = '#33413928'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 15
  ctx.fillStyle = fill
  ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius); ctx.fill()
  ctx.restore()
}

export function documentGrid(ctx: CanvasRenderingContext2D, palette: FernPalette, phase = 0) {
  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.globalAlpha *= .5
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 70; x < W; x += 65) { ctx.moveTo(x, 550); ctx.lineTo(x, 1860) }
  for (let y = 570 + phase; y < 1860; y += 65) { ctx.moveTo(70, y); ctx.lineTo(W - 70, y) }
  ctx.stroke()
  ctx.restore()
}

export function locatorSweep(ctx: CanvasRenderingContext2D, anchor: NormalizedPoint, radius: number, progress: number, palette: FernPalette, reduced: boolean, ink: string) {
  if (progress <= 0) return
  ctx.save(); ctx.translate(anchor.x, anchor.y)
  ctx.globalAlpha *= sharedElementMotion(progress * 2.7)
  ctx.lineWidth = 3
  ctx.strokeStyle = ink + 'ad'
  for (const scale of [.44, .72, 1]) { ctx.beginPath(); ctx.arc(0, 0, radius * scale, 0, Math.PI * 2); ctx.stroke() }
  ctx.beginPath()
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI / 24, inner = radius - (i % 6 === 0 ? 15 : 6)
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  ctx.stroke()
  if (!reduced && progress < 1) {
    ctx.save(); ctx.globalAlpha *= 1 - sharedElementMotion((progress - .79) / .21)
    const angle = -.85 * Math.PI + progress * Math.PI * 2
    const beam = ctx.createConicGradient(angle - .58, 0, 0)
    beam.addColorStop(0, palette.signal + '00'); beam.addColorStop(.088, palette.signal + '45'); beam.addColorStop(.092, palette.signal + '00'); beam.addColorStop(1, palette.signal + '00')
    ctx.fillStyle = beam; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  ctx.strokeStyle = ink
  ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.moveTo(0, -17); ctx.lineTo(0, 17); ctx.stroke()
  ctx.restore()
}

export function displayScanlines(ctx: CanvasRenderingContext2D, frame: VideoFrame) {
  ctx.fillStyle = '#07090d20'
  ctx.beginPath()
  for (let y = frame.y + 4; y < frame.y + frame.height; y += 8) ctx.rect(frame.x, y, frame.width, 1.7)
  ctx.fill()
}

// The dot field is baked once from the photograph's shadows, then travels with its crop.
export function documentaryHalftone(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const scale = 360 / Math.max(image.naturalWidth, image.naturalHeight)
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#171016'
  ctx.beginPath()
  for (let y = 1; y < canvas.height; y += 2) {
    for (let x = 1 + (y % 4 === 1 ? 0 : 1); x < canvas.width; x += 2) {
      const i = 4 * (y * canvas.width + x)
      const light = (.213 * data[i] + .715 * data[i + 1] + .072 * data[i + 2]) / 255
      const radius = Math.max(0, .67 - light) * 1.34 * data[i + 3] / 255
      if (radius < .22) continue
      ctx.moveTo(x + radius, y)
      ctx.arc(x, y, radius, 0, Math.PI * 2)
    }
  }
  ctx.fill()
  return canvas
}
