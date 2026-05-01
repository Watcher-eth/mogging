import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

const DB_NAME = 'mogging-analysis'
const STORE_NAME = 'drafts'
const DRAFT_KEY = 'current'

export type AnalysisDraftImage = {
  id: string
  name: string
  dataUrl: string
  landmarks?: FaceLandmarksPayload | null
}

export type AnalysisDraft = {
  images: AnalysisDraftImage[]
  gender: 'male' | 'female' | 'other'
  savedAt: number
}

export async function saveAnalysisDraft(draft: AnalysisDraft) {
  const db = await openDraftDb()
  await requestToPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(draft, DRAFT_KEY))
  db.close()
}

export async function loadAnalysisDraft() {
  const db = await openDraftDb()
  const draft = await requestToPromise<AnalysisDraft | undefined>(
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DRAFT_KEY)
  )
  db.close()

  return draft ?? null
}

export async function clearAnalysisDraft() {
  const db = await openDraftDb()
  await requestToPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(DRAFT_KEY))
  db.close()
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
