import type { GeneratorImage } from './content-generator'
import { cutout } from './editorial-posters'

const cache = new Map<string, Promise<{ canvas: HTMLCanvasElement; source: GeneratorImage }>>()
export function preparePortrait(image: HTMLImageElement, source: GeneratorImage) {
  const cached = cache.get(source.dataUrl)
  if (cached) return cached
  const task = cutout(image).then(subject => {
    const anchors = source.landmarks?.anchors
    const outline = source.landmarks?.contours?.faceOutline ?? []
    const chin = anchors?.chin?.y ?? Math.max(.7, ...outline.map(point => point.y))
    const forehead = anchors?.forehead?.y ?? Math.min(.22, ...outline.map(point => point.y))
    const faceHeight = Math.max(.25, chin - forehead)
    const top = Math.max(0, forehead - faceHeight * .48)
    const bottom = Math.min(1, chin + faceHeight * .43)
    const center = ((anchors?.leftPupil?.x ?? .4) + (anchors?.rightPupil?.x ?? .6)) / 2
    const x = Math.max(0, center - .5), width = Math.min(1 - x, center + .5 - x)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * width); canvas.height = Math.round(image.height * (bottom - top))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(subject, image.width * x, image.height * top, image.width * width, image.height * (bottom - top), 0, 0, canvas.width, canvas.height)
    const fade = ctx.createLinearGradient(0, canvas.height * .91, 0, canvas.height)
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, '#fff0')
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = fade; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const edge = ctx.createLinearGradient(0, 0, canvas.width, 0)
    edge.addColorStop(0, '#fff0'); edge.addColorStop(.035, '#fff'); edge.addColorStop(.965, '#fff'); edge.addColorStop(1, '#fff0')
    ctx.fillStyle = edge; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const point = (p: { x: number; y: number }) => ({ x: (p.x - x) / width, y: (p.y - top) / (bottom - top) })
    const landmarks = source.landmarks ? { ...source.landmarks, image: { width: canvas.width, height: canvas.height }, anchors: Object.fromEntries(Object.entries(source.landmarks.anchors).map(([key, p]) => [key, p ? point(p) : p])), contours: Object.fromEntries(Object.entries(source.landmarks.contours ?? {}).map(([key, points]) => [key, points?.map(point)])) } : null
    return { canvas, source: { ...source, width: canvas.width, height: canvas.height, landmarks } }
  }).catch(error => { cache.delete(source.dataUrl); throw new Error(`Could not prepare the background-free portrait: ${error instanceof Error ? error.message : 'segmentation failed'}`) })
  if (cache.size >= 8) cache.delete(cache.keys().next().value!)
  cache.set(source.dataUrl, task)
  return task
}
