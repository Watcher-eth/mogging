import { z } from 'zod'

export const hairColorSchema = z.enum(['black', 'brown', 'blond', 'red', 'gray', 'other'])
export type HairColor = z.infer<typeof hairColorSchema>

export const skinColorSchema = z.enum(['very_light', 'light', 'medium', 'tan', 'deep', 'very_deep'])
export type SkinColor = z.infer<typeof skinColorSchema>

export const ageBucketSchema = z.enum(['13-17', '18-24', '25-34', '35-44', '45+'])
export type AgeBucket = z.infer<typeof ageBucketSchema>

export function getAgeBucket(age?: number | null): AgeBucket | null {
  if (!age) return null
  if (age <= 17) return '13-17'
  if (age <= 24) return '18-24'
  if (age <= 34) return '25-34'
  if (age <= 44) return '35-44'
  return '45+'
}
