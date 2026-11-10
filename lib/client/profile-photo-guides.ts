import type { NormalizedPoint as Point } from '@/lib/analysis/landmarks'
import type { ProfileSilhouette } from './profile-silhouette'

export type ProfilePhotoGuides = Partial<Record<'eye' | 'brow' | 'lips' | 'cheek' | 'lowerCheek' | 'jaw', Point[]>>

export function segmentedProfileNose({ outline, facing }: ProfileSilhouette) {
  const radius = Math.max(2, Math.round(outline.length * .1))
  const sign = facing === 'left' ? -1 : 1
  let best = 0, peak = .012
  for (let i = Math.ceil(outline.length * .3); i < outline.length * .65; i++) {
    const protrusion = sign * (outline[i].x - (outline[i - radius].x + outline[i + radius].x) / 2)
    if (protrusion > peak) {
      best = i
      peak = protrusion
    }
  }
  return best ? { tip: outline[best], contour: outline.slice(best - radius, best + radius + 1) } : null
}

export function traceProfilePhoto(silhouette: ProfileSilhouette, pixels: ImageData): ProfilePhotoGuides {
  const { outline, facing, skin } = silhouette
  const nose = segmentedProfileNose(silhouette)
  if (!nose) return {}
  const { width, height, data } = pixels
  const direction = facing === 'left' ? 1 : -1
  const faceHeight = (outline.at(-1)!.y - outline[0].y) * height
  if (faceHeight < 65) return {}
  const noseY = nose.tip.y * height
  const yAt = (offset: number) => Math.round(noseY + faceHeight * offset)
  const edge = (points: Point[], y: number) => {
    const target = y / height
    let start = 0, end = points.length - 1
    while (end - start > 1) {
      const middle = (start + end) >> 1
      if (points[middle].y < target) start = middle
      else end = middle
    }
    const a = points[start], b = points[end]
    const t = Math.max(0, Math.min(1, (target - a.y) / Math.max(.0001, b.y - a.y)))
    return (a.x + (b.x - a.x) * t) * width
  }
  const front = (y: number) => edge(outline, y)
  const back = skin.slice(outline.length).reverse()
  const sample = (x: number, y: number) => {
    const index = (Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))) * 4
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]]
    return { light: .213 * r + .715 * g + .072 * b, red: r - (g + b) / 2 }
  }
  const normalized = (x: number, y: number): Point => ({ x: x / width, y: y / height })

  // Fit each trace to the local contrast inside the visible side. Distances
  // scale with the photographed face, and follow the silhouette row by row.
  function feature(center: number, reach: number, start: number, end: number, kind: 'eye' | 'brow' | 'lips') {
    const radius = Math.max(2, Math.round(faceHeight * (kind === 'brow' ? .033 : .023)))
    const columns = Array.from({ length: 16 }, (_, index) => faceHeight * (start + (end - start) * index / 15))
    const candidates = columns.flatMap(offset => {
      let best: { x: number; y: number; score: number } | undefined
      for (let y = yAt(center - reach); y <= yAt(center + reach); y++) {
        const x = front(y) + direction * offset
        const point = sample(x, y), above = sample(x, y - radius), below = sample(x, y + radius)
        const contrast = (above.light + below.light) / 2 - point.light
        const color = kind === 'lips' ? Math.max(0, point.red - (above.red + below.red) / 2) : 0
        const score = contrast + color * 1.3 - Math.abs(y - yAt(center)) / faceHeight * 180
        if (!best || score > best.score) best = { x, y, score }
      }
      return best ? [best] : []
    })
    const strongest = candidates.reduce((best, point, index) => point.score > candidates[best].score ? index : best, 0)
    if ((candidates[strongest]?.score ?? 0) < (kind === 'lips' ? 8 : 15)) return
    const minContrast = Math.max(4, candidates[strongest].score * .2)
    let from = strongest, to = strongest
    while (from > 0 && candidates[from - 1].score >= minContrast && Math.abs(candidates[from - 1].y - candidates[from].y) <= radius) from--
    while (to < candidates.length - 1 && candidates[to + 1].score >= minContrast && Math.abs(candidates[to + 1].y - candidates[to].y) <= radius) to++
    if (to - from < 3) return
    const fitted = candidates.slice(from, to + 1)
    const edgeAt = (side: number) => fitted.map(({ x, y }, index) => {
      const taper = Math.sin(Math.PI * index / (fitted.length - 1))
      const depth = kind === 'lips' ? (side > 0 ? 1.05 : .78) : kind === 'eye' && side > 0 ? .9 : .38
      return normalized(x, y + radius * depth * taper * side)
    })
    return [...edgeAt(-1), ...edgeAt(1).slice(1, -1).reverse()]
  }

  const eye = feature(-.225, .045, .028, .16, 'eye')
  const eyeLevel = eye?.length ? (eye.reduce((sum, p) => sum + p.y, 0) / eye.length * height - noseY) / faceHeight : -.225
  const brow = feature(eyeLevel - .075, .04, .008, .15, 'brow')
  const lips = feature(.157, .046, .004, .095, 'lips')
  if (!eye || !back.length) return { eye, brow, lips }

  const surface = (y: number, amount: number) => normalized(front(y) + (edge(back, y) - front(y)) * amount, y)
  const cheek = [surface(yAt(eyeLevel + .055), .69), surface(yAt(eyeLevel + .062), .57),
    surface(yAt(eyeLevel + .076), .43), surface(yAt(eyeLevel + .105), .27), surface(yAt(eyeLevel + .131), .15)]
  const lowerCheek = [surface(yAt(eyeLevel + .166), .69), surface(yAt(eyeLevel + .195), .56),
    surface(yAt(eyeLevel + .218), .43), surface(yAt(eyeLevel + .226), .27), surface(yAt(eyeLevel + .205), .17)]
  const jaw = [surface(yAt(.25), .74), surface(yAt(.32), .61), surface(yAt(.365), .47), surface(yAt(.39), .31),
    ...outline.slice(-3)]
  return { eye, brow, lips, cheek, lowerCheek, jaw }
}
