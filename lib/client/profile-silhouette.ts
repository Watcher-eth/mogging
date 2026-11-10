import type { NormalizedPoint } from '@/lib/analysis/landmarks'
import { getPortraitSegmentation } from './report-face-visibility'
import { traceProfilePhoto, type ProfilePhotoGuides } from './profile-photo-guides'

export type ProfileSilhouette = { outline: NormalizedPoint[]; skin: NormalizedPoint[]; hair: NormalizedPoint[]; facing: 'left' | 'right'; features?: ProfilePhotoGuides }
const outlines = new Map<string, Promise<ProfileSilhouette | null>>()

export async function getProfileSilhouette(src: string) {
  return (await getProfileSilhouetteRegions(src))?.outline ?? null
}

export function getProfileSilhouetteRegions(src: string) {
  const cached = outlines.get(src)
  if (cached) return cached
  const pending = readSilhouette(src).catch(() => null).then(points => {
    if (!points && outlines.get(src) === pending) outlines.delete(src)
    return points
  })
  if (outlines.size >= 8) outlines.delete(outlines.keys().next().value!)
  outlines.set(src, pending)
  return pending
}

async function readSilhouette(src: string): Promise<ProfileSilhouette | null> {
  const photo = new Image()
  photo.src = src
  await photo.decode()
  const segmentation = await getPortraitSegmentation(photo)
  const mask = segmentation?.face
  const context = mask?.getContext('2d')
  if (!mask || !context) return null
  const { width, height } = mask
  const pixels = context.getImageData(0, 0, width, height).data
  const rows: { left: number; right: number; y: number }[] = []
  for (let y = 0; y < height; y += 2) {
    let left = 0, right = width - 1
    const face = (x: number) => pixels[(y * width + x) * 4 + 3] >= 128
    while (left < right && !face(left)) left++
    while (right > left && !face(right)) right--
    if (right - left > width * .06) rows.push({ left: left / width, right: right / width, y: y / height })
  }
  if (rows.length < height * .1) return null
  // The nose produces an outward peak between brow and mouth. Find it on
  // both segmented edges so the contour also works with mirrored photos.
  const peak = (key: 'left' | 'right') => {
    const sign = key === 'left' ? -1 : 1
    const radius = Math.max(2, Math.floor(rows.length * .12))
    return Math.max(...rows.slice(radius, -radius).map((row, i) => {
      const n = i + radius
      return n < rows.length * .27 || n > rows.length * .67 ? 0
        : sign * (row[key] - (rows[n - radius][key] + rows[n + radius][key]) / 2)
    }))
  }
  const center = rows.reduce((sum, row) => sum + (row.left + row.right) / 2, 0) / rows.length
  const hairOffset = (segmentation?.hairCenterX ?? center) - center
  const edge = Math.abs(hairOffset) > .035 ? hairOffset > 0 ? 'left' : 'right'
    : peak('left') >= peak('right') ? 'left' : 'right'
  const trace = (side: 'left' | 'right') => rows.map((row, i) => ({
    x: ((rows[i - 1] ?? row)[side] + 2 * row[side] + (rows[i + 1] ?? row)[side]) / 4,
    y: row.y,
  }))
  const outline = trace(edge)
  const farEdge = trace(edge === 'left' ? 'right' : 'left').reverse()
  const silhouette: ProfileSilhouette = { outline, skin: [...outline, ...farEdge], hair: segmentation?.hairOutline ?? [], facing: edge }
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 768 / Math.max(photo.naturalWidth, photo.naturalHeight))
  sample.width = Math.round(photo.naturalWidth * scale)
  sample.height = Math.round(photo.naturalHeight * scale)
  const ctx = sample.getContext('2d')
  if (ctx) {
    try {
      ctx.drawImage(photo, 0, 0, sample.width, sample.height)
      silhouette.features = traceProfilePhoto(silhouette, ctx.getImageData(0, 0, sample.width, sample.height))
    } catch {
      // Keep the silhouette if the source does not allow pixel access.
    }
  }
  return silhouette
}
