import { z } from 'zod'

export const glassOverlaySchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), contrast: z.boolean().optional(), pattern: z.enum(['solid', 'dashed', 'dotted']).default('dotted'), opacity: z.number().min(.05).max(1).default(.88), markers: z.boolean().default(true), regions: z.boolean().default(false) }).strict()
export const defaultGlassOverlay = glassOverlaySchema.parse({})
export type GlassOverlay = z.infer<typeof glassOverlaySchema>

export function applyGlassInk(ctx: CanvasRenderingContext2D, unit = 1, weight = 2.4, color = 'rgba(255,255,255,.88)') {
  ctx.strokeStyle = ctx.fillStyle = color
  ctx.lineWidth = weight * unit
  ctx.lineCap = ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(231,244,255,.3)'
  ctx.shadowBlur = 2.5 * unit
}
