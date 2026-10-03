import { useState, type ReactNode, type ComponentType } from 'react'
import Image from 'next/image'
import { Check, ChevronDown, FileText, Play } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { CourseContent, CourseLesson } from '@/lib/courses/validation'

export type OutlineRowProps = {
  lesson: CourseLesson
  className: string
  children: ReactNode
}
function EmptyChapter() {
  return <p className="c-outline-empty">Add your first lesson.</p>
}
function StaticRow({ className, children }: OutlineRowProps) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function CourseOutline({
  content,
  selected,
  onSelect,
  completed = [],
  sectionActions,
  lessonActions,
  thumbnail,
  LessonRow = StaticRow,
  EmptySection = EmptyChapter,
}: {
  content: CourseContent
  selected?: string
  onSelect: (id: string) => void
  completed?: string[]
  thumbnail?: (lesson: CourseLesson) => string | undefined
  LessonRow?: ComponentType<OutlineRowProps>
  EmptySection?: ComponentType<{ sectionId: string }>
  sectionActions?: (sectionId: string, index: number) => ReactNode
  lessonActions?: (
    sectionId: string,
    lesson: CourseLesson,
    index: number,
  ) => ReactNode
}) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const completedIds = new Set(completed)
  return (
    <div className="c-outline">
      <AnimatePresence initial={false}>
        {content.sections.map((section, sectionIndex) => (
          <motion.section
            layout="position"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="c-outline-section"
            key={section.id}
          >
            <div className="c-outline-section-heading">
              <button
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(section.id)
                      ? current.filter((id) => id !== section.id)
                      : [...current, section.id],
                  )
                }
                aria-expanded={!collapsed.includes(section.id)}
                aria-controls={`chapter-${section.id}`}
              >
                <span className="c-outline-number">
                  {String(sectionIndex + 1).padStart(2, '0')}
                </span>
                <strong>{section.title}</strong>
                <ChevronDown
                  size={14}
                  className={
                    collapsed.includes(section.id) ? 'is-collapsed' : ''
                  }
                />
              </button>
              {sectionActions?.(section.id, sectionIndex)}
            </div>
            {!collapsed.includes(section.id) && (
              <div id={`chapter-${section.id}`} className="c-outline-lessons">
                <AnimatePresence initial={false}>
                  {section.lessons.map((lesson, index) => {
                    const image =
                      lesson.kind === 'video' ? thumbnail?.(lesson) : undefined
                    const isComplete = completedIds.has(lesson.id)
                    return (
                      <LessonRow
                        lesson={lesson}
                        key={lesson.id}
                        className={`c-outline-row ${selected === lesson.id ? 'is-selected' : ''}`}
                      >
                        <button
                          onClick={() => onSelect(lesson.id)}
                          aria-current={
                            selected === lesson.id ? 'step' : undefined
                          }
                          className="c-outline-lesson"
                        >
                          <span
                            className={`c-outline-lesson-icon ${image ? 'has-thumbnail' : ''} ${isComplete ? 'is-complete' : ''}`}
                          >
                            {image && (
                              <Image
                                src={image}
                                alt=""
                                fill
                                sizes="48px"
                                unoptimized={image.startsWith('blob:') || image.startsWith('/api/')}
                              />
                            )}
                            {isComplete ? (
                              <Check size={15} />
                            ) : lesson.kind === 'text' ? (
                              <FileText size={15} />
                            ) : !image ? (
                              <Play size={13} />
                            ) : null}
                          </span>
                          <span>
                            <strong title={lesson.title}>{lesson.title}</strong>
                            <small>
                              {lesson.kind === 'text'
                                ? 'Reading'
                                : 'Video lesson'}
                              {lesson.preview ? ' · Preview' : ''}
                            </small>
                          </span>
                        </button>
                        {lessonActions?.(section.id, lesson, index)}
                      </LessonRow>
                    )
                  })}
                </AnimatePresence>
                {!section.lessons.length && (
                  <EmptySection sectionId={section.id} />
                )}
              </div>
            )}
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}
