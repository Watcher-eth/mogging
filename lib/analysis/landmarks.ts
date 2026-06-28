import { z } from 'zod'

export type NormalizedPoint = {
  x: number
  y: number
}

export type FaceLandmarkAnchors = {
  leftEyeOuter?: NormalizedPoint
  leftEyeInner?: NormalizedPoint
  rightEyeInner?: NormalizedPoint
  rightEyeOuter?: NormalizedPoint
  leftPupil?: NormalizedPoint
  rightPupil?: NormalizedPoint
  leftBrow?: NormalizedPoint
  rightBrow?: NormalizedPoint
  noseBridge?: NormalizedPoint
  noseTip?: NormalizedPoint
  mouthLeft?: NormalizedPoint
  mouthRight?: NormalizedPoint
  mouthCenter?: NormalizedPoint
  upperLip?: NormalizedPoint
  lowerLip?: NormalizedPoint
  leftCheek?: NormalizedPoint
  rightCheek?: NormalizedPoint
  chin?: NormalizedPoint
  jawLeft?: NormalizedPoint
  jawRight?: NormalizedPoint
  forehead?: NormalizedPoint
}

export type FaceLandmarkContours = {
  faceOutline?: NormalizedPoint[]
  leftEye?: NormalizedPoint[]
  rightEye?: NormalizedPoint[]
  leftBrow?: NormalizedPoint[]
  rightBrow?: NormalizedPoint[]
  noseBridge?: NormalizedPoint[]
  noseBase?: NormalizedPoint[]
  mouth?: NormalizedPoint[]
  jawline?: NormalizedPoint[]
  cheekbones?: NormalizedPoint[]
}

export type FaceLandmarkQuality = {
  score: number
  anchorCount?: number
  contourPointCount?: number
  faceCoverage?: number
  rollRadians?: number
  yawRadians?: number
  symmetryError?: number
  warnings?: string[]
}

export type FaceLandmarksPayload = {
  version: 1
  source: 'mediapipe-face-landmarker' | 'apple-vision' | 'kimi-vision-estimate'
  confidence: number
  image: {
    width: number
    height: number
  }
  anchors: FaceLandmarkAnchors
  contours?: FaceLandmarkContours
  quality?: FaceLandmarkQuality
}

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const faceLandmarksPayloadSchema = z.object({
  version: z.literal(1),
  source: z.enum(['mediapipe-face-landmarker', 'apple-vision', 'kimi-vision-estimate']),
  confidence: z.number().min(0).max(1),
  image: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  anchors: z.record(z.string(), pointSchema.optional()).default({}),
  contours: z.record(z.string(), z.array(pointSchema).optional()).optional(),
  quality: z.object({
    score: z.number().min(0).max(1),
    anchorCount: z.number().int().nonnegative().optional(),
    contourPointCount: z.number().int().nonnegative().optional(),
    faceCoverage: z.number().min(0).max(1).optional(),
    rollRadians: z.number().optional(),
    yawRadians: z.number().optional(),
    symmetryError: z.number().min(0).optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
})

export function parseFaceLandmarksPayload(value: unknown): FaceLandmarksPayload | null {
  const parsed = faceLandmarksPayloadSchema.safeParse(value)
  return parsed.success ? (parsed.data as FaceLandmarksPayload) : null
}
