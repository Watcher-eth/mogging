import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { HairColor, SkinColor } from '@/lib/appearance/types'

type Rgb = {
  r: number
  g: number
  b: number
}

export async function inferHairColorFromDataUrl(
  dataUrl: string,
  landmarks?: FaceLandmarksPayload | null
): Promise<HairColor | null> {
  if (typeof window === 'undefined') return null

  try {
    const image = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    const maxSide = 420
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const rects = getHairSampleRects(canvas.width, canvas.height, landmarks)
    const samples: Rgb[] = []

    for (const rect of rects) {
      const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height)
      for (let index = 0; index < imageData.data.length; index += 4 * 7) {
        const alpha = imageData.data[index + 3]
        if (alpha < 180) continue

        const pixel = {
          r: imageData.data[index],
          g: imageData.data[index + 1],
          b: imageData.data[index + 2],
        }
        if (isLikelyBackground(pixel)) continue
        samples.push(pixel)
      }
    }

    if (samples.length < 24) return null
    return bucketHairColor(samples)
  } catch {
    return null
  }
}

export async function inferSkinColorFromDataUrl(
  dataUrl: string,
  landmarks?: FaceLandmarksPayload | null
): Promise<SkinColor | null> {
  if (typeof window === 'undefined' || !landmarks) return null

  try {
    const image = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    const maxSide = 420
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const points = getSkinSamplePoints(canvas.width, canvas.height, landmarks)
    const samples: Rgb[] = []

    for (const point of points) {
      const rect = clampRect(point.x - 8, point.y - 8, 16, 16, canvas.width, canvas.height)
      const imageData = context.getImageData(rect.x, rect.y, rect.width, rect.height)
      for (let index = 0; index < imageData.data.length; index += 4 * 5) {
        const pixel = {
          r: imageData.data[index],
          g: imageData.data[index + 1],
          b: imageData.data[index + 2],
        }
        if (isLikelySkin(pixel)) samples.push(pixel)
      }
    }

    if (samples.length < 12) return null
    return bucketSkinColor(samples)
  } catch {
    return null
  }
}

function getHairSampleRects(width: number, height: number, landmarks?: FaceLandmarksPayload | null) {
  const forehead = landmarks?.anchors.forehead
  const leftBrow = landmarks?.anchors.leftBrow
  const rightBrow = landmarks?.anchors.rightBrow
  const jawLeft = landmarks?.anchors.jawLeft
  const jawRight = landmarks?.anchors.jawRight

  if (forehead && leftBrow && rightBrow) {
    const centerX = forehead.x * width
    const faceWidth = Math.max(96, Math.abs((jawRight?.x ?? rightBrow.x) - (jawLeft?.x ?? leftBrow.x)) * width * 1.42)
    const topY = Math.max(0, (forehead.y * height) - faceWidth * 0.78)
    const lowerY = Math.max(0, (forehead.y * height) - faceWidth * 0.08)
    const sideY = Math.max(0, (leftBrow.y * height) - faceWidth * 0.32)
    const sideHeight = Math.max(24, faceWidth * 0.72)

    return [
      clampRect(centerX - faceWidth * 0.46, topY, faceWidth * 0.92, lowerY - topY, width, height),
      clampRect(centerX - faceWidth * 0.74, sideY, faceWidth * 0.28, sideHeight, width, height),
      clampRect(centerX + faceWidth * 0.46, sideY, faceWidth * 0.28, sideHeight, width, height),
    ]
  }

  return [
    clampRect(width * 0.28, height * 0.08, width * 0.44, height * 0.24, width, height),
    clampRect(width * 0.18, height * 0.18, width * 0.18, height * 0.34, width, height),
    clampRect(width * 0.64, height * 0.18, width * 0.18, height * 0.34, width, height),
  ]
}

function bucketHairColor(samples: Rgb[]): HairColor {
  const hairSamples = samples.filter((pixel) => !isLikelySkin(pixel) || isLikelyBlondPixel(pixel))
  const usableSamples = hairSamples.length >= 24 ? hairSamples : samples
  const blondSamples = usableSamples.filter(isLikelyBlondPixel)
  const lightWarmRatio = blondSamples.length / usableSamples.length

  if (blondSamples.length >= 10 && lightWarmRatio >= 0.16) return 'blond'

  const rgb = averageRgb(usableSamples)
  const { h, s, v } = rgbToHsv(rgb)

  if (v < 46) return 'black'
  if (s < 0.18 && v > 150) return 'gray'
  if ((h < 26 || h > 345) && s > 0.28 && v > 55) return 'red'
  if (h >= 28 && h <= 62 && s > 0.12 && v > 112) return 'blond'
  if (v < 138 && h >= 12 && h <= 52) return 'brown'
  if (v < 92) return 'black'
  return 'other'
}

function averageRgb(samples: Rgb[]) {
  const average = samples.reduce(
    (total, pixel) => ({
      r: total.r + pixel.r,
      g: total.g + pixel.g,
      b: total.b + pixel.b,
    }),
    { r: 0, g: 0, b: 0 }
  )

  return {
    r: average.r / samples.length,
    g: average.g / samples.length,
    b: average.b / samples.length,
  }
}

function getSkinSamplePoints(width: number, height: number, landmarks: FaceLandmarksPayload) {
  const anchors = landmarks.anchors
  const leftCheek = midpointPixels(anchors.leftEyeOuter, anchors.mouthLeft, width, height)
  const rightCheek = midpointPixels(anchors.rightEyeOuter, anchors.mouthRight, width, height)
  const forehead = anchors.forehead
    ? { x: anchors.forehead.x * width, y: Math.min(height - 1, (anchors.forehead.y + 0.035) * height) }
    : null
  const noseBridge = anchors.noseBridge
    ? { x: anchors.noseBridge.x * width, y: anchors.noseBridge.y * height }
    : null

  return [leftCheek, rightCheek, forehead, noseBridge].filter(Boolean) as Array<{ x: number; y: number }>
}

function bucketSkinColor(samples: Rgb[]): SkinColor {
  const luminanceValues = samples
    .map((pixel) => 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b)
    .sort((a, b) => a - b)
  const middle = luminanceValues.slice(
    Math.floor(luminanceValues.length * 0.18),
    Math.ceil(luminanceValues.length * 0.82)
  )
  const luminance = middle.reduce((sum, value) => sum + value, 0) / Math.max(1, middle.length)

  if (luminance >= 202) return 'very_light'
  if (luminance >= 172) return 'light'
  if (luminance >= 138) return 'white'
  if (luminance >= 106) return 'tan'
  if (luminance >= 74) return 'brown'
  return 'black'
}

function isLikelySkin({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 72 && g > 38 && b > 24 && max - min > 15 && r > g && g >= b * 0.72
}

function isLikelyBlondPixel(pixel: Rgb) {
  const { h, s, v } = rgbToHsv(pixel)
  return h >= 28 && h <= 64 && s >= 0.10 && s <= 0.68 && v >= 112 && pixel.r >= pixel.b + 22
}

function isLikelyBackground({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max > 238 && max - min < 16
}

function midpointPixels(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
  width: number,
  height: number
) {
  if (!a || !b) return null

  return {
    x: ((a.x + b.x) / 2) * width,
    y: ((a.y + b.y) / 2) * height,
  }
}

function rgbToHsv({ r, g, b }: Rgb) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max * 255,
  }
}

function clampRect(x: number, y: number, width: number, height: number, maxWidth: number, maxHeight: number) {
  const left = Math.max(0, Math.min(maxWidth - 1, Math.round(x)))
  const top = Math.max(0, Math.min(maxHeight - 1, Math.round(y)))
  const right = Math.max(left + 1, Math.min(maxWidth, Math.round(x + width)))
  const bottom = Math.max(top + 1, Math.min(maxHeight, Math.round(y + height)))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for appearance inference'))
    image.src = dataUrl
  })
}
