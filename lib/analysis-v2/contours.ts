export type Point2D = { x: number; y: number }

// Project each feature into its own corner axis so opening/thickness do not change with roll.
export function contourGap(points: Point2D[], upper: number[], lower: number[], corners: [number, number]) {
  const a = points[corners[0]], b = points[corners[1]]
  const width = Math.hypot(b.x - a.x, b.y - a.y)
  if (width < 1e-6) return null
  const xAxis = { x: (b.x - a.x) / width, y: (b.y - a.y) / width }
  const project = (indices: number[]) => indices.map(index => {
    const dx = points[index].x - a.x, dy = points[index].y - a.y
    return { x: dx * xAxis.x + dy * xAxis.y, y: -dx * xAxis.y + dy * xAxis.x }
  }).sort((p, q) => p.x - q.x)
  const top = project(upper), bottom = project(lower)
  const start = Math.max(top[0].x, bottom[0].x, width * .15)
  const end = Math.min(top.at(-1)!.x, bottom.at(-1)!.x, width * .85)
  if (end <= start) return null
  const atX = (curve: Point2D[], x: number) => {
    for (let index = 1; index < curve.length; index++) {
      const p = curve[index - 1], q = curve[index]
      if (x >= p.x && x <= q.x && q.x - p.x > 1e-6) return p.y + (q.y - p.y) * (x - p.x) / (q.x - p.x)
    }
    return null
  }
  const gaps: number[] = []
  for (let step = 0; step <= 20; step++) {
    const x = start + (end - start) * step / 20
    const u = atX(top, x), l = atX(bottom, x)
    if (u !== null && l !== null) gaps.push(Math.abs(l - u))
  }
  if (!gaps.length) return null
  return { maximum: Math.max(...gaps), mean: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length, width }
}

export const eyeContours = [
  { corners: [33, 133] as [number, number], upper: [33, 246, 161, 160, 159, 158, 157, 173, 133], lower: [33, 7, 163, 144, 145, 153, 154, 155, 133] },
  { corners: [362, 263] as [number, number], upper: [362, 398, 384, 385, 386, 387, 388, 466, 263], lower: [362, 382, 381, 380, 374, 373, 390, 249, 263] },
]
export const lipContours = {
  upperOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  upperInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lowerInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  lowerOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
}
