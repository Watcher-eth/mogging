import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { revealContour } from './face-treatment'
import type { EditionPhoto } from './video-documentary-edition-render'
import type { SurveyPin } from './video-documentary-registration'
import { fernFalloff, fernFont, fernType, type FernPalette } from './video-documentary-primitives'
import { videoSize, type VideoFrame } from './video-layout'

const { width: W, height: H } = videoSize
const frame = (x: number, y: number, width: number, height: number): VideoFrame => ({ x, y, width, height })
type Graphics = {
  paint: EditionPhoto
  palette: FernPalette
  feature: string
  x: number
  scale: number
  reveal: (delay: number, length: number) => number
}

function trace(ctx: CanvasRenderingContext2D, points: NormalizedPoint[], progress: number) {
  if (points.length < 2 || progress <= 0) return
  const [first, ...rest] = revealContour(points, progress)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (const point of rest) ctx.lineTo(point.x, point.y)
  ctx.stroke()
}

function smallTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string, width: number) {
  ctx.fillStyle = ink
  ctx.font = `600 43px ${fernFont}`
  ctx.fillText(text, x, y, width)
}

export function contourRelief(ctx: CanvasRenderingContext2D, { paint, palette, feature, x, scale, reveal }: Graphics, outline: NormalizedPoint[][], paths: NormalizedPoint[][]) {
  const points = [...outline, ...paths].flat()
  const left = Math.min(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y))
  const span = Math.max(.01, ...points.map(p => Math.max(p.x - left, p.y - top)))
  const project = (p: NormalizedPoint) => ({ x: 133 + (p.x - left) * 395 / span, y: 884 + (p.y - top) * 395 / span })
  paint(frame(490, 694, W - 490, 1070), { zoom: scale, drift: x, keepHead: true, matte: true })
  const hatch = ctx.createLinearGradient(134, 0, 615, 0)
  hatch.addColorStop(0, palette.light + 'a8')
  hatch.addColorStop(1, palette.light + '00')
  ctx.fillStyle = hatch
  ctx.fillRect(134, 825, 481, 4)
  fernType(ctx, 'CONTOUR RECORD', 136, 780, 22, palette.quiet, 350)
  ctx.save()
  ctx.lineJoin = 'round'
  for (let depth = 3; depth >= 0; depth--) {
    ctx.lineWidth = depth === 0 ? 3 : 2
    ctx.strokeStyle = palette.quiet + (depth === 0 ? 'a0' : '45')
    for (const path of outline) trace(ctx, path.map(project).map(p => ({ x: p.x + depth * 14, y: p.y - depth * 18 })), reveal(depth * 80, 590))
  }
  ctx.strokeStyle = palette.signal
  ctx.lineWidth = 3.5
  for (const [index, path] of paths.entries()) trace(ctx, path.map(project), reveal(240 + index * 90, 700))
  ctx.restore()
  smallTitle(ctx, feature, 136, 1400, palette.ink, 355)
  fernFalloff(ctx, palette.ground, 1480, 1764)
}

export function opticalBench(ctx: CanvasRenderingContext2D, { paint, palette, feature, x, scale, reveal }: Graphics) {
  const point = paint(frame(0, 590, W, H - 590), { zoom: scale, matte: true, keepHead: true, drift: x, isolate: true })
  fernFalloff(ctx, palette.ground, 1910, 2270)
  if (!point) return
  const amount = reveal(270, 540)
  if (!amount) return
  const radius = 145, cx = point.x > W * .5 ? 296 : 973, cy = 1670 - amount * 70
  const end = { x: cx + (point.x > cx ? radius : -radius), y: cy }
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.strokeStyle = palette.signal; ctx.lineWidth = 2
  ctx.setLineDash([5, 10])
  trace(ctx, [point, { x: end.x, y: point.y + 60 }, end], reveal(190, 660))
  ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip()
  ctx.fillStyle = palette.ground
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  paint(frame(cx - radius, cy - radius, radius * 2, radius * 2), { zoom: 3, focusY: .5, detail: true, secondary: true, isolate: true })
  ctx.restore()
  ctx.save(); ctx.globalAlpha *= amount
  ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2)
  ctx.strokeStyle = '#ffffffd9'; ctx.lineWidth = 5; ctx.stroke()
  ctx.textAlign = 'center'
  fernType(ctx, feature.toUpperCase(), cx, cy + radius + 47, 23, palette.ink, 314)
  ctx.restore()
}

export function contactPrint(ctx: CanvasRenderingContext2D, { paint, palette, feature, x, scale, reveal }: Graphics) {
  const box = frame(0, 604, W, H - 604)
  paint(box, { zoom: scale, keepHead: true, matte: true, drift: x })
  fernFalloff(ctx, palette.ground, 1660, 2110)
  const enter = reveal(120, 590), y = 1800 + 54 * (1 - enter)
  ctx.save()
  ctx.globalAlpha *= enter
  ctx.fillStyle = palette.dark ? '#263032' : '#333631'
  ctx.fillRect(0, y, W, 188)
  ctx.fillStyle = '#ffffff42'
  for (let tick = -1; tick < 25; tick++) {
    const left = tick * 62 + x
    ctx.beginPath(); ctx.roundRect(left, y + 13, 27, 9, 3); ctx.fill()
    ctx.beginPath(); ctx.roundRect(left, y + 167, 27, 9, 3); ctx.fill()
  }
  paint(frame(139, y + 32, 504, 122), { detail: true, zoom: 2.2, focusY: .5, secondary: true })
  fernType(ctx, 'CONTACT PRINT', 686, y + 73, 21, '#eee8d9', 385)
  smallTitle(ctx, feature, 684, y + 127, '#fff', 430)
  ctx.restore()
}

export function routingBoard(ctx: CanvasRenderingContext2D, { paint, palette, feature, x, scale, reveal }: Graphics) {
  const portrait = frame(0, 624, W, H - 624)
  const pin = paint(portrait, { zoom: scale, keepHead: true, matte: true, drift: -x, isolate: true })
  fernFalloff(ctx, palette.ground, 1910, 2270)
  if (!pin) return
  const right = pin.x < W * .48
  const advance = reveal(140, 640), enter = reveal(385, 490)
  const inset = frame(right ? 805 : 137, 680 - enter * 58, 337, 260)
  const dock = { x: right ? inset.x + inset.width - 32 : inset.x + 32, y: inset.y + inset.height }
  const elbow = { x: dock.x, y: pin.y + 76 }
  ctx.save()
  ctx.strokeStyle = palette.signal; ctx.lineWidth = 2.5
  trace(ctx, [pin, { x: pin.x + (right ? 74 : -74), y: elbow.y }, elbow, dock], advance)
  ctx.globalAlpha *= advance
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(pin.x, pin.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.globalAlpha *= enter
  ctx.fillStyle = palette.ground
  ctx.fillRect(inset.x - 8, inset.y - 8, inset.width + 16, inset.height + 16)
  paint(inset, { detail: true, zoom: 2.25, focusY: .5, secondary: true, isolate: true })
  fernType(ctx, feature.toUpperCase(), inset.x, inset.y - 28, 24, palette.ink, inset.width)
  ctx.restore()
}

export type SurveyGeometry = { outline: NormalizedPoint[][]; paths: NormalizedPoint[][] }

function plotGeometry(geometry: SurveyGeometry, box: VideoFrame) {
  const points = [...geometry.outline, ...geometry.paths].flat()
  if (!points.length) return
  const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y))
  const width = Math.max(.01, ...points.map(point => point.x - left))
  const height = Math.max(.01, ...points.map(point => point.y - top))
  const scale = Math.min(box.width / width, box.height / height)
  const project = (point: NormalizedPoint) => ({
    x: box.x + (box.width - width * scale) / 2 + (point.x - left) * scale,
    y: box.y + (box.height - height * scale) / 2 + (point.y - top) * scale,
  })
  return { outline: geometry.outline.map(path => path.map(project)), paths: geometry.paths.map(path => path.map(project)) }
}

function luminousTrace(ctx: CanvasRenderingContext2D, paths: NormalizedPoint[][], progress: number, color: string, width: number) {
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = color; ctx.fillStyle = '#fff9dc'
  ctx.shadowColor = color; ctx.shadowBlur = 17
  ctx.lineWidth = width
  for (const path of paths) {
    if (path.length < 2 || progress <= 0) continue
    const traced = revealContour(path, progress)
    trace(ctx, traced, 1)
    if (progress < 1) {
      const tip = traced[traced.length - 1]
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 5.5, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
}

function instrumentGround(ctx: CanvasRenderingContext2D, top: number, middle: string, bottom: string) {
  const field = ctx.createLinearGradient(0, top, 0, 2230)
  field.addColorStop(0, middle + '00')
  field.addColorStop(.25, middle)
  field.addColorStop(.74, bottom)
  field.addColorStop(1, bottom)
  ctx.fillStyle = field
  ctx.fillRect(0, top, W, H - top)
}

function grid(ctx: CanvasRenderingContext2D, box: VideoFrame, color: string, columns: number, rows: number) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6
  ctx.beginPath()
  for (let i = 0; i <= columns; i++) {
    const x = box.x + box.width * i / columns
    ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.height)
  }
  for (let i = 0; i <= rows; i++) {
    const y = box.y + box.height * i / rows
    ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.width, y)
  }
  ctx.stroke(); ctx.restore()
}

export function routeAtlas(ctx: CanvasRenderingContext2D, graphics: Graphics, geometry: SurveyGeometry) {
  const { paint, feature, x, scale, reveal } = graphics
  const plot = plotGeometry(geometry, frame(152 + x, 856, 998, 920))
  if (!plot?.paths.length) return opticalBench(ctx, graphics)
  instrumentGround(ctx, 480, '#182224', '#0e171a')
  grid(ctx, frame(93, 734, 1084, 1180), '#91b0b224', 10, 11)
  // The portrait remains a source reference while the actual contour becomes the main map.
  const photo = frame(150, 743, 231, 281)
  ctx.fillStyle = '#b0c4c469'; ctx.fillRect(photo.x - 2, photo.y - 2, photo.width + 4, photo.height + 4)
  paint(photo, { zoom: scale, keepHead: true })
  ctx.save()
  ctx.strokeStyle = '#bdccd2a8'; ctx.lineWidth = 3
  ctx.shadowColor = '#d5eefb89'; ctx.shadowBlur = 13
  for (const path of plot.outline) trace(ctx, path, reveal(100, 550))
  ctx.restore()
  luminousTrace(ctx, plot.paths, reveal(330, 1120), '#ffe178', 5)
  fernType(ctx, 'FEATURE TRACE', 150, 1962, 25, '#adc2c4', 380)
  smallTitle(ctx, feature, 149, 2024, '#f5f4ec', 810)
}

export function controlRoom(ctx: CanvasRenderingContext2D, graphics: Graphics, geometry: SurveyGeometry) {
  const { paint, feature, x, scale, reveal } = graphics
  const screen = frame(141 + x * .3, 677, 1019, 548)
  const plot = plotGeometry({ outline: [], paths: geometry.paths }, frame(screen.x + 123, screen.y + 152, screen.width - 246, 299))
  if (!plot?.paths.length) return routingBoard(ctx, graphics)
  instrumentGround(ctx, 478, '#263735', '#111a1d')
  const bloom = ctx.createRadialGradient(W / 2, 1000, 88, W / 2, 1000, 860)
  bloom.addColorStop(0, '#d6f4d250'); bloom.addColorStop(1, '#d6f4d200')
  ctx.fillStyle = bloom; ctx.fillRect(0, 538, W, 1510)
  ctx.save()
  ctx.fillStyle = '#152320'; ctx.shadowColor = '#cbebcd57'; ctx.shadowBlur = 46
  ctx.beginPath(); ctx.roundRect(screen.x, screen.y, screen.width, screen.height, 12); ctx.fill()
  ctx.restore()
  grid(ctx, frame(screen.x + 43, screen.y + 115, screen.width - 86, 384), '#c1dcc332', 10, 4)
  fernType(ctx, 'REGISTERED FEATURE', screen.x + 43, screen.y + 66, 25, '#c4d6c4', 550)
  ctx.save(); ctx.setLineDash([7, 12])
  luminousTrace(ctx, plot.paths, reveal(270, 870), '#d9f5d4', 5)
  ctx.restore()
  paint(frame(170, 1310, 520, 596), { zoom: scale, matte: true, keepHead: true, drift: -x })
  const line = reveal(420, 630)
  ctx.fillStyle = '#b7dbc794'; ctx.fillRect(724, 1519, 296 * line, 3)
  smallTitle(ctx, feature, 724, 1583, '#eef4ed', 390)
  fernFalloff(ctx, '#111a1d', 1750, 1906)
}

export function practicalLightVault(ctx: CanvasRenderingContext2D, { paint, palette, x, scale, reveal }: Graphics) {
  instrumentGround(ctx, 450, '#39444b', '#192328')
  const vanishing = W * .51 - x * 2.5, depth = reveal(0, 970)
  ctx.save()
  ctx.strokeStyle = '#0c15197d'; ctx.lineWidth = 4
  ctx.beginPath()
  for (let i = -4; i <= 4; i++) {
    ctx.moveTo(vanishing + i * 290, 475)
    ctx.lineTo(vanishing + i * 47, 1134)
  }
  for (const y of [539, 667, 786, 880, 953, 1009, 1051, 1083]) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
  ctx.stroke()
  // Luminous overhead panels share the perspective of the room, while the portrait drifts independently.
  for (const [i, y] of [615, 735, 832].entries()) {
    const cx = vanishing + (i - 1) * 176, spread = 174 - i * 37
    const light = ctx.createRadialGradient(cx, y, 12, cx, y + 35, spread)
    light.addColorStop(0, '#ecf8f6a6'); light.addColorStop(.29, '#e3f5ef53'); light.addColorStop(1, '#d5eff400')
    ctx.fillStyle = light; ctx.fillRect(cx - spread, y - spread + 35, spread * 2, spread * 2)
    ctx.fillStyle = '#e2efebce'
    ctx.fillRect(cx - spread * .27, y, spread * .54, 6)
  }
  ctx.restore()
  paint(frame(0, 635, W, H - 635), { zoom: scale * (1 + depth * .038), keepHead: true, matte: true, drift: x * .62 })
  const rim = ctx.createLinearGradient(0, 0, W, 1500)
  rim.addColorStop(0, '#dde7d700'); rim.addColorStop(.39, '#b8dcd100')
  rim.addColorStop(.50, '#dff8e924'); rim.addColorStop(.65, '#dff8e900'); rim.addColorStop(1, '#dff8e900')
  ctx.fillStyle = rim; ctx.fillRect(0, 0, W, H)
  fernFalloff(ctx, palette.dark ? '#101b21' : '#202d34', 1920, 2270)
}

export function numberedSurvey(ctx: CanvasRenderingContext2D, { paint, palette, feature, x, scale, reveal }: Graphics, pins: SurveyPin[]) {
  if (!pins.length) return paint(frame(0, 618, W, H - 618), { zoom: scale, keepHead: true, matte: true, drift: x })
  let locations: (NormalizedPoint | undefined)[] = []
  paint(frame(0, 650, W, H - 650), { zoom: scale, keepHead: true, matte: true, drift: x,
    register: project => { locations = pins.map(pin => project(pin.point)) } })
  fernFalloff(ctx, palette.ground, 1920, 2260)
  // Numbered flags lift away from the surface. Their feet stay on the observed landmarks.
  pins.forEach(({ label }, i) => {
    const anchor = locations[i]
    const progress = reveal(135 + i * 140, 510)
    if (!anchor || !progress) return
    const side = Math.abs(anchor.x - W / 2) > 48 ? Math.sign(anchor.x - W / 2) : i % 2 ? 1 : -1
    const x = Math.max(154, Math.min(923, anchor.x + side * (170 + i * 21)))
    const y = Math.max(692, Math.min(1760, anchor.y - 119 - (1 - progress) * 30))
    ctx.save(); ctx.globalAlpha *= progress
    ctx.lineWidth = 2.5; ctx.strokeStyle = palette.signal
    trace(ctx, [anchor, { x, y: y + 31 }], progress)
    ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke()
    ctx.textAlign = side < 0 ? 'right' : 'left'
    const inset = side * 18
    ctx.fillStyle = palette.signal
    ctx.font = `700 74px ${fernFont}`
    ctx.fillText(String(i + 1).padStart(2, '0'), x + inset, y, 108)
    fernType(ctx, label.toUpperCase(), x + inset, y + 41, 27, palette.ink, 155)
    ctx.restore()
  })
  fernType(ctx, feature.toUpperCase(), 148, 1900, 25, palette.quiet, 440)
}
