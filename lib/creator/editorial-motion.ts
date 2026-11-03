type Point = { x: number; y: number }
type Frame = Point & { w: number; h: number }

const clamp = (value: number) => Math.max(0, Math.min(1, value))
export const editorialEase = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Approach a point on the image, settle, then acknowledge the edit. */
export function drawEditorialPointer(ctx: CanvasRenderingContext2D, from: Point, target: Point, progress: number) {
  if (progress < 0 || progress >= 1) return
  const t = editorialEase(progress / .64)
  const x = lerp(from.x, target.x, t)
  const y = lerp(from.y, target.y, t) - Math.sin(t * Math.PI) * Math.min(75, Math.abs(target.x - from.x) * .24)
  const click = clamp((progress - .64) / .36)
  ctx.save()
  ctx.globalAlpha *= editorialEase(progress / .14) * (1 - editorialEase((progress - .82) / .18))
  if (click > 0) {
    ctx.beginPath()
    ctx.arc(x, y, 8 + click * 22, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(240,255,222,${1 - click})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.translate(x, y)
  ctx.scale(1 - .12 * Math.sin(click * Math.PI), 1 - .12 * Math.sin(click * Math.PI))
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(4, 32)
  ctx.lineTo(12, 23)
  ctx.lineTo(19, 34)
  ctx.lineTo(25, 30)
  ctx.lineTo(17, 19)
  ctx.lineTo(29, 18)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#192018'
  ctx.fillStyle = '#f9fff2'
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Keep the original framing fixed while the edited layer moves across it. */
export function drawEditorialSplit(ctx: CanvasRenderingContext2D, frame: Frame, progress: number, drawEdit: () => void) {
  const amount = clamp(progress)
  if (amount === 0) return
  if (amount === 1) { drawEdit(); return }
  const edge = frame.x + frame.w * amount
  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.x, frame.y, edge - frame.x, frame.h)
  ctx.clip()
  drawEdit()
  ctx.restore()
  const fade = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h)
  fade.addColorStop(0, '#f9fff200')
  fade.addColorStop(.35, '#f9fff28c')
  fade.addColorStop(.65, '#f9fff28c')
  fade.addColorStop(1, '#f9fff200')
  ctx.save()
  ctx.strokeStyle = fade
  ctx.setLineDash([3, 7])
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(edge, frame.y)
  ctx.lineTo(edge, frame.y + frame.h)
  ctx.stroke()
  ctx.restore()
}

/** Bring a reference crop into the frame with a short rise and scale settle. */
export function drawEditorialInset(ctx: CanvasRenderingContext2D, frame: Frame, progress: number, drawContent: (frame: Frame) => void) {
  const t = editorialEase(progress)
  if (t === 0) return
  const edge = frame.x + frame.w * t
  const slant = Math.min(frame.h * .36, frame.w * (1 - t))
  ctx.save()
  ctx.globalAlpha *= Math.min(1, t * 3)
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, 17)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(frame.x, frame.y)
  ctx.lineTo(edge + slant, frame.y)
  ctx.lineTo(edge, frame.y + frame.h)
  ctx.lineTo(frame.x, frame.y + frame.h)
  ctx.closePath()
  ctx.clip()
  drawContent(frame)
  ctx.restore()
}

const revealLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()

/** Reveal a registered edit across the same portrait with a soft moving edge. */
export function drawEditorialFeatheredReveal(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, drawEdit: (target: CanvasRenderingContext2D) => void) {
  const amount = clamp(progress)
  if (amount <= 0) return
  if (amount >= 1) { drawEdit(ctx); return }
  let layer = revealLayers.get(ctx)
  if (!layer) {
    layer = document.createElement('canvas')
    revealLayers.set(ctx, layer)
  }
  if (layer.width !== width || layer.height !== height) {
    layer.width = width
    layer.height = height
  }
  const surface = layer.getContext('2d')!
  surface.clearRect(0, 0, width, height)
  drawEdit(surface)
  const feather = Math.min(width * .04, width * Math.min(amount, 1 - amount))
  const edge = width * amount
  const gradient = surface.createLinearGradient(edge - feather, 0, edge + feather, 0)
  gradient.addColorStop(0, '#fff')
  gradient.addColorStop(1, '#fff0')
  surface.save()
  surface.globalCompositeOperation = 'destination-in'
  surface.fillStyle = gradient
  surface.fillRect(0, 0, width, height)
  surface.restore()
  ctx.drawImage(layer, 0, 0)
}

/** Draw a curved leader, then finish its arrowhead at the point of interest. */
export function drawEditorialLeader(ctx: CanvasRenderingContext2D, from: Point, bend: Point, to: Point, progress: number, unit: number) {
  const amount = clamp(progress)
  if (!amount) return
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  for (let i = 1; i <= 24; i++) {
    const t = i / 24 * amount, u = 1 - t
    ctx.lineTo(u * u * from.x + 2 * u * t * bend.x + t * t * to.x, u * u * from.y + 2 * u * t * bend.y + t * t * to.y)
  }
  if (amount > .85) {
    const angle = Math.atan2(to.y - bend.y, to.x - bend.x)
    const length = 13 * unit * editorialEase((amount - .85) / .15)
    for (const side of [-1, 1]) {
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - length * Math.cos(angle + side * .54), to.y - length * Math.sin(angle + side * .54))
    }
  }
  ctx.stroke()
}

/** An unnumbered rail tracks a visual reveal without implying a measurement. */
export function drawEditorialRevealRail(ctx: CanvasRenderingContext2D, center: Point, progress: number) {
  const width = 240
  const left = center.x - width / 2
  const cursor = left + clamp(progress) * width
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(41,50,59,.4)'
  ctx.beginPath()
  for (let index = 0; index <= 16; index++) {
    const x = left + width * index / 16
    const height = index % 4 === 0 ? 13 : 6
    ctx.moveTo(x, center.y - height / 2)
    ctx.lineTo(x, center.y + height / 2)
  }
  ctx.stroke()
  ctx.strokeStyle = '#303942'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(cursor, center.y - 13)
  ctx.lineTo(cursor, center.y + 13)
  ctx.stroke()
  ctx.restore()
}

/** Short strokes follow the local direction of a detected contour. */
export function editorialHatchStrokes(points: readonly Point[], unit: number): Point[][] {
  const strokes: Point[][] = []
  let distance = 0
  let nextMark = 16 * unit
  for (let index = 1; index < points.length && strokes.length < 18; index++) {
    const a = points[index - 1], b = points[index]
    const dx = b.x - a.x, dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (!length) continue
    while (nextMark <= distance + length && strokes.length < 18) {
      const t = (nextMark - distance) / length
      const x = a.x + dx * t, y = a.y + dy * t
      const offset = (7 + strokes.length % 3 * 2) * unit
      strokes.push([{ x, y }, {
        x: x + (dx * .55 - dy) / length * offset,
        y: y + (dy * .55 + dx) / length * offset,
      }])
      nextMark += 17 * unit
    }
    distance += length
  }
  return strokes
}

/** A registered feature locator. Tick marks expand from the point of interest. */
export function drawEditorialLocator(ctx: CanvasRenderingContext2D, target: Point, axis: Point, progress: number) {
  const t = editorialEase(progress)
  if (!t) return
  const length = Math.hypot(axis.x, axis.y)
  if (length < 1) return
  const dx = axis.x / length, dy = axis.y / length
  ctx.save()
  ctx.globalAlpha *= t
  ctx.strokeStyle = 'rgba(250,252,255,.82)'
  ctx.shadowColor = 'rgba(23,31,40,.23)'
  ctx.shadowBlur = 5
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const side of [-1, 1]) for (let i = 1; i <= 3; i++) {
    const distance = (8 + i * 8) * t * side
    const x = target.x + dx * distance, y = target.y + dy * distance
    const tick = (i === 3 ? 9 : 4) * t
    ctx.moveTo(x - dy * tick, y + dx * tick)
    ctx.lineTo(x + dy * tick, y - dx * tick)
  }
  ctx.stroke()
  ctx.beginPath(); ctx.arc(target.x, target.y, 2.2 * t, 0, Math.PI * 2)
  ctx.fillStyle = '#f8fbff'; ctx.fill()
  ctx.restore()
}
