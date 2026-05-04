import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { HairColor } from '@/lib/appearance/types'

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
        if (isLikelyBackground(pixel) || isLikelySkin(pixel)) continue
        samples.push(pixel)
      }
    }

    if (samples.length < 24) return null
    return bucketHairColor(samples)
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
  const average = samples.reduce(
    (total, pixel) => ({
      r: total.r + pixel.r,
      g: total.g + pixel.g,
      b: total.b + pixel.b,
    }),
    { r: 0, g: 0, b: 0 }
  )
  const rgb = {
    r: average.r / samples.length,
    g: average.g / samples.length,
    b: average.b / samples.length,
  }
  const { h, s, v } = rgbToHsv(rgb)

  if (v < 46) return 'black'
  if (s < 0.18 && v > 150) return 'gray'
  if ((h < 26 || h > 345) && s > 0.28 && v > 55) return 'red'
  if (h >= 26 && h <= 58 && s > 0.18 && v > 138) return 'blond'
  if (v < 138 && h >= 12 && h <= 52) return 'brown'
  if (v < 92) return 'black'
  return 'other'
}

function isLikelySkin({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 72 && g > 38 && b > 24 && max - min > 15 && r > g && g >= b * 0.72
}

function isLikelyBackground({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max > 238 && max - min < 16
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
