import { z } from 'zod'

export const glassOverlaySchema = z.object({ pattern: z.enum(['solid', 'dashed', 'dotted']).default('dotted'), opacity: z.number().min(.05).max(1).default(.78), markers: z.boolean().default(true), regions: z.boolean().default(false) }).strict()
export const defaultGlassOverlay = glassOverlaySchema.parse({})
export type GlassOverlay = z.infer<typeof glassOverlaySchema>
