
const blurredPortraits = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
export const reportPortraitFade = {
  bottom: .44,
  stops: [[0, 0], [.18, .03], [.4, .15], [.62, .42], [.82, .78], [.97, 1], [1, 1]],
  layers: [{ start: 0, blur: 2 }, { start: .2, blur: 4 }, { start: .4, blur: 8 }, { start: .6, blur: 13.3 }],
} as const

export function drawReportPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  if (typeof document === 'undefined') {
    const scale = Math.max(width / image.width, height / image.height)
    ctx.drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale)
    return
  }
  let portrait = blurredPortraits.get(image)
  if (!portrait) {
    const create = () => { const canvas = document.createElement('canvas'); canvas.width = Math.round(width * 3); canvas.height = Math.round(height * 3); return canvas }
    const source = create()
    portrait = create()
    const original = source.getContext('2d')!, composite = portrait.getContext('2d')!
    const scale = Math.max(source.width / image.width, source.height / image.height)
    original.drawImage(image, (source.width - image.width * scale) / 2, (source.height - image.height * scale) / 2, image.width * scale, image.height * scale)
    composite.drawImage(source, 0, 0)
    drawPortraitProgressiveBlur(composite, source.width, source.height, reportPortraitFade.bottom)
    blurredPortraits.set(image, portrait)
  }
  ctx.drawImage(portrait, 0, 0, width, height)
}
export function drawReportPortraitFade(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const top = height * (1 - reportPortraitFade.bottom), bottom = ctx.createLinearGradient(0, top, 0, height)
  reportPortraitFade.stops.forEach(([position, alpha]) => bottom.addColorStop(position, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = bottom; ctx.fillRect(0, top, width, height - top + 1)
  const left = ctx.createLinearGradient(0, 0, width * .06, 0)
  ;[[0,.38],[.16,.30],[.38,.16],[.64,.06],[.86,.01],[1,0]].forEach(([stop,alpha]) => left.addColorStop(stop, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = left; ctx.fillRect(0, 0, width * .06, height)
  const right = ctx.createLinearGradient(width * .96, 0, width, 0)
  ;[[0,0],[.14,.01],[.36,.04],[.62,.12],[.84,.22],[1,.28]].forEach(([stop,alpha]) => right.addColorStop(stop, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = right; ctx.fillRect(width * .96, 0, width * .04, height)
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
