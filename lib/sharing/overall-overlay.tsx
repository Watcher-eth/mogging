import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset } from '@/lib/creator/mobile-overlay-engine/resolve'

export function resolveShareOverallOverlay(landmarks: FaceLandmarksPayload | null, width: number, height: number) {
  if (!isFaceLandmarksUsable(landmarks, 0.48)) return []
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
