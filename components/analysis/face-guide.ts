import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import type { CaptureFrameImagePosition } from './capture-frame'

export const captureViewport = { width: 360, height: 640 }
export const defaultFaceGuide = { cx: 180, cy: 288, rx: 132, ry: 165 }

export function getFaceGuide(landmarks: FaceLandmarksPayload | null | undefined, position: CaptureFrameImagePosition) {
  const points = [
    ...(landmarks?.contours?.faceOutline ?? []),
    landmarks?.anchors.forehead,
    landmarks?.anchors.chin,
  ].filter((point): point is NormalizedPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)))
  if (!landmarks?.image.width || !landmarks.image.height || points.length < 3) return defaultFaceGuide

  const transform = getImageTransform(landmarks.image, captureViewport, 'cover')
  transform.offsetX = (captureViewport.width - transform.renderedWidth) * position.x / 100
  transform.offsetY = (captureViewport.height - transform.renderedHeight) * position.y / 100
  const originX = captureViewport.width * position.x / 100
  const originY = captureViewport.height * position.y / 100
  const projected = points.map((point) => {
    const pixel = projectImagePoint(point, landmarks.image, transform)
    return { x: (pixel.x - originX) * position.scale + originX, y: (pixel.y - originY) * position.scale + originY }
  })
  const xs = projected.map((point) => point.x)
  const ys = projected.map((point) => point.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const rx = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2)
  const ry = Math.max(1, (Math.max(...ys) - Math.min(...ys)) / 2)
  // Fit every contour point inside the oval, including wider forehead/jaw corners.
  const expansion = Math.max(1, ...projected.map((point) => Math.hypot((point.x - cx) / rx, (point.y - cy) / ry)))
  return { cx, cy, rx: rx * expansion + 8, ry: ry * expansion + 8 }
}
