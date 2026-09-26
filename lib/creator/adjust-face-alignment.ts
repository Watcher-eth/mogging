import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'

type AnchorKey = keyof FaceLandmarksPayload['anchors']

// Move the selected anchor and smoothly carry nearby contour points with it.
export function adjustFaceAlignment(face: FaceLandmarksPayload, key: AnchorKey, target: NormalizedPoint): FaceLandmarksPayload {
  const origin = face.anchors[key]
  if (!origin || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return face
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const point = { x: clamp(target.x), y: clamp(target.y) }
  const aspect = face.image.height / face.image.width
  const warp = (p: NormalizedPoint) => {
    const distance = Math.hypot(p.x - origin.x, (p.y - origin.y) * aspect)
    const t = Math.max(0, 1 - distance / 0.12)
    const weight = t * t * (3 - 2 * t)
    return { x: clamp(p.x + (point.x - origin.x) * weight), y: clamp(p.y + (point.y - origin.y) * weight) }
  }
  return {
    ...face,
    anchors: { ...face.anchors, [key]: point },
    contours: Object.fromEntries(Object.entries(face.contours ?? {}).map(([name, points]) => [name, points?.map(warp)])),
  }
}
