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

export type FaceLandmarksPayload = {
  version: 1
  source: 'mediapipe-face-landmarker'
  confidence: number
  image: {
    width: number
    height: number
  }
  anchors: FaceLandmarkAnchors
}

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const faceLandmarksPayloadSchema = z.object({
  version: z.literal(1),
  source: z.literal('mediapipe-face-landmarker'),
  confidence: z.number().min(0).max(1),
  image: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  anchors: z.record(z.string(), pointSchema.optional()).default({}),
})

export function parseFaceLandmarksPayload(value: unknown): FaceLandmarksPayload | null {
  const parsed = faceLandmarksPayloadSchema.safeParse(value)
  return parsed.success ? (parsed.data as FaceLandmarksPayload) : null
}
