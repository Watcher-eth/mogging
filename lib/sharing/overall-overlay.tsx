import { isFaceLandmarksUsable, type FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset, type ResolvedPrimitive } from '@/lib/creator/mobile-overlay-engine/resolve'

export function resolveShareOverallOverlay(landmarks: FaceLandmarksPayload | null, width: number, height: number) {
  if (!isFaceLandmarksUsable(landmarks, 0.48)) return []
  // Older simulator Vision results reported high confidence despite collapsed geometry.
  const outline = landmarks?.contours?.faceOutline
  const coverage = landmarks?.quality?.faceCoverage
  if (outline?.length && coverage) {
    const width = Math.max(...outline.map(p => p.x)) - Math.min(...outline.map(p => p.x))
    const height = Math.max(...outline.map(p => p.y)) - Math.min(...outline.map(p => p.y))
    if (width * height < coverage * 0.25) return []
  }
  return resolveOverlayPreset({ preset: reportOverlayPresets.overall, landmarks, viewport: { width, height }, imageSize: landmarks!.image, fit: 'cover' })
    .primitives.filter(primitive => primitive.kind !== 'label')
}

export function ShareOverallOverlay({ landmarks, width, height }: { landmarks: FaceLandmarksPayload | null; width: number; height: number }) {
  const primitives = resolveShareOverallOverlay(landmarks, width, height)
  const scale = width / 390
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ left: 0, top: 0, position: 'absolute' }}>
    {primitives.map(primitive => {
      if (primitive.kind === 'point') return <g key={primitive.id} opacity={0.65}>
        <circle cx={primitive.point.x} cy={primitive.point.y} r={(primitive.radius ?? 3.2) * scale} fill="none" stroke="white" strokeWidth={0.6 * scale} strokeDasharray={`${2.1 * scale} ${3.8 * scale}`} />
        <circle cx={primitive.point.x} cy={primitive.point.y} r={2.2 * scale} fill="white" />
      </g>
      if (primitive.kind === 'box') return null
      const points = primitive.kind === 'line' ? [primitive.fromPoint, primitive.toPoint] : primitive.pixelPoints
      const closed = primitive.kind === 'region' || (primitive.kind === 'polyline' && primitive.closed)
      const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') + (closed ? ' Z' : '')
      return <path key={primitive.id} d={d}
        fill={primitive.kind === 'region' ? `rgba(255,255,255,${(primitive.fillOpacity ?? 0.05) * 0.6})` : 'none'}
        stroke={`rgba(255,255,255,${(primitive.opacity ?? 0.88) * 0.65})`}
        strokeWidth={(primitive.strokeWidth ?? 0.36) * scale} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={primitive.dashed ? `${1.7 * scale} ${3.8 * scale}` : undefined} />
    })}
  </svg>
}

// Canvas counterpart of the same share geometry, with a draw-on entrance for video.
export function drawShareOverallOverlay(ctx: CanvasRenderingContext2D, primitives: ResolvedPrimitive[], width: number, time: number) {
  const scale = width / 390
  for (const primitive of primitives) {
    if (primitive.kind === 'label' || primitive.kind === 'box') continue
    const progress = Math.max(0, Math.min(1, (time - (primitive.animation?.delay ?? 0)) / (primitive.animation?.duration ?? 1000)))
    if (!progress) continue
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (primitive.kind === 'point') {
      ctx.globalAlpha = .65 * progress
      ctx.beginPath(); ctx.arc(primitive.point.x, primitive.point.y, (primitive.radius ?? 3.2) * scale, 0, Math.PI * 2)
      ctx.strokeStyle = '#fff'; ctx.lineWidth = .6 * scale; ctx.setLineDash([2.1 * scale, 3.8 * scale]); ctx.stroke()
      ctx.beginPath(); ctx.arc(primitive.point.x, primitive.point.y, 2.2 * scale, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
    } else {
      const points = primitive.kind === 'line' ? [primitive.fromPoint, primitive.toPoint] : primitive.pixelPoints
      if (!points.length) { ctx.restore(); continue }
      const closed = primitive.kind === 'region' || (primitive.kind === 'polyline' && primitive.closed)
      const path = closed ? [...points, points[0]] : points
      const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y))
      let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length && remaining > 0; i++) {
        const fraction = Math.min(1, remaining / (lengths[i - 1] || 1))
        ctx.lineTo(path[i - 1].x + (path[i].x - path[i - 1].x) * fraction, path[i - 1].y + (path[i].y - path[i - 1].y) * fraction)
        remaining -= lengths[i - 1]
      }
      if (primitive.kind === 'region' && progress === 1) { ctx.fillStyle = `rgba(255,255,255,${(primitive.fillOpacity ?? .05) * .6})`; ctx.fill() }
      ctx.strokeStyle = `rgba(255,255,255,${(primitive.opacity ?? .88) * .65})`; ctx.lineWidth = (primitive.strokeWidth ?? .36) * scale
      if (primitive.dashed) ctx.setLineDash([1.7 * scale, 3.8 * scale])
      ctx.stroke()
    }
    ctx.restore()
  }
}
