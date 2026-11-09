import { editorialEase } from './editorial-motion'
import type { EditorialFrame, EditorialPhoto } from './editorial-scenes'

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
