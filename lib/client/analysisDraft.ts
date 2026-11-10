import type { AnalysisGender, DesktopAnalysisPreferences, DesktopCaptureStep, DesktopSetupStep } from '@/components/analysis/desktop-onboarding'
import type { CaptureFrameImagePosition } from '@/components/analysis/capture-frame'
import type { MobileOnboardingProgress } from './scan-onboarding'
import type { WebAnalysisProduct } from '@/lib/payments/web-analysis-plans'
import type { LandmarkInput } from '@/lib/analysis-v2/measurements'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import type { HairColor, SkinColor } from '@/lib/appearance/types'

const DB_NAME = 'mogging-analysis'
const STORE_NAME = 'drafts'
const DRAFT_KEY = 'current'

export type AnalysisDraftImage = {
  id: string
  name: string
  dataUrl: string
  view?: 'side'
  hairColor?: HairColor | null
  skinColor?: SkinColor | null
  landmarks?: FaceLandmarksPayload | null
  mesh?: LandmarkInput | null
}

export type AnalysisDraft = {
  images: AnalysisDraftImage[]
  gender: 'male' | 'female' | 'other'
  savedAt: number
  preferences?: DesktopAnalysisPreferences
  desktopConsent?: boolean
  requestIds?: string[]
}

export type PaywallIntroCheckpoint = { flowId: string; deadline: number }

export type AnalysisCheckpoint = AnalysisDraft & {
  step: 'intro' | 'story' | 'desktop-setup' | 'upload' | 'preview-analysis' | 'desktop-scan' | 'actual-analysis'
  flowId?: string
  mobileProfile: MobileOnboardingProgress
  desktopSetup: DesktopSetupStep
  captureStep: DesktopCaptureStep
  chosenProfile: AnalysisGender | null
  background: string
  selectedImageId: string | null
  cameraFront?: AnalysisDraftImage
  imageFramePositions: Record<string, CaptureFrameImagePosition>
  previewDeadline: number | null
  desktopScanStartedAt?: number
  autoPaywall: boolean
  paywallOpen: boolean
  paywallPlan?: WebAnalysisProduct
  paywallIntro?: PaywallIntroCheckpoint
}

const checkpointMaxAge = 7 * 24 * 60 * 60 * 1000
const checkpointKey = (scope: string) => `checkpoint:v1:${scope}`

export async function loadAnalysisCheckpoint(scope: string) {
  const checkpoint = await readDraft<AnalysisCheckpoint>(checkpointKey(scope))
  if (checkpoint && Date.now() - checkpoint.savedAt > checkpointMaxAge) {
    await updateDraft(undefined, checkpointKey(scope), saved => saved.savedAt === checkpoint.savedAt)
    return null
  }
  return checkpoint
}

export const saveAnalysisCheckpoint = (scope: string, checkpoint: AnalysisCheckpoint) => updateDraft(checkpoint, checkpointKey(scope))
export const clearAnalysisCheckpoint = (scope: string, photoId?: string) => updateDraft(
  undefined, checkpointKey(scope), photoId ? saved => saved.images.some(image => image.id === photoId) : undefined,
)

export const saveAnalysisDraft = (draft: AnalysisDraft) => updateDraft(draft)

export const saveCheckoutAnalysisDraft = (sessionId: string, draft: AnalysisDraft) => updateDraft(draft, `checkout:${sessionId}`)
export const loadCheckoutAnalysisDraft = (sessionId: string) => readDraft<AnalysisDraft>(`checkout:${sessionId}`)
export const clearCheckoutAnalysisDraft = (sessionId: string) => updateDraft(undefined, `checkout:${sessionId}`)

export const saveAnalysisSidePhoto = (reportId: string, image: AnalysisDraftImage) =>
  updateDraft(image, `side:${reportId}`)

export const loadAnalysisSidePhoto = (reportId: string) =>
  readDraft<AnalysisDraftImage>(`side:${reportId}`)

export const loadAnalysisDraft = () => readDraft<AnalysisDraft>(DRAFT_KEY)

async function readDraft<T>(key: string) {
  const db = await openDraftDb()
  try {
    const draft = await requestToPromise<T | undefined>(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    )
    return draft ?? null
  } finally { db.close() }
}

export const clearAnalysisDraft = () => updateDraft()

async function updateDraft(draft?: AnalysisDraft | AnalysisDraftImage, key = DRAFT_KEY, deleteIf?: (saved: AnalysisCheckpoint) => boolean) {
  const db = await openDraftDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to save checkout photos'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save checkout photos'))
      const store = transaction.objectStore(STORE_NAME)
      if (draft) store.put(draft, key)
      else if (deleteIf) {
        const request = store.get(key)
        request.onsuccess = () => { if (request.result && deleteIf(request.result)) store.delete(key) }
      }
      else store.delete(key)
    })
  } finally { db.close() }
}

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
