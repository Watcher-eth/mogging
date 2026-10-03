import type { CourseContent } from './validation'
import type { courses, courseAssets, courseSellers } from './schema'

type JsonRow<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }
export type CourseRecord = JsonRow<typeof courses.$inferSelect>
export type CourseAsset = JsonRow<typeof courseAssets.$inferSelect>
export type CourseSeller = JsonRow<typeof courseSellers.$inferSelect>

export class CourseRequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function courseRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, signal, credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) throw new CourseRequestError(response.status, result.error?.message || 'Request failed. Try again.')
  return result.data as T
}
export const creatorCoursePath = (id: string) => `/api/creator/courses/${id}`

export function newCourseContent(): CourseContent {
  return { title: 'Untitled course', summary: '', description: '', coverUrl: null, category: 'looksmaxxing', language: 'en', outcomes: [], refundPolicy: '', price: { amount: 0, currency: 'usd', accessDays: 365 }, sections: [{ id: crypto.randomUUID(), title: 'Chapter 1', lessons: [{ id: crypto.randomUUID(), title: 'Lesson 1', kind: 'text', body: '', videoAssetId: null, resourceAssetIds: [], preview: false }] }] }
}
