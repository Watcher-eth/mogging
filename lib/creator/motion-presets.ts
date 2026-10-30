import { cubicBezier } from 'motion'

export const motionEase = [.22, 1, .36, 1] as const
export const motionTiming = { enter: .55, exit: .18, panel: .42, stagger: .06 } as const
export const appearancePresets = {
  'in-view': { opacity: 0, y: 3, scale: .94, blur: 8 },
  'group-reveal': { opacity: 0, y: 3, scale: .98, blur: 4 },
  'text-blur': { opacity: 0, y: 20, scale: 1, blur: 12 },
  'text-slide': { opacity: 0, y: 20, scale: 1, blur: 0 },
  'text-scale': { opacity: 0, y: 0, scale: .94, blur: 4 },
} as const
export type AppearancePreset = keyof typeof appearancePresets
const ease = cubicBezier(...motionEase)

export function sampleAppearance(preset: AppearancePreset, progress: number, reduced = false) {
  const amount = reduced ? 1 : ease(Math.max(0, Math.min(1, progress)))
  const initial = appearancePresets[preset]
  return { opacity: initial.opacity + (1 - initial.opacity) * amount, y: initial.y * (1 - amount), scale: initial.scale + (1 - initial.scale) * amount, blur: initial.blur * (1 - amount) }
}

export function appearanceVariants(preset: AppearancePreset) {
  const initial = appearancePresets[preset]
  return { hidden: { opacity: initial.opacity, y: `${initial.y}%`, scale: initial.scale, filter: `blur(${initial.blur}px)` }, visible: { opacity: 1, y: '0%', scale: 1, filter: 'blur(0px)' } }
}
