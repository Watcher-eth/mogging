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
}

export const saveAnalysisDraft = (draft: AnalysisDraft) => updateDraft(draft)

export const saveAnalysisSidePhoto = (reportId: string, image: AnalysisDraftImage) =>
  updateDraft(image, `side:${reportId}`)

export const loadAnalysisSidePhoto = (reportId: string) =>
  readDraft<AnalysisDraftImage>(`side:${reportId}`)

export const loadAnalysisDraft = () => readDraft<AnalysisDraft>(DRAFT_KEY)

async function readDraft<T>(key: string) {
  const db = await openDraftDb()
  const draft = await requestToPromise<T | undefined>(
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
  )
  db.close()

  return draft ?? null
}

export const clearAnalysisDraft = () => updateDraft()

async function updateDraft(draft?: AnalysisDraft | AnalysisDraftImage, key = DRAFT_KEY) {
  const db = await openDraftDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to save checkout photos'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save checkout photos'))
      const store = transaction.objectStore(STORE_NAME)
      if (draft) store.put(draft, key)
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
