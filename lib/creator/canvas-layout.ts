export type CanvasRect = { x: number; y: number; width: number; height: number }
export type CanvasPlacement = { a: number; b: number; c: number; d: number; e: number; f: number }
export type CanvasEffect = {
  x?: number; y?: number; scale?: number; rotation?: number; opacity?: number; blur?: number; brightness?: number
  anchor?: { x: number; y: number }; frame?: CanvasRect; highlight?: { color: string; amount: number; endColor?: string }
  reveal?: number
  placement?: CanvasPlacement; clip?: boolean
  shadow?: { color: string; blur: number; y: number }
  beam?: { phase: number; amount: number }
  lift?: { amount: number; viewport: CanvasRect }
}
export type CanvasNode = {
  id: string; label?: string; frame: CanvasRect; size?: { width: number; height: number }
  opacity?: number; clip?: boolean; draw?: (ctx: CanvasRenderingContext2D, paint: CanvasPainter) => void; children?: CanvasNode[]
}
export type CanvasElement = { id: string; label: string; frame: CanvasRect; placement: CanvasPlacement }
export type CanvasPainter = (ctx: CanvasRenderingContext2D, node: CanvasNode) => void

// Report score summaries and their descendants never receive decorative boxes.
export const isReportScoreElement = (id: string) => /^(?:scores|potential|category-score)(?:\/|$)/.test(id)

export function createCanvasPainter(effectFor: (node: CanvasNode) => CanvasEffect = () => ({}), inspect?: (element: CanvasElement) => void): CanvasPainter {
  const paint: CanvasPainter = (ctx, node) => {
    const effect = effectFor(node), frame = effect.frame ?? node.frame, size = node.size ?? node.frame
    if (frame.width <= 0 || frame.height <= 0 || size.width <= 0 || size.height <= 0) return
    ctx.save()
    if (effect.placement) {
      const matrix = effect.placement
      ctx.setTransform(matrix.a / size.width, matrix.b / size.width, matrix.c / size.height, matrix.d / size.height, matrix.e, matrix.f)
    } else {
      ctx.translate(frame.x, frame.y); ctx.scale(frame.width / size.width, frame.height / size.height)
      const anchor = effect.anchor ?? { x: .5, y: .5 }
      ctx.translate((effect.x ?? 0) * size.width / 100, (effect.y ?? 0) * size.height / 100)
      ctx.translate(anchor.x * size.width, anchor.y * size.height)
      ctx.rotate((effect.rotation ?? 0) * Math.PI / 180); ctx.scale(effect.scale ?? 1, effect.scale ?? 1)
      ctx.translate(-anchor.x * size.width, -anchor.y * size.height)
    }
    ctx.globalAlpha *= (node.opacity ?? 1) * (effect.opacity ?? 1)
    if (effect.lift) {
      const matrix = ctx.getTransform(), viewport = effect.lift.viewport, amount = effect.lift.amount
      const width = Math.hypot(matrix.a, matrix.b) * size.width, height = Math.hypot(matrix.c, matrix.d) * size.height
      const scale = Math.max(1, Math.min(viewport.width * .84 / width, viewport.height * .58 / height, 1.85))
      const centerX = matrix.e + matrix.a * size.width / 2 + matrix.c * size.height / 2
      const centerY = matrix.f + matrix.b * size.width / 2 + matrix.d * size.height / 2
      const targetX = viewport.x + viewport.width / 2, targetY = viewport.y + viewport.height / 2
      const zoom = 1 + (scale - 1) * amount
      ctx.setTransform(matrix.a * zoom, matrix.b * zoom, matrix.c * zoom, matrix.d * zoom,
        matrix.e + (targetX - centerX) * amount - (matrix.a * size.width + matrix.c * size.height) * (zoom - 1) / 2,
        matrix.f + (targetY - centerY) * amount - (matrix.b * size.width + matrix.d * size.height) * (zoom - 1) / 2)
    }
    if (effect.blur || effect.brightness && effect.brightness !== 1) ctx.filter = `${ctx.filter && ctx.filter !== 'none' ? ctx.filter : ''} blur(${effect.blur ?? 0}px) brightness(${effect.brightness ?? 1})`.trim()
    if (inspect) {
      const matrix = ctx.getTransform()
      const corners = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }))
      const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y))
      inspect({ id: node.id, label: node.label ?? node.id, placement: { a: matrix.a * size.width, b: matrix.b * size.width, c: matrix.c * size.height, d: matrix.d * size.height, e: matrix.e, f: matrix.f }, frame: { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left, height: Math.max(...corners.map(point => point.y)) - top } })
    }
    if (effect.clip ?? node.clip) { ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip(); ctx.beginPath() }
    if (effect.reveal !== undefined) { ctx.beginPath(); ctx.rect(0, 0, size.width * Math.max(0, Math.min(1, effect.reveal)), size.height); ctx.clip(); ctx.beginPath() }
    if (effect.shadow) {
      ctx.save(); ctx.shadowColor = effect.shadow.color; ctx.shadowBlur = effect.shadow.blur; ctx.shadowOffsetY = effect.shadow.y
      node.draw?.(ctx, paint); ctx.restore()
    } else node.draw?.(ctx, paint)
    for (const child of node.children ?? []) paint(ctx, child)
    if (!isReportScoreElement(node.id) && effect.highlight && effect.highlight.amount > 0) {
      ctx.save(); ctx.globalAlpha *= Math.min(1, effect.highlight.amount)
      const gradient = ctx.createLinearGradient(0, 0, size.width, size.height)
      gradient.addColorStop(0, effect.highlight.color); gradient.addColorStop(1, effect.highlight.endColor ?? '#64cda2')
      ctx.strokeStyle = gradient; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(1, 1, Math.max(0, size.width - 2), Math.max(0, size.height - 2), Math.min(18, size.height / 4)); ctx.stroke(); ctx.restore()
    }
    if (!isReportScoreElement(node.id) && effect.beam && effect.beam.amount > 0) {
      const matrix = ctx.getTransform(), scale = Math.max(.001, Math.hypot(matrix.a, matrix.b))
      const inset = 2 / scale, radius = Math.min(18, size.height / 4), length = 2 * (size.width + size.height - 4 * radius) + 2 * Math.PI * radius
      ctx.save(); ctx.globalAlpha *= effect.beam.amount; ctx.beginPath()
      ctx.roundRect(inset, inset, size.width - inset * 2, size.height - inset * 2, radius)
      ctx.strokeStyle = '#74cfff'; ctx.lineWidth = 2 / scale; ctx.globalAlpha *= .35; ctx.stroke(); ctx.globalAlpha /= .35
      ctx.setLineDash([length * .18, length * .82]); ctx.lineDashOffset = -effect.beam.phase * length
      ctx.shadowColor = '#8edcff'; ctx.shadowBlur = 9; ctx.strokeStyle = '#69caff'; ctx.lineWidth = 3 / scale; ctx.stroke(); ctx.restore()
    }
    ctx.restore()
  }
  return paint
}

export const paintCanvasNode = createCanvasPainter()
