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
import type { AnalysisProviderResult, MetricCategory } from './schema'

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
    const result = createDeterministicProviderFallback(data)
    const pslScore = computePslScore(result)
    const report = createFallbackAnalysisReport(result, pslScore)
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
        generatedByFallback: true,
        providerFailure: failure.metrics.providerError,
        symmetryScore: result.symmetryScore ?? null,
        proportionalityScore: result.proportionalityScore ?? null,
        averagenessScore: result.averagenessScore ?? null,
        metricScores: result.metricScores,
      },
      landmarks: data.landmarks ?? {},
      model: analysisProvider.model,
      promptVersion: 'psl-kimi-v2',
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

function createDeterministicProviderFallback(data: AnalyzeAndSaveInput): AnalysisProviderResult {
  const anchors = data.landmarks?.anchors ?? {}
  const leftPupil = anchors.leftPupil
  const rightPupil = anchors.rightPupil
  const noseTip = anchors.noseTip
  const mouthCenter = anchors.mouthCenter
  const chin = anchors.chin
  const forehead = anchors.forehead
  const jawLeft = anchors.jawLeft
  const jawRight = anchors.jawRight

  const eyeLevelDelta = leftPupil && rightPupil ? Math.abs(leftPupil.y - rightPupil.y) : 0.018
  const centerX = averageDefined([noseTip?.x, mouthCenter?.x, chin?.x], 0.5)
  const centerDrift = Math.abs(centerX - 0.5)
  const jawBalance = jawLeft && jawRight ? Math.abs((jawLeft.x + jawRight.x) / 2 - centerX) : 0.025
  const faceHeight = forehead && chin ? Math.max(0.25, chin.y - forehead.y) : 0.52
  const jawWidth = jawLeft && jawRight ? Math.abs(jawRight.x - jawLeft.x) : 0.3
  const jawRatio = jawWidth / faceHeight

  const symmetryScore = clampScore(7.2 - eyeLevelDelta * 55 - centerDrift * 12 - jawBalance * 16)
  const proportionalityScore = clampScore(6.4 - Math.abs(faceHeight - 0.54) * 7)
  const averagenessScore = clampScore(5.8 - Math.abs(jawRatio - 0.58) * 3)
  const angularityScore = clampScore(5.5 + Math.max(0, 0.62 - jawRatio) * 2)
  const dimorphismScore = clampScore(data.gender === 'female' ? 5.8 : data.gender === 'male' ? 6.1 : 5.9)
  const harmonyScore = clampScore((symmetryScore + proportionalityScore + averagenessScore + angularityScore) / 4)
  const skinScore = clampScore(5.7)

  return {
    faceDetected: true,
    harmonyScore,
    symmetryScore,
    proportionalityScore,
    averagenessScore,
    dimorphismScore,
    angularityScore,
    percentile: Math.round(Math.max(45, Math.min(86, harmonyScore * 11))),
    tier: harmonyScore >= 6.4 ? 'strong' : harmonyScore >= 5.5 ? 'balanced' : 'developing',
    tierDescription: 'Deterministic report generated from local landmarks while provider output was unavailable.',
    metricScores: [
      metric('Eye symmetry', symmetryScore, 'symmetry', 'Local eye-line and axis balance.'),
      metric('Facial thirds', proportionalityScore, 'proportionality', 'Estimated vertical proportion from available anchors.'),
      metric('Feature harmony', harmonyScore, 'harmony', 'Composite balance across detected facial anchors.'),
      metric('Dimorphism', dimorphismScore, 'dimorphism', 'Mode-adjusted structural cue estimate.'),
      metric('Jaw and cheek definition', angularityScore, 'angularity', 'Lower-third width and jaw support estimate.'),
      metric('Skin and presentation', skinScore, 'skin', 'Conservative presentation score when vision report is unavailable.'),
    ],
    landmarks: data.landmarks ?? {},
  }
}

function metric(name: string, score: number, category: MetricCategory, description: string) {
  return { name, score, category, description }
}

function averageDefined(values: Array<number | undefined>, fallback: number) {
  const defined = values.filter((value): value is number => typeof value === 'number')
  if (defined.length === 0) return fallback
  return defined.reduce((sum, value) => sum + value, 0) / defined.length
}

function clampScore(score: number) {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
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
      const result = createDeterministicProviderFallback(data)
      const pslScore = computePslScore(result)
      const report = createFallbackAnalysisReport(result, pslScore)

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
            generatedByFallback: true,
            providerFailure: failure.metrics.providerError,
            symmetryScore: result.symmetryScore ?? null,
            proportionalityScore: result.proportionalityScore ?? null,
            averagenessScore: result.averagenessScore ?? null,
            metricScores: result.metricScores,
          },
          landmarks: data.landmarks ?? {},
          model: analysisProvider.model,
          promptVersion: 'psl-kimi-v2',
          failureReason: null,
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
  const report = normalizeAnalysisReport(result.report, pslScore) ?? createFallbackAnalysisReport(result, pslScore)

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
