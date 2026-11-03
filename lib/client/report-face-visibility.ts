import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/creator/mobile-overlay-engine/landmarks'
import type { ImageSegmenter } from '@mediapipe/tasks-vision'

let segmenter: Promise<ImageSegmenter> | undefined
const masks = new Map<string, Promise<HTMLCanvasElement | null>>()

async function createSegmenter() {
  const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  })
}

export function getReportFaceVisibility(image: HTMLImageElement) {
  const key = image.currentSrc || image.src
  const cached = masks.get(key)
  if (cached) return cached

  segmenter ??= createSegmenter().catch(error => {
    segmenter = undefined
    throw error
  })
  const pending = segmenter.then(detector => {
    const result = detector.segment(image)
    try {
      const mask = result.categoryMask
      if (!mask) return null
      const pixels = mask.getAsUint8Array()
      const canvas = document.createElement('canvas')
      canvas.width = mask.width
      canvas.height = mask.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const alpha = ctx.createImageData(mask.width, mask.height)
      // The model labels facial skin separately from hair and background.
      // Avoid brightness thresholds so shadows can retain their skin label.
      for (let i = 0; i < pixels.length; i++) {
        alpha.data[i * 4 + 3] = pixels[i] === 3 ? 255 : 0
      }
      ctx.putImageData(alpha, 0, 0)
      return canvas
    } finally {
      result.close()
    }
  }).catch(() => {
    masks.delete(key)
    return null
  })
  if (masks.size >= 12) masks.delete(masks.keys().next().value!)
  masks.set(key, pending)
  return pending
}

export function extendReportForehead(face: FaceLandmarksPayload, mask: HTMLCanvasElement): FaceLandmarksPayload {
  const outline = face.contours?.faceOutline
  const { leftBrow, rightBrow, noseBridge, forehead, chin } = face.anchors
  if (!outline?.length || !leftBrow || !rightBrow || !noseBridge || !forehead || !chin) return face

  const sample = document.createElement('canvas')
  sample.width = sample.height = 256
  const ctx = sample.getContext('2d')
  if (!ctx) return face
  ctx.drawImage(mask, 0, 0, 256, 256)
  const pixels = ctx.getImageData(0, 0, 256, 256).data
  const isVisible = ({ x, y }: NormalizedPoint) => x >= 0 && y >= 0 && x < 1 && y < 1
    && pixels[(Math.floor(y * 256) * 256 + Math.floor(x * 256)) * 4 + 3] >= 128
  const browY = (leftBrow.y + rightBrow.y) / 2
  const maxExtension = Math.max(0, (chin.y - browY) * .5)

  // Walk outward through contiguous visible skin so a fringe stops the trace.
  const extend = (point: NormalizedPoint) => {
    if (point.y >= browY || !isVisible(point)) return point
    const dx = point.x - noseBridge.x
    const dy = point.y - noseBridge.y
    const length = Math.hypot(dx, dy)
    if (length < 1 / 256) return point
    let last = point
    for (let distance = 1 / 256; distance <= maxExtension; distance += 1 / 256) {
      const next = { x: point.x + dx / length * distance, y: point.y + dy / length * distance }
      if (!isVisible(next)) break
      last = next
    }
    return last
  }

  const refinedOutline = outline.flatMap((point, index) => {
    const next = outline[(index + 1) % outline.length]
    if (point.y >= browY && next.y >= browY) return [point]
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) * 96))
    return Array.from({ length: steps }, (_, step) => extend({
      x: point.x + (next.x - point.x) * step / steps,
      y: point.y + (next.y - point.y) * step / steps,
    }))
  })

  return {
    ...face,
    anchors: { ...face.anchors, forehead: extend(forehead) },
    contours: { ...face.contours, faceOutline: refinedOutline },
  }
}
