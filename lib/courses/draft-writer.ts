import { courseContentSchema, type CourseContent } from './validation'

export type DraftState = 'saved' | 'saving' | 'error'

// One serialized writer owns the revision. Edits arriving during a request are saved next.
export function createDraftWriter(
  initial: { draft: CourseContent; version: number },
  save: (version: number, content: CourseContent) => Promise<{ version: number }>,
  changed: (content: CourseContent, state: DraftState, error?: string) => void,
) {
  let content = initial.draft, version = initial.version, revision = 0, savedRevision = 0
  let running: Promise<number> | null = null
  const flush = (): Promise<number> => {
    if (running) return running
    if (revision === savedRevision) return Promise.resolve(version)
    running = (async () => {
      try {
        while (savedRevision < revision) {
          const snapshot = content, snapshotRevision = revision
          const parsed = courseContentSchema.safeParse(snapshot)
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Complete the required fields to save.')
          const result = await save(version, parsed.data)
          version = result.version
          savedRevision = snapshotRevision
        }
        changed(content, 'saved')
        return version
      } catch (error) {
        changed(content, 'error', error instanceof Error ? error.message : 'Draft could not be saved')
        throw error
      }
    })().finally(() => { running = null })
    return running
  }
  return {
    update(next: CourseContent | ((value: CourseContent) => CourseContent)) {
      content = typeof next === 'function' ? next(content) : next
      revision++
      changed(content, 'saving')
    },
    flush,
    dirty: () => revision !== savedRevision,
  }
}
