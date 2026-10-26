export type NumberPort = { id: string; value: number; current: number; decimals: number; progress: number; duration: number; x: number; y: number; width: number; height: number; fontSize: number; color: string; opacity: number }
export type NumberSink = (port: NumberPort) => boolean
export function rollingNumberWidth(ctx: CanvasRenderingContext2D, text: string) {
  const digit = Math.max(...Array.from({ length: 10 }, (_, value) => ctx.measureText(String(value)).width))
  return Array.from(text).reduce((sum, character) => sum + (/\d/.test(character) ? digit : ctx.measureText(character).width), 0)
}

export function digitColumns(value: number, decimals: number, progress: number) {
  return value.toFixed(decimals).split('').map((character, index) => {
    if (!/\d/.test(character)) return { character, digit: null, fraction: 0 }
    const travel = (Number(character) + (index ? 10 : 0)) * Math.max(0, Math.min(1, progress))
    return { character, digit: Math.floor(travel) % 10, fraction: travel - Math.floor(travel) }
  })
}

export function drawRollingNumber(ctx: CanvasRenderingContext2D, id: string, value: number, decimals: number, x: number, baseline: number, size: number, progress: number, sink?: NumberSink) {
  const text = value.toFixed(decimals), width = rollingNumberWidth(ctx, text)
  const matrix = ctx.getTransform?.()
  if (sink && matrix && Number.isFinite(matrix.a) && matrix.a > 0 && matrix.d > 0 && Math.abs(matrix.b) < .0001 && Math.abs(matrix.c) < .0001) {
    const point = { x: matrix.a * x + matrix.c * baseline + matrix.e, y: matrix.b * x + matrix.d * baseline + matrix.f }
    if (sink({ id, value, current: value * progress, decimals, progress, duration: 1050, x: point.x, y: point.y - size * matrix.d * .92, width: width * matrix.a, height: size * matrix.d * 1.25, fontSize: size * matrix.a, color: String(ctx.fillStyle), opacity: ctx.globalAlpha })) return width
  }
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  let left = x
  for (const column of digitColumns(value, decimals, progress)) {
    const cell = /\d/.test(column.character) ? rollingNumberWidth(ctx, '0') : ctx.measureText(column.character).width
    if (column.digit === null) ctx.fillText(column.character, left, baseline)
    else {
      ctx.save(); ctx.beginPath(); ctx.rect(left - 1, baseline - size, cell + 2, size * 1.28); ctx.clip()
      const offset = column.fraction * size * 1.18
      ctx.fillText(String(column.digit), left, baseline - offset)
      if (column.fraction > .001) ctx.fillText(String((column.digit + 1) % 10), left, baseline - offset + size * 1.18)
      ctx.restore()
    }
    left += cell
  }
  ctx.restore()
  return width
}
