import type { CourseContent } from './validation'

export function reorderLesson(
  content: CourseContent,
  lessonId: string,
  targetId: string,
): CourseContent {
  if (lessonId === targetId) return content
  const source = content.sections.find((section) =>
    section.lessons.some((lesson) => lesson.id === lessonId),
  )
  const target = content.sections.find((section) =>
    section.id === targetId || section.lessons.some((lesson) => lesson.id === targetId),
  )
  if (!source || !target || (source !== target && target.lessons.length >= 100))
    return content
  const lesson = source.lessons.find((item) => item.id === lessonId)!
  const index = target.id === targetId ? target.lessons.length : target.lessons.findIndex((item) => item.id === targetId)
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (section !== source && section !== target) return section
      const lessons = section.lessons.filter((item) => item.id !== lessonId)
      if (section === target) lessons.splice(index, 0, lesson)
      return { ...section, lessons }
    }),
  }
}
