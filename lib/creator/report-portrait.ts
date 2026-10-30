import type { FaceLandmarksPayload } from './mobile-overlay-engine/landmarks'
import { getImageTransform } from './mobile-overlay-engine/layout'
import { smoothMotion } from './report-motion'

export type ReportPortraitCrop = { x:number; y:number; width:number; height:number }

// The chin stays above the fade while the lower crop retains neck and shoulders.
export function reportPortraitCrop(image: {width:number;height:number}, face?: FaceLandmarksPayload | null, viewport = {width:390,height:465}): ReportPortraitCrop | undefined {
  if (!face || face.confidence < .58 || image.width <= 0 || image.height <= 0) return
  const {forehead,chin} = face.anchors
  if (!forehead || !chin || ![forehead.x,forehead.y,chin.x,chin.y].every(Number.isFinite) || chin.y-forehead.y < .04) return
  const faceHeight=(chin.y-forehead.y)*image.height, baseline=getImageTransform(image,viewport,'cover')
  const centerY=baseline.offsetY+(forehead.y+chin.y)/2*image.height*baseline.scale
  const centerX=baseline.offsetX+(forehead.x+chin.x)/2*image.width*baseline.scale
  if(faceHeight*baseline.scale/viewport.height >= .42 && centerY/viewport.height >= .18 && centerY/viewport.height <= .52 && centerX/viewport.width >= .3 && centerX/viewport.width <= .7) return
  const outline=face.contours?.faceOutline?.filter(point=>Number.isFinite(point.x)) ?? []
  const left=outline.length?Math.min(...outline.map(point=>point.x)):Math.min(forehead.x,chin.x)-faceHeight/image.width*.4
  const right=outline.length?Math.max(...outline.map(point=>point.x)):Math.max(forehead.x,chin.x)+faceHeight/image.width*.4
  const aspect=viewport.width/viewport.height
  let width=Math.max(faceHeight*2.6*aspect,(right-left)*image.width*1.7),height=width/aspect
  const fit=Math.min(1,image.width/width,image.height/height);width*=fit;height*=fit
  const x=Math.max(0,Math.min(image.width-width,(left+right)/2*image.width-width/2))
  const y=Math.max(0,Math.min(image.height-height,forehead.y*image.height-faceHeight*.45))
  return {x:x/image.width,y:y/image.height,width:width/image.width,height:height/image.height}
}
export function reportPortraitProjection(image:{width:number;height:number},viewport:{width:number;height:number},crop?:ReportPortraitCrop){
  if(!crop)return getImageTransform(image,viewport,'cover')
  const scale=viewport.width/(crop.width*image.width)
  return {scale,offsetX:-crop.x*image.width*scale,offsetY:-crop.y*image.height*scale,renderedWidth:image.width*scale,renderedHeight:image.height*scale}
}
const blurredPortraits = new WeakMap<HTMLImageElement, Map<string,HTMLCanvasElement>>()
export const reportPortraitFade = {
  bottom: .44,
  stops: Array.from({ length: 33 }, (_, index) => [index / 32, smoothMotion(Math.min(1, index / 32 / .94))] as const),
  layers: [{ start: 0, blur: 2 }, { start: .2, blur: 4 }, { start: .4, blur: 8 }, { start: .6, blur: 13.3 }],
} as const

export function drawReportPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, crop?: ReportPortraitCrop) {
  const placement=reportPortraitProjection(image,{width,height},crop)
  if (typeof document === 'undefined') {
    ctx.drawImage(image,placement.offsetX,placement.offsetY,placement.renderedWidth,placement.renderedHeight)
    return
  }
  let versions=blurredPortraits.get(image)
  if(!versions){versions=new Map();blurredPortraits.set(image,versions)}
  const key=JSON.stringify([width,height,crop])
  let portrait = versions.get(key)
  if (!portrait) {
    const create = () => { const canvas = document.createElement('canvas'); canvas.width = Math.round(width * 3); canvas.height = Math.round(height * 3); return canvas }
    const source = create()
    portrait = create()
    const original = source.getContext('2d')!, composite = portrait.getContext('2d')!
    original.drawImage(image,placement.offsetX*3,placement.offsetY*3,placement.renderedWidth*3,placement.renderedHeight*3)
    composite.drawImage(source, 0, 0)
    drawPortraitProgressiveBlur(composite, source.width, source.height, reportPortraitFade.bottom)
    if(versions.size>=4)versions.clear()
    versions.set(key,portrait)
  }
  ctx.drawImage(portrait, 0, 0, width, height)
}
export function drawReportPortraitFade(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const top = height * (1 - reportPortraitFade.bottom), bottom = ctx.createLinearGradient(0, top, 0, height)
  reportPortraitFade.stops.forEach(([position, alpha]) => bottom.addColorStop(position, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = bottom; ctx.fillRect(0, top, width, height - top + 1)
}

// Shared by report heroes and prepared cutouts. Blur only the lower region,
// using small reusable surfaces for animated editorial stages as well as cached reports.
const blurSurfaces = new WeakMap<CanvasRenderingContext2D, { source: HTMLCanvasElement; layer: HTMLCanvasElement }>()

export function drawPortraitProgressiveBlur(ctx: CanvasRenderingContext2D, width: number, height: number, bottom: number) {
  if (typeof document === 'undefined') return
  let surfaces = blurSurfaces.get(ctx)
  if (!surfaces) { surfaces = { source: document.createElement('canvas'), layer: document.createElement('canvas') }; blurSurfaces.set(ctx, surfaces) }
  const { source, layer } = surfaces
  const rasterWidth = Math.min(720, Math.round(width)), scale = rasterWidth / width
  const fadeHeight = height * bottom, top = height - fadeHeight, rasterHeight = Math.ceil(fadeHeight * scale)
  if (source.width !== rasterWidth || source.height !== rasterHeight) { source.width = layer.width = rasterWidth; source.height = layer.height = rasterHeight }
  const snapshot = source.getContext('2d')!, transform = ctx.getTransform()
  snapshot.clearRect(0, 0, source.width, source.height)
  snapshot.drawImage(ctx.canvas, transform.e, transform.f + top * transform.d, width * transform.a, fadeHeight * transform.d, 0, 0, source.width, source.height)
  const blurred = layer.getContext('2d')!
  for (const { start, blur } of reportPortraitFade.layers) {
    blurred.clearRect(0, 0, layer.width, layer.height); blurred.globalCompositeOperation = 'source-over'
    blurred.filter = `blur(${blur * source.width / 390}px)`; blurred.drawImage(source, 0, 0); blurred.filter = 'none'
    blurred.globalCompositeOperation = 'destination-in'
    const mask = blurred.createLinearGradient(0, 0, 0, source.height)
    mask.addColorStop(0, '#fff0'); mask.addColorStop(start, '#fff0'); mask.addColorStop(Math.min(1, start + .4), '#fff'); mask.addColorStop(1, '#fff')
    blurred.fillStyle = mask; blurred.fillRect(0, 0, layer.width, layer.height)
    ctx.drawImage(layer, 0, top, width, fadeHeight)
  }
}

// Continue the photograph's last opaque band beneath its fade, without changing framing.
const edgeBands = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
export function drawPortraitColorExtension(ctx: CanvasRenderingContext2D, width: number, bottom: number, imageBottom: number) {
  if (typeof document === 'undefined' || imageBottom >= bottom || imageBottom <= 0) return
  let band = edgeBands.get(ctx)
  if (!band) { band = document.createElement('canvas'); edgeBands.set(ctx, band) }
  const sampleHeight = Math.min(48, imageBottom), transform = ctx.getTransform()
  const rasterWidth = Math.min(540, Math.round(width))
  if (band.width !== rasterWidth || band.height !== 24) { band.width = rasterWidth; band.height = 24 }
  const sample = band.getContext('2d')!
  sample.clearRect(0, 0, band.width, band.height)
  sample.drawImage(ctx.canvas, transform.e, transform.f + (imageBottom - sampleHeight) * transform.d, width * transform.a, sampleHeight * transform.d, 0, 0, band.width, band.height)
  ctx.save(); ctx.filter = 'blur(16px)'
  ctx.drawImage(band, -16, imageBottom - 20, width + 32, bottom - imageBottom + 52)
  ctx.restore()
}
