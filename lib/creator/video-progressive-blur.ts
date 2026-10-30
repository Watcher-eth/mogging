import { videoSize, smoothMotion } from './video-layout'

export const captionBackdrop = { height: 360, width: 432, layers: 5, blur: 24 } as const
export const brandBackdrop = { ...captionBackdrop, height: 190, layers: 4, blur: 18 } as const
export const reportBackdrop = { ...captionBackdrop, height: 558, layers: 6, blur: 44 } as const
export const metricBackdrop = { ...captionBackdrop, height: 780, width: 540, layers: 6, blur: 32 } as const
type BlurSurfaces = { source: HTMLCanvasElement; layer: HTMLCanvasElement; mask: HTMLCanvasElement }
const surfaces = new WeakMap<CanvasRenderingContext2D, Map<string, BlurSurfaces>>()

export function drawCaptionBackdrop(ctx: CanvasRenderingContext2D, options: { edge?: 'top' | 'bottom'; tint?: 'dark' | 'light' | 'none'; role?: 'caption' | 'brand' | 'report' | 'metric'; height?: number; theme?: 'light' | 'dark' } = {}) {
  const { edge = 'top', tint = 'dark', role = 'caption' } = options
  if ( typeof document === 'undefined') return
  const base = role === 'metric' ? metricBackdrop : role === 'brand' ? brandBackdrop : role === 'report' ? reportBackdrop : captionBackdrop
  const config = { ...base, height: options.height === undefined ? base.height : Math.round(Math.max(360, Math.min(1000, options.height)) / 20) * 20 }
  const key = `${edge}:${role}:${config.height}`
  let cache = surfaces.get(ctx)
  if (!cache) { cache = new Map(); surfaces.set(ctx, cache) }
  let cached = cache.get(key)
  if (!cached) {
    const create = () => {
      const canvas = document.createElement('canvas')
      canvas.width = config.width; canvas.height = Math.round(config.height * canvas.width / 1080)
      return canvas
    }
    cached = { source: create(), layer: create(), mask: create() }
    const maskCtx = cached.mask.getContext('2d')!
    const gradient = maskCtx.createLinearGradient(0, 0, 0, cached.mask.height)
    if (role === 'metric' || role === 'report') {
      for (let step = 0; step <= 16; step++) {
        const position = step / 16
        gradient.addColorStop(position, `rgba(255,255,255,${1 - smoothMotion(Math.max(0, (position - (role === 'report' ? .35 : .58)) / (role === 'report' ? .65 : .42)))})`)
      }
    } else { gradient.addColorStop(0, '#fff'); gradient.addColorStop(.48, '#fff'); gradient.addColorStop(1, '#fff0') }
    maskCtx.fillStyle = gradient; maskCtx.fillRect(0, 0, cached.mask.width, cached.mask.height)
    cache.set(key, cached)
  }
  const { source, layer, mask } = cached
  const sourceCtx = source.getContext('2d')!, layerCtx = layer.getContext('2d')!
  sourceCtx.clearRect(0, 0, source.width, source.height)
  const cropHeight = config.height * ctx.canvas.width / 1080
  sourceCtx.save()
  if (edge === 'bottom') { sourceCtx.translate(0, source.height); sourceCtx.scale(1, -1) }
  sourceCtx.drawImage(ctx.canvas, 0, edge === 'bottom' ? ctx.canvas.height - cropHeight : 0, ctx.canvas.width, cropHeight, 0, 0, source.width, source.height)
  sourceCtx.restore()
  ctx.save()
  if (edge === 'bottom') { ctx.translate(0, videoSize.height); ctx.scale(1, -1) }
  for (let index = 0; index < config.layers; index++) {
    const fraction = (index + 1) / config.layers
    layerCtx.clearRect(0, 0, layer.width, layer.height)
    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.filter = `blur(${config.blur * fraction * source.width / 1080}px)`
    layerCtx.drawImage(source, 0, 0); layerCtx.filter = 'none'
    layerCtx.globalCompositeOperation = 'destination-in'
    const gradient = layerCtx.createLinearGradient(0, 0, 0, layer.height * (1 - index / config.layers))
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(.3, '#fff'); gradient.addColorStop(1, '#fff0')
    layerCtx.fillStyle = gradient; layerCtx.fillRect(0, 0, layer.width, layer.height)
    ctx.drawImage(layer, 0, 0, 1080, config.height)
  }
  if (tint !== 'none') {
    layerCtx.clearRect(0, 0, layer.width, layer.height); layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.fillStyle = tint === 'light' ? options.theme === 'dark' ? '#111111' : '#ffffff' : '#08080873'; layerCtx.fillRect(0, 0, layer.width, layer.height)
    layerCtx.globalCompositeOperation = 'destination-in'; layerCtx.drawImage(mask, 0, 0)
    ctx.drawImage(layer, 0, 0, 1080, config.height)
  }
  ctx.restore()
}
