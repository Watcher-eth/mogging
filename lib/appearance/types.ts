import { z } from 'zod'

export const hairColorSchema = z.enum(['black', 'brown', 'blond', 'red', 'gray', 'other'])
export type HairColor = z.infer<typeof hairColorSchema>

export const skinColorSchema = z.enum(['very_light', 'light', 'white', 'tan', 'brown', 'black'])
export type SkinColor = z.infer<typeof skinColorSchema>

export const ageBucketSchema = z.enum(['18-24', '25-34', '35-44', '45+'])
export type AgeBucket = z.infer<typeof ageBucketSchema>

export function normalizeApparentAge(age?: number | null) {
  if (!age) return null
  return Math.max(18, age)
}

export function getAgeBucket(age?: number | null): AgeBucket | null {
  const normalizedAge = normalizeApparentAge(age)
  if (!normalizedAge) return null
  if (normalizedAge <= 24) return '18-24'
  if (normalizedAge <= 34) return '25-34'
  if (normalizedAge <= 44) return '35-44'
  return '45+'
}
