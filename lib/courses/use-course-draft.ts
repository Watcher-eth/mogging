import { useEffect, useState } from 'react'
import { courseRequest, creatorCoursePath, type CourseRecord } from './client'
import { createDraftWriter, type DraftState } from './draft-writer'

export function useCourseDraft(course: CourseRecord) {
  const [draft, setDraft] = useState<{ content: CourseRecord['draft']; saveState: DraftState; error?: string }>({ content: course.draft, saveState: 'saved' })
  const [writer] = useState(() => createDraftWriter(course,
    (version, content) => courseRequest<CourseRecord>(creatorCoursePath(course.id), 'PUT', { version, content }),
    (content, saveState, error) => setDraft({ content, saveState, error }),
  ))
  useEffect(() => {
    if (draft.saveState !== 'saving') return
    const timer = setTimeout(() => { void writer.flush().catch(() => {}) }, 700)
    return () => clearTimeout(timer)
  }, [draft.content, draft.saveState, writer])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (writer.dirty()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      // Route changes can unmount before the debounce fires; the writer still owns this save.
      if (writer.dirty()) void writer.flush().catch(() => {})
    }
  }, [writer])
  return { ...draft, update: writer.update, flush: writer.flush, ready: true }
}
