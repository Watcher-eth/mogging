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

export function drawRollingNumber(ctx: CanvasRenderingContext2D, value: number, decimals: number, x: number, baseline: number, size: number, progress: number) {
  const text = value.toFixed(decimals), width = rollingNumberWidth(ctx, text)
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
