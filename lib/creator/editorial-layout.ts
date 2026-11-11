import { editorialEase } from './editorial-motion'
import type { EditorialFrame, EditorialPhoto } from './editorial-scenes'

export const editorialBackground = (dark: boolean) => dark ? '#171719' : '#ffffff'

// Tint and content use the same entrance and exit, even in a short cue.
export function editorialReveal(time: number, start: number, end: number, enterMs: number, exitMs: number, reduced: boolean) {
  const available = end - start
  if (available <= 0 || time < start || time >= end) return { enter: 0, opacity: 0 }
  if (reduced) return { enter: 1, opacity: 1 }
  const entrance = Math.min(enterMs, available * .48)
  const exit = Math.min(exitMs, available * .42)
  const enter = editorialEase((time - start) / entrance)
  return { enter, opacity: enter * editorialEase((end - time) / exit) }
}

export type EditorialPortraitPose = { frame: EditorialFrame; image: EditorialFrame; radius: number }

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))

export function editorialCoverPose(photo: EditorialPhoto, frame: EditorialFrame, radius = 0, focus?: EditorialFrame): EditorialPortraitPose {
  const scale = Math.max(frame.width / (focus?.width ?? photo.image.width), frame.height / (focus?.height ?? photo.image.height))
  const width = photo.image.width * scale, height = photo.image.height * scale
  const x = focus ? clamp(frame.width / 2 - (focus.x + focus.width / 2) * scale, frame.width - width, 0) : (frame.width - width) / 2
  const y = focus ? clamp(frame.height / 2 - (focus.y + focus.height / 2) * scale, frame.height - height, 0) : (frame.height - height) / 2
  return { frame, image: { x: frame.x + x, y: frame.y + y, width, height }, radius }
}

export function mixEditorialPose(from: EditorialPortraitPose, to: EditorialPortraitPose, amount: number): EditorialPortraitPose {
  const t = editorialEase(amount)
  const frame = (a: EditorialFrame, b: EditorialFrame) => ({
    x: mix(a.x, b.x, t), y: mix(a.y, b.y, t),
    width: mix(a.width, b.width, t), height: mix(a.height, b.height, t),
  })
  return { frame: frame(from.frame, to.frame), image: frame(from.image, to.image), radius: mix(from.radius, to.radius, t) }
}

export function drawEditorialPortrait(ctx: CanvasRenderingContext2D, photo: EditorialPhoto, pose: EditorialPortraitPose) {
  const { frame, image, radius } = pose
  ctx.save()
  ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius); ctx.clip()
  ctx.drawImage(photo.image, image.x, image.y, image.width, image.height)
  ctx.restore()
}

type Point = { x: number; y: number }
const defocusCache = new WeakMap<EditorialPhoto['image'], Map<string, HTMLCanvasElement>>()

/** Soften the source once. A feathered mask restores the detected detail in the same source coordinates. */
function defocusedPhoto(photo: EditorialPhoto, focus?: { key: string; paths: Point[][] }) {
  const key = focus?.key ?? 'stage'
  let variants = defocusCache.get(photo.image)
  const cached = variants?.get(key)
  if (cached) return cached

  const softened = document.createElement('canvas')
  const scale = Math.min(1, (focus ? 1600 : 540) / Math.max(photo.image.width, photo.image.height))
  const width = softened.width = Math.max(1, Math.round(photo.image.width * scale))
  const height = softened.height = Math.max(1, Math.round(photo.image.height * scale))
  const surface = softened.getContext('2d')!
  surface.drawImage(photo.image, 0, 0, width, height)
  const blurScale = Math.max(width, height) / 540
  surface.filter = `blur(${(focus ? 5 : 12) * blurScale}px)`
  surface.drawImage(photo.image, 0, 0, width, height)
  surface.filter = 'none'

  if (focus) {
    const mask = document.createElement('canvas')
    mask.width = width
    mask.height = height
    const detail = mask.getContext('2d')!
    detail.filter = `blur(${1.65 * blurScale}px)`
    detail.beginPath()
    for (const path of focus.paths) {
      detail.moveTo(path[0].x * width / photo.image.width, path[0].y * height / photo.image.height)
      for (const point of path.slice(1)) detail.lineTo(point.x * width / photo.image.width, point.y * height / photo.image.height)
      detail.closePath()
    }
    detail.fill()
    detail.filter = 'none'
    detail.globalCompositeOperation = 'source-in'
    detail.drawImage(photo.image, 0, 0, width, height)
    surface.drawImage(mask, 0, 0)
  }

  surface.globalCompositeOperation = 'destination-in'
  const fade = surface.createLinearGradient(0, 0, 0, height * .075)
  fade.addColorStop(0, '#ffffff00')
  fade.addColorStop(1, '#ffffff')
  surface.fillStyle = fade
  surface.fillRect(0, 0, width, height)

  if (!variants) {
    variants = new Map()
    defocusCache.set(photo.image, variants)
  }
  variants.set(key, softened)
  return softened
}

export function drawEditorialDefocus(
  ctx: CanvasRenderingContext2D, photo: EditorialPhoto, pose: EditorialPortraitPose,
  size: { width: number; height: number }, dark: boolean, focus?: { key: string; paths: Point[][] },
) {
  ctx.save()
  ctx.fillStyle = editorialBackground(dark)
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha *= focus ? 1 : dark ? .33 : .28
  const source = typeof document === 'undefined' ? photo.image : defocusedPhoto(photo, focus)
  const frame = { x: 0, y: 0, width: size.width, height: size.height }
  drawEditorialPortrait(ctx, { image: source }, { frame, radius: 0, image: pose.image })
  ctx.restore()
}

export function wrapEditorialText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const rows: string[] = []
  let row = ''
  for (const word of text.split(/\s+/)) {
    const next = row ? row + ' ' + word : word
    if (row && ctx.measureText(next).width > width) { rows.push(row); row = word }
    else row = next
  }
  if (row) rows.push(row)
  return rows
}
