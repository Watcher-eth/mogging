import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import type { CaptureFrameImagePosition } from './capture-frame'

export const captureViewport = { width: 360, height: 640 }
export const desktopCaptureViewport = { width: 480, height: 600 }
export const defaultFaceGuide = { cx: 180, cy: 288, rx: 132, ry: 165 }

export function getFaceGuide(landmarks: FaceLandmarksPayload | null | undefined, position: CaptureFrameImagePosition, viewport = captureViewport, fit: 'cover' | 'contain' = 'cover') {
  const points = [
    ...(landmarks?.contours?.faceOutline ?? []),
    landmarks?.anchors.forehead,
    landmarks?.anchors.chin,
  ].filter((point): point is NormalizedPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)))
  if (!landmarks?.image.width || !landmarks.image.height || points.length < 3) return viewport === captureViewport ? defaultFaceGuide : { cx: viewport.width / 2, cy: viewport.height * .45, rx: viewport.width * .30, ry: viewport.height * .32 }

  const transform = getImageTransform(landmarks.image, viewport, fit)
  transform.offsetX = (viewport.width - transform.renderedWidth) * position.x / 100
  transform.offsetY = (viewport.height - transform.renderedHeight) * position.y / 100
  const originX = viewport.width * position.x / 100
  const originY = viewport.height * position.y / 100
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
