import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'

// Report photos are immutable. Keep normalized anchors (never viewport coordinates)
// and in-flight work across category changes and repeat visits, with bounded memory.
const cache = new Map<string, Promise<FaceLandmarksPayload | null>>()

export function getReportImageLandmarks(photoUrl: string, displayUrl: string, profile = false): Promise<FaceLandmarksPayload | null> {
  const key = profile ? `profile:${photoUrl}` : photoUrl
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    cache.set(key, existing)
    return existing
  }
  const pending = import('./faceLandmarks')
    .then(({ extractFaceLandmarksFromDataUrl }) => extractFaceLandmarksFromDataUrl(displayUrl, profile))
    .then((landmarks) => isFaceLandmarksUsable(landmarks) ? landmarks : null)
    .catch(() => null)
    .then((landmarks) => {
      // Transient loading/detection failures can be retried on a later visit.
      if (!landmarks && cache.get(key) === pending) cache.delete(key)
      return landmarks
    })
  cache.set(key, pending)
  if (cache.size > 24) cache.delete(cache.keys().next().value!)
  return pending
}
