import { z } from 'zod'
import { createPhotoRecord } from '@/lib/photos/service'
import { storeImageDataUrl } from '@/lib/storage/images'
import { analysisProvider } from './provider'
import { computePslScore } from './scoring'
import { saveAnalysisResult } from './service'

export const analyzeAndSaveSchema = z.object({
  imageData: z.string().min(1),
  gender: z.enum(['male', 'female', 'other']).default('other'),
  photoType: z.enum(['face', 'body', 'outfit']).default('face'),
  userId: z.string().min(1).nullable().optional(),
  anonymousActorId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(120).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
})

export type AnalyzeAndSaveInput = z.infer<typeof analyzeAndSaveSchema>

export async function analyzeAndSave(input: AnalyzeAndSaveInput) {
  const data = analyzeAndSaveSchema.parse(input)
  const [storedImage, providerResult] = await Promise.all([
    storeImageDataUrl(data.imageData),
    analysisProvider.analyzeFace({
      imageDataUrl: data.imageData,
      gender: data.gender,
    }),
  ])

  if (!providerResult.faceDetected) {
    const photoResult = await createPhotoRecord({
      userId: data.userId ?? null,
      anonymousActorId: data.anonymousActorId ?? null,
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      imageHash: storedImage.imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      photoType: data.photoType,
    })
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: {},
      landmarks: {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v1',
      failureReason: 'No face detected',
    })

    return {
      photo: photoResult.photo,
      analysis: analysisResult.analysis,
      deduped: photoResult.deduped,
    }
  }

  const photoResult = await createPhotoRecord({
    userId: data.userId ?? null,
    anonymousActorId: data.anonymousActorId ?? null,
    imageUrl: storedImage.imageUrl,
    imageStorageKey: storedImage.imageStorageKey,
    imageHash: storedImage.imageHash,
    name: data.name ?? null,
    caption: data.caption ?? null,
    gender: data.gender,
    photoType: data.photoType,
  })
  const pslScore = computePslScore(providerResult)
  const analysisResult = await saveAnalysisResult({
    photoId: photoResult.photo.id,
    status: 'complete',
    pslScore,
    harmonyScore: providerResult.harmonyScore,
    dimorphismScore: providerResult.dimorphismScore,
    angularityScore: providerResult.angularityScore,
    percentile: providerResult.percentile ?? null,
    tier: providerResult.tier ?? null,
    tierDescription: providerResult.tierDescription ?? null,
    metrics: {
      symmetryScore: providerResult.symmetryScore ?? null,
      proportionalityScore: providerResult.proportionalityScore ?? null,
      averagenessScore: providerResult.averagenessScore ?? null,
      metricScores: providerResult.metricScores,
    },
    landmarks: providerResult.landmarks,
    model: analysisProvider.model,
    promptVersion: 'psl-kimi-v1',
  })

  return {
    photo: photoResult.photo,
    analysis: analysisResult.analysis,
    deduped: photoResult.deduped,
  }
}
