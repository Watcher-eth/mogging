import { z } from 'zod'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { computeImageHash } from '@/lib/photos/imageHash'
import { createPhotoRecord } from '@/lib/photos/service'
import { storeImageDataUrl } from '@/lib/storage/images'
import { updateUserAvatarIfMissing } from '@/lib/users/service'
import { toAnalysisFailure } from './errors'
import { analysisProvider } from './provider'
import { createFallbackAnalysisReport, normalizeAnalysisReport } from './report'
import { computePslScore } from './scoring'
import { saveAnalysisResult } from './service'
import { faceLandmarksPayloadSchema } from './landmarks'
import { AnalysisProviderError } from './errors'
import type { AnalysisProviderResult } from './schema'

export const analyzeAndSaveSchema = z.object({
  imageData: z.string().min(1),
  gender: z.enum(['male', 'female', 'other']).default('other'),
  photoType: z.enum(['face', 'body', 'outfit']).default('face'),
  userId: z.string().min(1).nullable().optional(),
  anonymousActorId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(120).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
  age: z.number().int().min(18).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
  landmarks: faceLandmarksPayloadSchema.nullable().optional(),
})

export type AnalyzeAndSaveInput = z.infer<typeof analyzeAndSaveSchema>

export async function analyzeAndSave(input: AnalyzeAndSaveInput) {
  const data = analyzeAndSaveSchema.parse(input)
  const storedImagePromise = storeImageDataUrl(data.imageData)
    .then((storedImage) => ({ ok: true as const, storedImage }))
    .catch((error: unknown) => ({ ok: false as const, error }))
  const providerResultPromise = analysisProvider
    .analyzeFace({
      imageDataUrl: data.imageData,
      gender: data.gender,
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error: unknown) => ({ ok: false as const, error }))

  const storedImageResult = await storedImagePromise
  if (!storedImageResult.ok) {
    console.error('Image storage failed during analysis', storedImageResult.error)
  }
  if (storedImageResult.ok && data.userId) {
    await updateUserAvatarIfMissing(data.userId, storedImageResult.storedImage.imageUrl)
  }
  const providerResult = await providerResultPromise

  if (!storedImageResult.ok) {
    return createTransientAnalysisResult(data, providerResult, 'Image storage failed')
  }

  const storedImage = storedImageResult.storedImage

  if (!providerResult.ok && !isRetryableProviderFailure(providerResult.error)) {
    const photoResult = await createPhotoRecord({
      userId: data.userId ?? null,
      anonymousActorId: data.anonymousActorId ?? null,
      imageUrl: storedImage.imageUrl,
      imageStorageKey: storedImage.imageStorageKey,
      imageHash: storedImage.imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      age: normalizeApparentAge(data.age),
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
      photoType: data.photoType,
    })
    const failure = toAnalysisFailure(providerResult.error)
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: failure.metrics,
      landmarks: data.landmarks ?? {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v2',
      failureReason: failure.failureReason,
    })

    return {
      photo: photoResult.photo,
      analysis: analysisResult.analysis,
      deduped: photoResult.deduped,
    }
  }

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
      age: normalizeApparentAge(data.age),
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
      photoType: data.photoType,
    })
    const failure = toAnalysisFailure(providerResult.error)
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: failure.metrics,
      landmarks: data.landmarks ?? {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v2',
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
      age: normalizeApparentAge(data.age),
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
      photoType: data.photoType,
    })
    const analysisResult = await saveAnalysisResult({
      photoId: photoResult.photo.id,
      status: 'failed',
      metrics: {},
      landmarks: data.landmarks ?? {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v2',
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
    age: normalizeApparentAge(data.age),
    hairColor: data.hairColor ?? null,
    skinColor: data.skinColor ?? null,
    photoType: data.photoType,
  })
  const result = providerResult.result
  const pslScore = computePslScore(result)
  const report = normalizeAnalysisReport(result.report, pslScore, result) ?? createFallbackAnalysisReport(result, pslScore)
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
    promptVersion: 'psl-kimi-v2',
  })

  return {
    photo: photoResult.photo,
    analysis: analysisResult.analysis,
    deduped: photoResult.deduped,
  }
}

function isRetryableProviderFailure(error: unknown) {
  return error instanceof AnalysisProviderError && error.retryable
}

function createTransientAnalysisResult(
  data: AnalyzeAndSaveInput,
  providerResult:
    | { ok: true; result: Awaited<ReturnType<typeof analysisProvider.analyzeFace>> }
    | { ok: false; error: unknown },
  persistenceFailureReason: string
) {
  const imageHash = computeImageHash(data.imageData)
  const photo = {
    id: `transient-photo-${imageHash}`,
    imageUrl: data.imageData,
    imageHash,
  }

  if (!providerResult.ok) {
    if (isRetryableProviderFailure(providerResult.error)) {
      const failure = toAnalysisFailure(providerResult.error)

      return {
        photo,
        analysis: {
          id: `transient-analysis-${imageHash}`,
          status: 'failed' as const,
          pslScore: null,
          harmonyScore: null,
          dimorphismScore: null,
          angularityScore: null,
          percentile: null,
          tier: null,
          tierDescription: null,
          metrics: failure.metrics,
          landmarks: data.landmarks ?? {},
          model: analysisProvider.model,
          promptVersion: 'psl-kimi-v2',
          failureReason: failure.failureReason,
          persistenceFailureReason,
        },
        deduped: false,
      }
    }

    const failure = toAnalysisFailure(providerResult.error)
    return {
      photo,
      analysis: {
        id: `transient-analysis-${imageHash}`,
        status: 'failed' as const,
        pslScore: null,
        harmonyScore: null,
        dimorphismScore: null,
        angularityScore: null,
        percentile: null,
        tier: null,
        tierDescription: null,
        metrics: failure.metrics,
        landmarks: data.landmarks ?? {},
        model: analysisProvider.model,
        promptVersion: 'psl-kimi-v2',
        failureReason: failure.failureReason,
        persistenceFailureReason,
      },
      deduped: false,
    }
  }

  if (!providerResult.result.faceDetected) {
    return {
      photo,
      analysis: {
        id: `transient-analysis-${imageHash}`,
        status: 'failed' as const,
        pslScore: null,
        harmonyScore: null,
        dimorphismScore: null,
        angularityScore: null,
        percentile: null,
        tier: null,
        tierDescription: null,
        metrics: {},
        landmarks: data.landmarks ?? {},
        model: analysisProvider.model,
        promptVersion: 'psl-kimi-v2',
        failureReason: 'No face detected',
        persistenceFailureReason,
      },
      deduped: false,
    }
  }

  const result = providerResult.result
  const pslScore = computePslScore(result)
  const report = normalizeAnalysisReport(result.report, pslScore, result) ?? createFallbackAnalysisReport(result, pslScore)

  return {
    photo,
    analysis: {
      id: `transient-analysis-${imageHash}`,
      status: 'complete' as const,
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
      promptVersion: 'psl-kimi-v2',
      failureReason: null,
      persistenceFailureReason,
    },
    deduped: false,
  }
}
