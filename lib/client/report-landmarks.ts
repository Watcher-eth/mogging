import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'

// Report photos are immutable. Keep normalized anchors (never viewport coordinates)
// and in-flight work across category changes and repeat visits, with bounded memory.
const cache = new Map<string, Promise<FaceLandmarksPayload | null>>()

export function getReportImageLandmarks(photoUrl: string, displayUrl: string): Promise<FaceLandmarksPayload | null> {
  const existing = cache.get(photoUrl)
  if (existing) {
    cache.delete(photoUrl)
    cache.set(photoUrl, existing)
    return existing
  }
  const pending = import('./faceLandmarks')
    .then(({ extractFaceLandmarksFromDataUrl }) => extractFaceLandmarksFromDataUrl(displayUrl))
    .then((landmarks) => isFaceLandmarksUsable(landmarks) ? landmarks : null)
    .catch(() => null)
    .then((landmarks) => {
      // Transient loading/detection failures can be retried on a later visit.
      if (!landmarks && cache.get(photoUrl) === pending) cache.delete(photoUrl)
      return landmarks
    })
  cache.set(photoUrl, pending)
  if (cache.size > 24) cache.delete(cache.keys().next().value!)
  return pending
}
