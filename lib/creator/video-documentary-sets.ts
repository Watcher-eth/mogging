import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { sharedElementMotion, videoSize, type VideoFrame } from './video-layout'
import { fernFont, fernGlass, fernType, type FernPalette } from './video-documentary-primitives'
import { drawVideoTextMorph } from './video-pill-morph'
import { activeSpokenScores } from './spoken-score'
import { sceneWordStart } from './video-script'
import { revealContour } from './face-treatment'
import { applyGlassInk } from './glass-overlay'
import type { VideoScene } from './video-composition'

const { width: W, height: H } = videoSize
type Paint = (box: VideoFrame) => void

export function documentaryRoom(ctx: CanvasRenderingContext2D, palette: FernPalette, drift: number) {
  const vanishing = W * .53 - drift * 145, horizon = 1190
  const floor = ctx.createLinearGradient(0, horizon, 0, H)
  floor.addColorStop(0, palette.ground + '00'); floor.addColorStop(.45, palette.light + '80'); floor.addColorStop(1, palette.edge)
  ctx.fillStyle = floor; ctx.fillRect(0, horizon, W, H - horizon)
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = -5; i <= 5; i++) {
    ctx.moveTo(vanishing + i * 32, horizon)
    ctx.lineTo(vanishing + i * 370, H)
  }
  for (const y of [1260, 1300, 1352, 1419, 1506, 1620, 1767, 1957, 2205]) {
    ctx.moveTo(0, y); ctx.lineTo(W, y)
  }
  ctx.stroke()
}

export function practicalLight(ctx: CanvasRenderingContext2D, palette: FernPalette, point: NormalizedPoint, drift: number, dark: boolean) {
  const x = point.x + drift * 175, y = point.y - 120 - drift * 100
  const shadow = ctx.createRadialGradient(x, y, 230, x, y, 850)
  shadow.addColorStop(0, palette.edge + '00')
  shadow.addColorStop(.51, palette.edge + '10')
  shadow.addColorStop(1, dark ? palette.edge + 'ad' : palette.quiet + '20')
  ctx.fillStyle = shadow; ctx.fillRect(0, 0, W, H)
}

export function chapterTitle(ctx: CanvasRenderingContext2D, name: string, palette: FernPalette, amount: number) {
  if (!name || amount <= 0) return
  ctx.save()
  ctx.globalAlpha *= amount
  ctx.translate(0, (1 - amount) * 24)
  ctx.textAlign = 'center'; ctx.font = `700 182px ${fernFont}`
  ctx.shadowColor = palette.signal + '74'; ctx.shadowBlur = 34
  ctx.fillStyle = palette.signal
  ctx.fillText(name.toUpperCase(), W / 2, 793, W - 230)
  ctx.restore()
}

export function gateFrame(ctx: CanvasRenderingContext2D, box: VideoFrame, palette: FernPalette, label: string, index: number, paint: Paint) {
  fernGlass(ctx, { x: box.x - 18, y: box.y - 55, width: box.width + 36, height: box.height + 106 }, palette, 23)
  ctx.fillStyle = palette.dark ? '#0b1113' : '#ffffff86'
  ctx.fillRect(box.x, box.y, box.width, box.height)
  paint(box)
  ctx.save(); ctx.fillStyle = palette.dark ? '#03070726' : '#38423d0b'
  ctx.beginPath()
  for (let y = box.y + 3; y < box.y + box.height; y += 9) ctx.rect(box.x, y, box.width, 1.35)
  ctx.fill(); ctx.restore()
  fernType(ctx, label, box.x + 2, box.y - 17, 23, palette.ink, box.width - 75)
  ctx.save(); ctx.textAlign = 'right'
  fernType(ctx, String(index + 1).padStart(2, '0'), box.x + box.width - 4, box.y - 17, 22, palette.signal, 52)
  ctx.restore()
  ctx.fillStyle = palette.signal + '9e'; ctx.fillRect(box.x, box.y + box.height + 22, 54, 3)
}

export function projectionGlass(ctx: CanvasRenderingContext2D, box: VideoFrame, progress: number) {
  if (progress <= 0 || progress >= 1) return
  const y = box.y + box.height * progress
  const glow = ctx.createLinearGradient(0, y - 95, 0, y + 32)
  glow.addColorStop(0, '#eef8ff00'); glow.addColorStop(.74, '#eef8ff20'); glow.addColorStop(1, '#eef8ff00')
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip()
  ctx.fillStyle = glow; ctx.fillRect(box.x, y - 95, box.width, 127)
  ctx.restore()
}

export function reelGutter(ctx: CanvasRenderingContext2D, box: VideoFrame, phase: number) {
  ctx.save(); ctx.beginPath(); ctx.rect(box.x - 54, box.y, box.width + 108, box.height); ctx.clip()
  ctx.fillStyle = '#202526'; ctx.fillRect(box.x - 53, box.y, 48, box.height); ctx.fillRect(box.x + box.width + 5, box.y, 48, box.height)
  ctx.fillStyle = '#a09f88'
  for (let y = box.y - 63 + phase * 63; y < box.y + box.height; y += 63) {
    ctx.fillRect(box.x - 37, y, 16, 22); ctx.fillRect(box.x + box.width + 21, y, 16, 22)
  }
  ctx.restore()
}

export function filmShutter(ctx: CanvasRenderingContext2D, progress: number, palette: FernPalette) {
  if (progress >= 1) return
  const gate = H * .62 * (1 - progress)
  ctx.fillStyle = palette.edge; ctx.fillRect(0, 0, W, gate); ctx.fillRect(0, H - gate, W, gate)
  ctx.fillStyle = '#f8d39c30'; ctx.fillRect(0, gate, W, 4)
}

export function contourPlate(ctx: CanvasRenderingContext2D, paths: NormalizedPoint[][], guides: NormalizedPoint[][], label: string, palette: FernPalette, drift: number, amount: number) {
  documentaryRoom(ctx, palette, drift)
  const points = paths.flat()
  const bounds = [...points, ...guides.flat()]
  const left = Math.min(...bounds.map(p => p.x)), right = Math.max(...bounds.map(p => p.x))
  const top = Math.min(...bounds.map(p => p.y)), bottom = Math.max(...bounds.map(p => p.y))
  const span = Math.max(right - left, bottom - top)
  if (points.length < 2 || span < .001) return
  const x = 610 + drift * 65, y = 1120
  const project = (p: NormalizedPoint) => ({ x: x + (p.x - (left + right) / 2) * 793 / span, y: y + (p.y - (top + bottom) / 2) * 793 / span })
  ctx.save()
  ctx.strokeStyle = palette.quiet + '8a'; ctx.lineWidth = 2.6
  const trace = (points: NormalizedPoint[], dx = 0, dy = 0) => {
    ctx.beginPath()
    points.forEach((p, i) => i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy))
    ctx.stroke()
  }
  for (const [index, path] of guides.entries()) {
    ctx.setLineDash(index === 0 ? [10, 6] : [])
    trace(path.map(project))
  }
  ctx.setLineDash([])
  ctx.lineJoin = 'round'
  const depth = 34 + drift * 30
  for (const [index, path] of paths.entries()) {
    const line = revealContour(path.map(project), sharedElementMotion(amount * 1.25 - index * .12))
    ctx.strokeStyle = palette.line; ctx.lineWidth = 2
    trace(line, depth, -34)
    ctx.strokeStyle = palette.signal; ctx.lineWidth = 5
    trace(line)
  }
  const rail = 1060, y1 = 1120 - 396, y2 = 1120 + 396
  ctx.globalAlpha *= sharedElementMotion((amount - .45) / .55)
  ctx.lineWidth = 2.2; ctx.strokeStyle = palette.quiet
  ctx.beginPath(); ctx.moveTo(rail, y1); ctx.lineTo(rail, y2)
  for (const y of [y1, y2]) { ctx.moveTo(rail - 14, y); ctx.lineTo(rail + 14, y) }
  ctx.stroke()
  fernType(ctx, 'REGISTERED PHOTO PLANE', 153, 1580, 23, palette.quiet)
  ctx.font = `600 68px ${fernFont}`; ctx.fillStyle = palette.ink; ctx.fillText(label, 148, 1670, 980)
  ctx.restore()
}

export function registeredInk(ctx: CanvasRenderingContext2D, paths: NormalizedPoint[][], age: number, reduced: boolean, ink: string) {
  ctx.save()
  for (const [index, path] of paths.entries()) {
    const p = reduced ? 1 : sharedElementMotion((age - index * 105) / 510)
    if (p <= 0) continue
    const line = revealContour(path, p)
    applyGlassInk(ctx, 1, index === 0 ? 4.2 : 3.15, ink)
    ctx.setLineDash(index % 3 === 2 ? [5, 7] : [])
    ctx.beginPath()
    line.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
    ctx.stroke()
  }
  ctx.restore()
}

export function specimenPin(ctx: CanvasRenderingContext2D, point: NormalizedPoint, palette: FernPalette, amount: number) {
  if (amount <= 0) return
  ctx.save()
  ctx.globalAlpha *= amount
  const x = point.x, y = point.y, toward = x < 658 ? 1 : -1
  ctx.strokeStyle = palette.signal; ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + toward * 16, y)
  ctx.lineTo(x + toward * 69 * amount, y - 34 * amount)
  ctx.lineTo(x + toward * 144 * amount, y - 34 * amount); ctx.stroke()
  ctx.restore()
}

export function evidenceSequence(ctx: CanvasRenderingContext2D, palette: FernPalette, second: boolean, amount: number) {
  const x = 230, end = 1090, y = 1740, a = 402, b = 932
  ctx.save()
  ctx.fillStyle = palette.line; ctx.fillRect(x, y, end - x, 2)
  ctx.shadowColor = palette.signal + '70'; ctx.shadowBlur = 14
  ctx.fillStyle = palette.signal; ctx.fillRect(x, y - 1, ((second ? b : a) - x) * amount, 3)
  ctx.shadowBlur = 0
  for (const [index, position] of [a, b].entries()) {
    ctx.fillStyle = index === Number(second) ? palette.signal : palette.quiet
    ctx.fillRect(position - 1.5, y - 11, 3, 24)
    ctx.textAlign = 'center'
    fernType(ctx, index ? 'NEXT VIEW' : 'FIRST VIEW', position, y + 49, 22, palette.ink, 174)
  }
  ctx.restore()
}

const scoreBands = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()

function scoreBed(ctx: CanvasRenderingContext2D, top: number, palette: FernPalette) {
  const { canvas } = ctx
  let band = scoreBands.get(canvas)
  if (!band) {
    band = document.createElement('canvas').getContext('2d') ?? undefined
    if (band) scoreBands.set(canvas, band)
  }
  const height = H - top
  if (band) {
    const w = Math.ceil(W / 6), h = Math.ceil(height / 6)
    if (band.canvas.width !== w || band.canvas.height !== h) {
      band.canvas.width = w
      band.canvas.height = h
    }
    band.clearRect(0, 0, w, h)
    band.save()
    band.filter = 'blur(3px)'
    band.drawImage(canvas, 0, top / H * canvas.height, canvas.width, height / H * canvas.height, -10, -10, w + 20, h + 20)
    band.filter = 'none'
    band.globalCompositeOperation = 'destination-in'
    const mask = band.createLinearGradient(0, 0, 0, h)
    mask.addColorStop(0, '#0000'); mask.addColorStop(.41, '#000e'); mask.addColorStop(1, '#000')
    band.fillStyle = mask; band.fillRect(0, 0, w, h)
    band.restore()
    ctx.drawImage(band.canvas, 0, top, W, height)
  }
  const fade = ctx.createLinearGradient(0, top, 0, H)
  fade.addColorStop(0, palette.ground + '00')
  fade.addColorStop(.36, palette.ground + 'ad')
  fade.addColorStop(.68, palette.ground + 'e8')
  fade.addColorStop(1, palette.ground)
  ctx.fillStyle = fade
  ctx.fillRect(0, top, W, height)
}

export function documentaryScores(ctx: CanvasRenderingContext2D, scene: VideoScene, local: number, reduced: boolean, palette: FernPalette, variation: number) {
  const active = activeSpokenScores(scene, local), cue = active.at(-1)
  if (!cue) return
  const wordTime = sceneWordStart(scene, cue.word), age = local - wordTime
  const progress = reduced ? 1 : sharedElementMotion(age / 420)
  const x = 166, w = 930, end = 1860
  const step = Math.min(124, 510 / Math.max(1, active.length - 1))
  const first = end - step * (active.length - 1)
  const prior = activeSpokenScores(scene, wordTime - .1)
  const instrument = variation % 3
  const highlight = palette.dark ? palette.signal : '#aa7851'
  ctx.save(); ctx.globalAlpha *= progress
  scoreBed(ctx, first - 205, palette)
  for (const [i, item] of active.entries()) {
    const row = first + step * i
    const old = prior.find(score => score.label === item.label)
    const travel = reduced ? 1 : sharedElementMotion((age - i * 55) / 690)
    const pulse = reduced ? 0 : .5 + .5 * Math.sin(age / 165 - i * .8)
    const size = Math.min(49, step * .48)
    const railY = row + 27, marker = x + w * ((old?.value ?? 0) * (1 - travel) + item.value * travel) / 10
    fernType(ctx, item.label.toUpperCase(), x, row, Math.min(30, size * .78), palette.ink, w * .65)
    ctx.save(); ctx.textAlign = 'right'; ctx.font = `600 ${size}px ${fernFont}`; ctx.fillStyle = palette.ink
    const format = (value: number) => `${value} / 10`
    drawVideoTextMorph(ctx, old ? format(old.value) : '', format(item.value), x + w, row, progress, 260)
    ctx.restore()
    ctx.fillStyle = palette.line
    if (instrument === 1) {
      for (let tick = 0; tick <= 40; tick++) {
        const height = tick % 4 === 0 ? 16 : 7
        ctx.fillRect(x + w * tick / 40, railY - height / 2, 2, height)
      }
    } else ctx.fillRect(x, railY - 1, w, 2)
    if (instrument !== 1) {
      const fill = ctx.createLinearGradient(x, 0, Math.max(x + 1, marker), 0)
      fill.addColorStop(0, highlight + '24'); fill.addColorStop(1, highlight + 'b0')
      ctx.fillStyle = fill; ctx.fillRect(x, railY - 1.5, marker - x, 3)
    }
    ctx.save()
    ctx.shadowColor = highlight; ctx.shadowBlur = 10 + pulse * 11
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = highlight; ctx.lineWidth = 2
    ctx.beginPath()
    if (instrument === 1) ctx.roundRect(marker - 2.5, railY - 12, 5, 24, 2.5)
    else ctx.arc(marker, railY, instrument === 2 ? 5 + pulse * 2 : 5, 0, Math.PI * 2)
    ctx.stroke(); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

export function documentaryObservation(ctx: CanvasRenderingContext2D, label: string, value: string, progress: number, palette: FernPalette) {
  ctx.save(); ctx.globalAlpha *= progress
  scoreBed(ctx, 1620, palette)
  fernType(ctx, label.toUpperCase(), 166, 1815, 31, palette.ink, 550)
  ctx.textAlign = 'right'
  fernType(ctx, value, 1096, 1815, 23, palette.quiet, 310)
  ctx.restore()
}

// Each letter folds around its own seam while the board and its light move together.
export function splitFlapChapter(ctx: CanvasRenderingContext2D, title: string, drift: number, enter: (delay: number, ms: number) => number) {
  const letters = Array.from(title.trim().toUpperCase())
  if (!letters.length) return
  const text = letters.length > 24 ? [...letters.slice(0, 23), '…'] : letters
  const step = Math.min(108, 936 / text.length), cell = step - 5, height = 126
  const left = (W - step * text.length) / 2 + drift * 26
  const top = 719
  ctx.save()
  ctx.transform(1, -.033 + drift * .018, 0, 1, 0, 0)
  ctx.fillStyle = '#1b2326'
  ctx.fillRect(left - 28, top - 24, step * text.length + 51, height + 48)
  ctx.fillStyle = '#758181'
  ctx.fillRect(left - 28, top - 24, step * text.length + 51, 3)
  for (const [i, letter] of text.entries()) {
    const x = left + i * step, y = top + height / 2
    const flip = enter(110 + i * Math.min(38, 320 / text.length), 520)
    ctx.fillStyle = '#0d1113'
    ctx.fillRect(x, top, cell, height)
    if (letter === ' ') continue
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, .09 + .91 * Math.abs(Math.cos(Math.PI * flip)))
    ctx.fillStyle = '#323c3e'
    ctx.fillRect(0, -height / 2, cell, height / 2 - 1)
    ctx.fillStyle = '#20292c'
    ctx.fillRect(0, 1, cell, height / 2 - 1)
    if (flip >= .5) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${Math.min(78, step * 1.06)}px ${fernFont}`
      ctx.shadowColor = '#f7dbac8a'; ctx.shadowBlur = 15
      ctx.fillStyle = '#fff0d3'
      ctx.fillText(letter, cell / 2, 4, cell - 8)
      ctx.shadowBlur = 0
    }
    ctx.restore()
    ctx.fillStyle = '#090d0f'
    ctx.fillRect(x, y - 1, cell, 2)
  }
  const reflection = ctx.createLinearGradient(0, top + height + 25, 0, top + height + 95)
  reflection.addColorStop(0, '#d9af6e30'); reflection.addColorStop(1, '#d9af6e00')
  ctx.fillStyle = reflection
  ctx.fillRect(left, top + height + 25, step * text.length - 5, 70)
  ctx.restore()
}
