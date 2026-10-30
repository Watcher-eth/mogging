import type { GeneratorImage } from './content-generator'
import { cutout } from './editorial-posters'
import { drawPortraitProgressiveBlur } from './report-portrait'
import { smoothMotion, portraitStage } from './video-layout'
import type { VideoFrame } from './video-layout'
import type { VideoScene } from './video-composition'
import type { PixelPoint } from './mobile-overlay-engine/resolve'

export function portraitIsDetail(scene: Pick<VideoScene, 'source' | 'narration' | 'editorial' | 'study' | 'photoStudy' | 'profileStudy'>) {
  if (scene.photoStudy) return false
  if (['overall', 'symmetry', 'proportions', 'face-shape'].includes(scene.source.categoryId) || /whole (?:face|picture|portrait)|all (?:the )?features|overall/i.test(scene.narration)) return false
  return scene.study?.operation === 'inspect' || scene.editorial === 'detail' || /\bclose[- ]?up\b|\bzoom(?:ing|ed)?\s+(?:in|into)\b/i.test(scene.narration)
}

export function editorialPortraitStage(_staging: VideoScene['editorial']) {
  return { ...portraitStage }
}

export function portraitContextRegion(image: { width: number; height: number }, landmarks?: GeneratorImage['landmarks'], headTop?: number): VideoFrame | undefined {
  const forehead = landmarks?.anchors.forehead, chin = landmarks?.anchors.chin
  if ((landmarks?.confidence ?? 0) < .58 || !forehead || !chin || !Number.isFinite(chin.x) || !Number.isFinite(forehead.y) || !Number.isFinite(chin.y) || chin.y <= forehead.y) return undefined
  const faceHeight = (chin.y - forehead.y) * image.height
  const outline = landmarks?.contours?.faceOutline?.filter(point => Number.isFinite(point.x)) ?? []
  const left = outline.length ? Math.min(...outline.map(point => point.x)) * image.width : chin.x * image.width - faceHeight * .4
  const right = outline.length ? Math.max(...outline.map(point => point.x)) * image.width : chin.x * image.width + faceHeight * .4
  const width = Math.max((right - left) * 1.35, faceHeight * 1.2)
  const y = headTop ?? forehead.y * image.height - faceHeight * .8
  return { x: (left + right - width) / 2, y, width, height: chin.y * image.height - y + faceHeight * .45 }
}

export function portraitImageFrame(image: { width: number; height: number }, stage: { width: number; height: number }, focus?: VideoFrame, landmarks?: GeneratorImage['landmarks'], headTop?: number, maximumZoom = 1.45, fillBottom = false): VideoFrame {
  const context = portraitContextRegion(image, landmarks, headTop)
  const fullWidth = stage.width / image.width
  const base = context ? Math.min(stage.width / context.width, stage.height * .94 / context.height) : fullWidth
  const framingScale = focus ? Math.max(base, Math.min(base * maximumZoom, stage.width * .86 / focus.width, stage.height * .86 / focus.height)) : base
  const scale = fillBottom ? Math.max(framingScale,stage.height/image.height) : framingScale
  const width = image.width * scale, height = image.height * scale
  const target = focus ?? context
  const position = (size: number, available: number, target: number) => size <= available ? (available - size) / 2 : Math.max(available - size, Math.min(0, target))
  const y = focus ? position(height, stage.height, stage.height * (fillBottom ? .4 : .48) - (focus.y + focus.height / 2) * scale) : context ? stage.height * .5 - (context.y + context.height / 2) * scale : Math.max(0, (stage.height - height) / 2)
  return {
    x: target ? position(width, stage.width, stage.width / 2 - (target.x + target.width / 2) * scale) : (stage.width - width) / 2,
    y: fillBottom ? Math.max(stage.height-height,y) : y,
    width, height,
  }
}

export function portraitFadeStart(height: number, protectedBottom = 0) {
  return Math.max(height * .72, Math.min(height * .94, protectedBottom + height * .035))
}

export function drawPortraitEdgeFade(ctx: CanvasRenderingContext2D, width: number, height: number, protectedBottom?: number, bottom = height) {
  ctx.save()
  height = Math.max(height, bottom)
  const start = portraitFadeStart(height, protectedBottom)
  drawPortraitProgressiveBlur(ctx, width, height, 1 - start / height)
  const fade = ctx.createLinearGradient(0, start, 0, height)
  for (let index = 0; index <= 32; index++) fade.addColorStop(index / 32, `rgba(255,255,255,${smoothMotion(index / 32)})`)
  ctx.fillStyle = fade; ctx.fillRect(0, start, width, height - start + 1)
  const fringe = width * .018
  for (const side of [0, 1]) {
    const x = side ? width - fringe : 0
    const fade = ctx.createLinearGradient(side ? width : 0, 0, side ? x : fringe, 0)
    fade.addColorStop(0, '#fff'); fade.addColorStop(.25, '#ffffff73'); fade.addColorStop(.65, '#ffffff14'); fade.addColorStop(1, '#fff0')
    ctx.fillStyle = fade; ctx.fillRect(x, 0, fringe, height)
  }
  ctx.restore()
}

export function portraitDetailRegion(points: PixelPoint[], width: number, height: number) {
  if (points.length < 3 || width <= 0 || height <= 0) return null
  const finite = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (finite.length < 3) return null
  const left = Math.min(...finite.map(point => point.x)), right = Math.max(...finite.map(point => point.x))
  const top = Math.min(...finite.map(point => point.y)), bottom = Math.max(...finite.map(point => point.y))
  const cropWidth = Math.min(width, Math.max(width * .22, (right - left) * 1.4, (bottom - top) * 1.7))
  const cropHeight = Math.min(height, cropWidth * .72)
  return { x: Math.max(0, Math.min(width - cropWidth, (left + right - cropWidth) / 2)), y: Math.max(0, Math.min(height - cropHeight, (top + bottom - cropHeight) / 2)), width: cropWidth, height: cropHeight }
}

export function registeredPortraitCrop(crop: { x: number; y: number; width: number; height: number }, sourceRect: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const left = Math.max(0, (crop.x - sourceRect.x) / sourceRect.width * width), top = Math.max(0, (crop.y - sourceRect.y) / sourceRect.height * height)
  const right = Math.min(width, (crop.x + crop.width - sourceRect.x) / sourceRect.width * width), bottom = Math.min(height, (crop.y + crop.height - sourceRect.y) / sourceRect.height * height)
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : undefined
}

const headTops = new WeakMap<HTMLCanvasElement, number>()
const cache = new Map<string, { subject: Promise<HTMLCanvasElement> }>()
function portraitCache(image: HTMLImageElement, source: GeneratorImage) {
  let cached = cache.get(source.dataUrl)
  if (!cached) {
    if (cache.size >= 8) cache.delete(cache.keys().next().value!)
    cached = { subject: cutout(image) }; cache.set(source.dataUrl, cached)
  }
  return cached
}

export function portraitSubject(image: HTMLImageElement, source: GeneratorImage) { return portraitCache(image, source).subject }

export async function preparePortrait(image: HTMLImageElement, source: GeneratorImage) {
  try {
    const canvas = await portraitCache(image, source).subject
    let headTop = headTops.get(canvas)
    if (headTop === undefined) {
      const sample = document.createElement('canvas'); sample.width = 128; sample.height = Math.min(256, Math.round(128 * canvas.height / canvas.width))
      const ctx = sample.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(canvas, 0, 0, sample.width, sample.height)
      const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data
      headTop = 0
      for (let row = 0; row < sample.height; row++) {
        let covered = 0
        for (let column = 0; column < sample.width; column++) if (pixels[(row * sample.width + column) * 4 + 3] > 80) covered++
        if (covered >= 3) { headTop = Math.max(0, row - 2) / sample.height * canvas.height; break }
      }
      headTops.set(canvas, headTop)
    }
    return { canvas, headTop, source: { ...source, width: image.width, height: image.height }, sourceRect: { x: 0, y: 0, width: image.width, height: image.height } }
  } catch (error) {
    cache.delete(source.dataUrl)
    throw new Error(`Could not prepare the background-free portrait: ${error instanceof Error ? error.message : 'segmentation failed'}`)
  }
}
