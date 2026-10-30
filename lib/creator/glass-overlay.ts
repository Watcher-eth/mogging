import { z } from 'zod'

export const glassOverlaySchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), contrast: z.boolean().optional(), pattern: z.enum(['solid', 'dashed', 'dotted']).default('dotted'), opacity: z.number().min(.05).max(1).default(.88), markers: z.boolean().default(true), regions: z.boolean().default(false) }).strict()
export const defaultGlassOverlay = glassOverlaySchema.parse({})
export type GlassOverlay = z.infer<typeof glassOverlaySchema>

export function overlayOutlineColor(ink = '#FFFFFF') {
  const brightness = [1, 3, 5].reduce((sum, index) => sum + parseInt(ink.slice(index, index + 2), 16), 0) / 3
  return brightness < 128 ? '#FFFFFF' : '#111111'
}
