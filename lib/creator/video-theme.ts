// Theme canvas graphics, never photographic pixels. Alpha and geometry stay unchanged.
const colors = new Map<string, string>()
export function darkVideoColor(color: string): string {
  const cached = colors.get(color)
  if (cached) return cached
  let channels: number[], alpha = 1
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(value => value + value).join('')
    if (hex.length !== 6 && hex.length !== 8) return color
    channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16))
    if (hex.length === 8) alpha = parseInt(hex.slice(6), 16) / 255
  } else if (/^rgba?\(/.test(color)) {
    const values = color.match(/[\d.]+/g)?.map(Number) ?? []
    if (values.length < 3) return color
    channels = values.slice(0, 3); alpha = values[3] ?? 1
  } else return color
  if (![...channels, alpha].every(Number.isFinite)) return color
  const luminance = (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]) / 255
  // Lift near-white card surfaces above the dark page instead of collapsing them into black.
  const gray = Math.round(17 + 228 * Math.pow(Math.max(0, 1 - luminance), .62))
  const result = `rgba(${gray},${gray},${gray},${alpha})`
  if (colors.size >= 512) colors.clear()
  colors.set(color, result)
  return result
}
const themed = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>()
const originals = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>()
export function isDarkVideoContext(ctx: CanvasRenderingContext2D) { return originals.has(ctx) }
export function originalVideoContext(ctx: CanvasRenderingContext2D) { return originals.get(ctx) ?? ctx }
export function videoThemeContext(ctx: CanvasRenderingContext2D, theme: 'light' | 'dark') {
  if (theme === 'light') return ctx
  const cached = themed.get(ctx)
  if (cached) return cached
  const methods = new Map<PropertyKey, unknown>()
  const result = new Proxy(ctx, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (typeof value !== 'function') return value
      if (!methods.has(key)) methods.set(key, ['createLinearGradient', 'createRadialGradient', 'createConicGradient'].includes(String(key)) ? (...args: unknown[]) => {
        const gradient = Reflect.apply(value, target, args) as CanvasGradient
        const add = gradient.addColorStop.bind(gradient)
        gradient.addColorStop = (offset, color) => add(offset, darkVideoColor(color))
        return gradient
      } : value.bind(target))
      return methods.get(key)
    },
    set(target, key, value) {
      return Reflect.set(target, key, ['fillStyle', 'strokeStyle', 'shadowColor'].includes(String(key)) && typeof value === 'string' ? darkVideoColor(value) : value, target)
    },
  })
  themed.set(ctx, result); originals.set(result, ctx)
  return result
}
