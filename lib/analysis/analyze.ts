import { z } from 'zod'
import { hairColorSchema } from '@/lib/appearance/types'
import { createPhotoRecord } from '@/lib/photos/service'
import { storeImageDataUrl } from '@/lib/storage/images'
import { updateUserAvatarIfMissing } from '@/lib/users/service'
import { toAnalysisFailure } from './errors'
import { analysisProvider } from './provider'
import { createFallbackAnalysisReport, normalizeAnalysisReport } from './report'
import { computePslScore } from './scoring'
import { saveAnalysisResult } from './service'
import { faceLandmarksPayloadSchema } from './landmarks'

export const analyzeAndSaveSchema = z.object({
  imageData: z.string().min(1),
  gender: z.enum(['male', 'female', 'other']).default('other'),
  photoType: z.enum(['face', 'body', 'outfit']).default('face'),
  userId: z.string().min(1).nullable().optional(),
  anonymousActorId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(120).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  landmarks: faceLandmarksPayloadSchema.nullable().optional(),
})

export type AnalyzeAndSaveInput = z.infer<typeof analyzeAndSaveSchema>

export async function analyzeAndSave(input: AnalyzeAndSaveInput) {
  const data = analyzeAndSaveSchema.parse(input)
  const storedImagePromise = storeImageDataUrl(data.imageData)
  const providerResultPromise = analysisProvider
    .analyzeFace({
      imageDataUrl: data.imageData,
      gender: data.gender,
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  const storedImage = await storedImagePromise
  if (data.userId) {
    await updateUserAvatarIfMissing(data.userId, storedImage.imageUrl)
  }
  const providerResult = await providerResultPromise

  if (!providerResult.ok) {
    const photoResult = await createPhotoRecord({
      userId: data.userId ?? null,
      anonymousActorId: data.anonymousActorId ?? null,
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      imageHash: storedImage.imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      age: data.age ?? null,
      hairColor: data.hairColor ?? null,
      photoType: data.photoType,
    })
    const failure = toAnalysisFailure(providerResult.error)
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: failure.metrics,
      landmarks: data.landmarks ?? {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v1',
      failureReason: failure.failureReason,
    })

    return {
      photo: photoResult.photo,
      analysis: analysisResult.analysis,
      deduped: photoResult.deduped,
    }
  }

  if (!providerResult.result.faceDetected) {
    const photoResult = await createPhotoRecord({
      userId: data.userId ?? null,
      anonymousActorId: data.anonymousActorId ?? null,
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      imageHash: storedImage.imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      age: data.age ?? null,
      hairColor: data.hairColor ?? null,
      photoType: data.photoType,
    })
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: {},
      landmarks: data.landmarks ?? {},
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
    age: data.age ?? null,
    hairColor: data.hairColor ?? null,
    photoType: data.photoType,
  })
  const result = providerResult.result
  const pslScore = computePslScore(result)
  const report = normalizeAnalysisReport(result.report, pslScore) ?? createFallbackAnalysisReport(result, pslScore)
  const analysisResult = await saveAnalysisResult({
    photoId: photoResult.photo.id,
    status: 'complete',
    pslScore,
    harmonyScore: result.harmonyScore,
    dimorphismScore: result.dimorphismScore,
    angularityScore: result.angularityScore,
    percentile: result.percentile ?? null,
    tier: result.tier ?? null,
    tierDescription: result.tierDescription ?? null,
    metrics: {
      report,
      symmetryScore: result.symmetryScore ?? null,
      proportionalityScore: result.proportionalityScore ?? null,
      averagenessScore: result.averagenessScore ?? null,
      metricScores: result.metricScores,
    },
    landmarks: data.landmarks ?? result.landmarks,
    model: analysisProvider.model,
    promptVersion: 'psl-kimi-v1',
  })

  return {
    photo: photoResult.photo,
    analysis: analysisResult.analysis,
    deduped: photoResult.deduped,
  }
}
