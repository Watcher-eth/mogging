import type { PixelPoint } from './resolve'

const cycleMs = 3800
const trailMs = 115
const fadeMs = 550
const turn = Math.PI * 2

const topology = new WeakMap<readonly PixelPoint[], {
  scale: number
  links: Array<{ from: number; to: number; phase: number }>
}>()

function getTopology(points: readonly PixelPoint[]) {
  const cached = topology.get(points)
  if (cached) return cached
  const xs = points.map(point => point.x)
  const scale = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const links = points.flatMap((point, from) => points
    .map((other, to) => ({ to, distance: Math.hypot(other.x - point.x, other.y - point.y) }))
    .filter(({ to, distance }) => to !== from && distance < scale * .29)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .filter(({ to }) => to > from)
    .map(({ to }) => ({ from, to, phase: (from * 761 + to * 313) % cycleMs })))
  const result = { scale, links }
  topology.set(points, result)
  return result
}

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export function skinNetworkFrame(points: readonly PixelPoint[], elapsed: number, still = false) {
  const { scale, links } = getTopology(points)
  const position = (point: PixelPoint, index: number, time: number) => {
    const phase = index * 2.39996
    const t = time / cycleMs * turn
    const drift = still ? 0 : scale * .022
    return {
      x: point.x + Math.sin(t + phase) * drift,
      y: point.y + Math.cos(t * 2 + phase) * drift,

    }
  }
  const anchors = points.map((point, index) => ({
    ...position(point, index, elapsed),
    tracker: index % 14 === 0,
    trail: !still && index % 3 === 0 ? position(point, index, elapsed - trailMs) : null,
  }))
  return {
    anchors,
    radius: scale * .0048,
    opacity: still ? 1 : ease(elapsed / fadeMs),
    links: links.map(({ from, to, phase }) => {
      const age = (elapsed + phase) % cycleMs
      const amount = still ? .55 : ease(age / fadeMs)
      const opacity = still ? .18 : .39 * amount * ease((cycleMs * .63 - age) / fadeMs)
      const start = anchors[from], end = anchors[to]
      const along = (fraction: number) => ({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
      })
      const sweep = ease((age - fadeMs) / 950)
      const glint = !still && (from + to) % 4 === 0 && sweep > 0 && sweep < 1
        ? { start: along(Math.max(0, sweep - .19)), end: along(sweep), opacity: Math.sin(sweep * Math.PI) * .55 }
        : null
      return { start, end: along(amount), opacity, glint }
    }),
  }
}

export function drawSkinNetwork(ctx: CanvasRenderingContext2D, points: readonly PixelPoint[], elapsed: number, still = false) {
  const frame = skinNetworkFrame(points, elapsed, still)
  ctx.save()
  const alpha = ctx.globalAlpha * frame.opacity
  ctx.shadowBlur = 0
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  const stroke = (start: PixelPoint, end: PixelPoint, opacity: number, weight: number) => {
    ctx.globalAlpha = alpha * opacity
    ctx.lineWidth = frame.radius * weight
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }
  for (const link of frame.links) {
    if (link.opacity <= 0) continue
    stroke(link.start, link.end, link.opacity, .52)
    if (link.glint) {
      stroke(link.glint.start, link.glint.end, link.glint.opacity * .16, 2.4)
      stroke(link.glint.start, link.glint.end, link.glint.opacity, .8)
    }
  }
  for (const anchor of frame.anchors) {
    if (anchor.trail) {
      stroke(anchor.trail, anchor, .08, 2.2)
      stroke(anchor.trail, anchor, .18, .9)
    }
    ctx.globalAlpha = alpha * .76
    ctx.beginPath()
    ctx.arc(anchor.x, anchor.y, frame.radius, 0, turn)
    ctx.fill()
    if (anchor.tracker) {
      ctx.globalAlpha = alpha * .37
      ctx.lineWidth = frame.radius * .55
      const size = frame.radius * 5
      ctx.strokeRect(anchor.x - size / 2, anchor.y - size / 2, size, size)
    }
  }
  ctx.restore()
}
