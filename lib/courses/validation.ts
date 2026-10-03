import { z } from 'zod'
import { courseCategoryIds } from './categories'

export const courseIdSchema = z.uuid()
export const courseSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(60)
const optionalUrl = z.url().refine(value => value.startsWith('https://'), 'HTTPS required').nullable().default(null)
export const courseCategorySchema = z.enum([...courseCategoryIds, 'grooming', 'style', 'skincare', 'general'])
const lessonSchema = z.object({
  id: courseIdSchema,
  title: z.string().trim().min(1).max(160),
  kind: z.enum(['video', 'text']),
  body: z.string().max(60_000).default(''),
  videoAssetId: courseIdSchema.nullable().default(null),
  resourceAssetIds: z.array(courseIdSchema).max(10).default([]),
  preview: z.boolean().default(false),
}).strict().superRefine((lesson, ctx) => {
  if (lesson.kind === 'text' && lesson.videoAssetId) ctx.addIssue({ code: 'custom', message: 'Text lessons cannot contain a video asset' })
})

export const courseContentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(500).default(''),
  description: z.string().max(20_000).default(''),
  coverUrl: optionalUrl,
  category: courseCategorySchema.default('looksmaxxing'),
  language: z.enum(['en', 'de', 'fr', 'es', 'it', 'pt', 'nl']).default('en'),
  outcomes: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  refundPolicy: z.string().trim().max(5000).default(''),
  price: z.object({
    amount: z.number().int().min(0).max(1_000_000),
    currency: z.enum(['usd', 'eur']),
    accessDays: z.number().int().min(1).max(3650),
  }).strict(),
  sections: z.array(z.object({
    id: courseIdSchema,
    title: z.string().trim().min(1).max(160),
    lessons: z.array(lessonSchema).max(100),
  }).strict()).max(30).default([]),
}).strict().superRefine((content, ctx) => {
  const ids = [...content.sections.map(section => section.id), ...content.sections.flatMap(section => section.lessons.map(lesson => lesson.id))]
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Section and lesson IDs must be unique' })
  if (content.sections.reduce((total, section) => total + section.lessons.length, 0) > 300) {
    ctx.addIssue({ code: 'custom', message: 'A course can have at most 300 lessons' })
  }
  if (content.price.amount > 0 && content.price.amount < 100) ctx.addIssue({ code: 'custom', message: 'Paid courses start at 100 minor units' })
})

export type CourseContent = z.infer<typeof courseContentSchema>
export type CourseLesson = z.infer<typeof lessonSchema>
export const createCourseSchema = z.object({ slug: courseSlugSchema, content: courseContentSchema }).strict()
export const saveCourseSchema = z.object({ version: z.number().int().min(1), content: courseContentSchema }).strict()
export const versionSchema = z.object({ version: z.number().int().min(1) }).strict()
export const sellerSchema = z.object({
  slug: courseSlugSchema.refine(value => !['api', 'admin', 'courses', 'creator', 'app', 'www', 'support', 'library', 'login', 'signup', 'dashboard', 'connect', 'seller', 'balance'].includes(value), 'This seller URL is reserved'),
  country: z.enum(['US', 'DE', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH', 'NO']),
  bio: z.string().max(5000).default(''),
  supportEmail: z.email(),
}).strict()
export const uploadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), title: z.string().trim().min(1).max(160), contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']), sizeBytes: z.number().int().positive().max(5 * 1024 ** 3), durationSeconds: z.number().int().positive().max(7200) }).strict(),
  z.object({ kind: z.literal('resource'), title: z.string().trim().min(1).max(160), contentType: z.enum(['application/pdf', 'text/plain', 'image/png', 'image/jpeg']), sizeBytes: z.number().int().positive().max(100 * 1024 ** 2) }).strict(),
])
export const progressSchema = z.object({
  positionSeconds: z.number().int().min(0).max(7200), completed: z.boolean(),
  watchedRanges: z.array(z.tuple([z.number().finite().min(0).max(7200), z.number().finite().min(0).max(7200)]).refine(([start, end]) => end > start, 'Invalid watch range')).max(1000).default([]),
}).strict()
export const refundSchema = z.object({ amount: z.number().int().positive().optional() }).strict()
export const reviewSchema = z.object({ version: z.number().int().min(1), decision: z.enum(['approve', 'reject']), note: z.string().trim().max(5000).default('') }).strict()
export const sellerDecisionSchema = z.object({ status: z.enum(['enabled', 'suspended', 'pending']) }).strict()

export function lessonsOf(content: CourseContent) { return content.sections.flatMap(section => section.lessons) }
export function assetIdsOf(content: CourseContent) {
  return [...new Set(lessonsOf(content).flatMap(lesson => [...lesson.resourceAssetIds, ...(lesson.videoAssetId ? [lesson.videoAssetId] : [])]))]
}

// Public curriculum never includes lesson bodies or provider/storage identifiers.
export function publicCourseContent(content: CourseContent) {
  return { ...content, sections: content.sections.map(section => ({ id: section.id, title: section.title, lessons: section.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, kind: lesson.kind, preview: lesson.preview })) })) }
}

export function validatePublication(content: CourseContent) {
  const lessons = lessonsOf(content)
  if (!content.summary || !content.description || !content.refundPolicy || !lessons.length) throw new Error('Summary, description, refund policy, and at least one lesson are required')
  if (content.sections.some(section => !section.lessons.length)) throw new Error('Published sections must contain lessons')
  if (lessons.some(lesson => lesson.kind === 'video' ? !lesson.videoAssetId : !lesson.body.trim())) throw new Error('Every lesson needs its content')
}

export type PublicCourseContent = ReturnType<typeof publicCourseContent>
