import type { DemoCourse } from './demo'
import type { CourseContent, PublicCourseContent } from './validation'

export type CourseOverview = { id: string; slug: string; content: PublicCourseContent; seller: { slug: string; bio?: string; supportEmail?: string } }
export function courseView(record: { id: string; slug: string; content: CourseContent | PublicCourseContent; seller: { slug: string } }): DemoCourse {
  return { id: record.id, slug: record.slug, handle: record.seller.slug, creator: record.seller.slug, image: record.content.coverUrl || '/courses/placeholder.svg', avatar: '/courses/placeholder.svg', label: 'COURSE', duration: `${record.content.price.accessDays} days access`, content: { ...record.content, sections: record.content.sections.map(section => ({ ...section, lessons: section.lessons.map(lesson => ({ body: '', videoAssetId: null, resourceAssetIds: [], ...lesson })) })) } }
}
