import { CourseSignIn } from '@/components/courses/course-sign-in'
import { coursePageProps } from '@/lib/courses/pages'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { useCourseDraft } from '@/lib/courses/use-course-draft'
import { courseRequest, creatorCoursePath, type CourseRecord, type CourseAsset, type CourseSeller } from '@/lib/courses/client'
import { LessonMedia } from '@/components/courses/lesson-media'
import { StripeConnection } from '@/components/courses/stripe-connection'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Eye,
  FileText,
  ImagePlus,
  List,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CourseImage,
  CourseLayout,
  EmptyCourse,
} from '@/components/courses/course-ui'
import { CourseOutline } from '@/components/courses/course-outline'
import {
  SortableLessonRow,
  EmptyChapterDrop,
  SortableOutline,
} from '@/components/courses/sortable-outline'
import { reorderLesson } from '@/lib/courses/reorder'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  courseLessons,
  makeLesson,
  type DemoCourse,
} from '@/lib/courses/demo'
import type { CourseContent, CourseLesson } from '@/lib/courses/validation'
import {
  courseCategoryIds,
  courseCategoryLabel,
} from '@/lib/courses/categories'

const LessonEditor = dynamic(
  () => import('@/components/courses/lesson-editor'),
  {
    ssr: false,
    loading: () => <p className="c-field-hint">Loading editor…</p>,
  },
)
const MarkdownContent = dynamic(
  () => import('@/components/courses/markdown-content'),
)
const tabs = ['Curriculum', 'Details', 'Pricing'] as const
type Tab = (typeof tabs)[number]

function CourseBuilder({ record, seller, sellerChanged }: { record: CourseRecord; seller: CourseSeller; sellerChanged: () => void }) {
  const router = useRouter()
  const { content, update, saveState, ready, error, flush } = useCourseDraft(record)
  const assets = useSWR<CourseAsset[]>(`${creatorCoursePath(record.id)}/assets`, courseRequest, { refreshInterval: rows => rows?.some(asset => asset.state === 'processing') ? 10_000 : 0 })
  const [submitting, setSubmitting] = useState(false)
  const course: DemoCourse = { id: record.id, slug: record.slug, handle: seller.slug, creator: seller.slug, image: content.coverUrl || '/courses/placeholder.svg', avatar: '/courses/placeholder.svg', label: 'COURSE', duration: '', content }
  const submit = async () => {
    setSubmitting(true)
    try { const version = await flush(); await courseRequest(`${creatorCoursePath(record.id)}/submit`, 'POST', { version }); toast.success('Course submitted for review') }
    catch (error) { toast.error((error as Error).message) } finally { setSubmitting(false) }
  }
  const leave = async (path: string) => {
    try { await flush(); await router.push(path) } catch (error) { toast.error((error as Error).message) }
  }
  const [tab, setTab] = useState<Tab>('Curriculum')
  const [selectedId, setSelectedId] = useState('')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [editingChapter, setEditingChapter] = useState<string | null>(null)
  const titleInput = useRef<HTMLTextAreaElement>(null)
  const selected =
    courseLessons(content).find((lesson) => lesson.id === selectedId) ||
    courseLessons(content)[0]
  const chapter = content.sections.find((section) =>
    section.lessons.some((lesson) => lesson.id === selected?.id),
  )
  const modalChapter = content.sections.find(
    (section) => section.id === editingChapter,
  )

  useEffect(() => {
    const input = titleInput.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [selected?.id, selected?.title, tab, preview])

  const patchLesson = (patch: Partial<CourseLesson>) => {
    if (!selected) return
    update((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) =>
          lesson.id === selected.id ? { ...lesson, ...patch } : lesson,
        ),
      })),
    }))
  }
  const select = (id: string) => {
    setSelectedId(id)
    setTab('Curriculum')
    setPreview(false)
    setOutlineOpen(false)
  }
  const addLesson = (sectionId: string) => {
    if (
      courseLessons(content).length >= 300 ||
      (content.sections.find((section) => section.id === sectionId)?.lessons
        .length ?? 0) >= 100
    )
      return toast.error('This chapter has reached its lesson limit.')
    const lesson = makeLesson()
    update((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, lessons: [...section.lessons, lesson] }
          : section,
      ),
    }))
    select(lesson.id)
  }
  const addChapter = () => {
    if (content.sections.length >= 30)
      return toast.error('You can add up to 30 chapters.')
    if (courseLessons(content).length >= 300)
      return toast.error('You can add up to 300 lessons.')
    const lesson = makeLesson()
    update((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          id: crypto.randomUUID(),
          title: `Chapter ${current.sections.length + 1}`,
          lessons: [lesson],
        },
      ],
    }))
    select(lesson.id)
  }
  const relocateLesson = (lessonId: string, targetId: string) => {
    // Pin the currently displayed lesson before changing the default first row.
    if (selected) setSelectedId(selected.id)
    update((current) => reorderLesson(current, lessonId, targetId))
  }
  const moveLesson = (sectionId: string, index: number, direction: number) => {
    const lessons = content.sections.find(
      (section) => section.id === sectionId,
    )?.lessons
    if (lessons?.[index + direction])
      relocateLesson(lessons[index].id, lessons[index + direction].id)
  }
  const removeLesson = (
    sectionId: string,
    lesson: CourseLesson,
    index: number,
  ) => {
    update((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lessons: section.lessons.filter((item) => item.id !== lesson.id),
            }
          : section,
      ),
    }))
    toast('Lesson removed', {
      action: {
        label: 'Undo',
        onClick: () =>
          update((current) => ({
            ...current,
            sections: current.sections.map((section) => {
              if (
                section.id !== sectionId ||
                section.lessons.some((item) => item.id === lesson.id)
              )
                return section
              const lessons = [...section.lessons]
              lessons.splice(index, 0, lesson)
              return { ...section, lessons }
            }),
          })),
      },
    })
  }
  const removeChapter = () => {
    if (!modalChapter) return
    const removed = modalChapter,
      index = content.sections.indexOf(removed)
    update((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== removed.id),
    }))
    setEditingChapter(null)
    toast('Chapter removed', {
      action: {
        label: 'Undo',
        onClick: () =>
          update((current) => {
            if (current.sections.some((section) => section.id === removed.id))
              return current
            const sections = [...current.sections]
            sections.splice(index, 0, removed)
            return { ...current, sections }
          }),
      },
    })
  }

  return (
    <CourseLayout title="Course builder" studio onNavigate={leave}>
      <div className="c-workspace-bar c-builder-bar">
        <Link href="/creator/courses" className="c-back-link" onClick={event => { event.preventDefault(); void leave("/creator/courses") }}>
          <ArrowLeft size={16} />
          <span>{content.title}</span>
        </Link>
        <div className="c-builder-top-actions">
          <span
            className={`c-save-status ${saveState === 'error' ? 'is-error' : ''}`}
            role="status"
          >
            {saveState === 'saving' ? (
              <Loader2 size={14} className="c-spin" />
            ) : saveState === 'saved' ? (
              <Check size={14} />
            ) : null}
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'error'
                ? 'Draft not saved'
                : 'Saved'}
          </span>
          <Link href={`/courses/learn/${course.id}?draft=true`} className="c-button c-button-light" onClick={event => { event.preventDefault(); void leave(`/courses/learn/${course.id}?draft=true`) }}>
            <Eye size={15} />
            <span>Preview course</span>
          </Link>
          <button className="c-button c-button-dark" disabled={submitting || saveState === "error"} onClick={() => void submit()}>{submitting ? "Submitting…" : "Submit for review"}</button>
          <button
            className="c-icon-button c-mobile-outline"
            onClick={() => setOutlineOpen(!outlineOpen)}
            aria-label={outlineOpen ? 'Close outline' : 'Show outline'}
            aria-expanded={outlineOpen}
          >
            {outlineOpen ? <X size={18} /> : <List size={18} />}
          </button>
        </div>
      </div>
      <div className="c-workspace c-builder-workspace">
        <aside
          className={`c-workspace-sidebar ${outlineOpen ? 'is-open' : ''}`}
        >
          <div className="c-builder-sidebar-heading">
            <span className="c-eyebrow">YOUR COURSE</span>
            <h2 title={content.title}>{content.title}</h2>
            <p>
              {content.sections.length} chapters ·{' '}
              {courseLessons(content).length} lessons
            </p>
          </div>
          <SortableOutline
            ids={content.sections.flatMap(section => section.lessons.length ? section.lessons.map(lesson => lesson.id) : [section.id])}
            onMove={relocateLesson}
          >
            <CourseOutline
              content={content}
              LessonRow={SortableLessonRow}
              EmptySection={EmptyChapterDrop}
              thumbnail={(lesson) =>
                lesson.videoAssetId && assets.data?.some(asset => asset.id === lesson.videoAssetId && asset.state === "ready") ? `${creatorCoursePath(record.id)}/assets/${lesson.videoAssetId}/thumbnail` : undefined
              }
              selected={tab === 'Curriculum' ? selected?.id : undefined}
              onSelect={select}
              sectionActions={(sectionId) => (
                <div className="c-outline-actions">
                  <button
                    className="c-small-icon"
                    onClick={() => addLesson(sectionId)}
                    aria-label="Add lesson to chapter"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    className="c-small-icon"
                    onClick={() => setEditingChapter(sectionId)}
                    aria-label="Edit chapter"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              )}
              lessonActions={(sectionId, lesson, index) => (
                <div className="c-outline-row-actions">
                  <button
                    className="c-small-icon"
                    disabled={index === 0}
                    onClick={() => moveLesson(sectionId, index, -1)}
                    aria-label={`Move ${lesson.title} up`}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    className="c-small-icon"
                    disabled={
                      index ===
                      (content.sections.find(
                        (section) => section.id === sectionId,
                      )?.lessons.length ?? 0) -
                        1
                    }
                    onClick={() => moveLesson(sectionId, index, 1)}
                    aria-label={`Move ${lesson.title} down`}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    className="c-small-icon"
                    onClick={() => removeLesson(sectionId, lesson, index)}
                    aria-label={`Delete ${lesson.title}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            />
          </SortableOutline>
          <button
            className="c-add-chapter"
            onClick={addChapter}
            disabled={!ready}
          >
            <Plus size={17} />
            Add chapter
          </button>
        </aside>
        <div className="c-workspace-canvas c-builder-canvas">
          {error && <p role="alert" className="c-save-error">{error} <button className="c-text-link" onClick={() => void flush().catch(() => {})}>Retry save</button></p>}
          {assets.error && <p role="alert">{assets.error.message}</p>}
          <div
            className="c-editor-tabs"
            role="tablist"
            aria-label="Course editor"
          >
            {tabs.map((item) => (
              <button
                role="tab"
                id={`tab-${item}`}
                aria-controls={`panel-${item}`}
                aria-selected={tab === item}
                tabIndex={tab === item ? 0 : -1}
                key={item}
                onClick={() => setTab(item)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault()
                    const next =
                      tabs[
                        (tabs.indexOf(item) +
                          (event.key === 'ArrowRight' ? 1 : 2)) %
                          tabs.length
                      ]
                    setTab(next)
                    document.getElementById(`tab-${next}`)?.focus()
                  }
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="c-draft-notice">
            Changes are saved to your course draft.
          </div>
          {saveState === 'error' && (
            <div className="c-save-error" role="alert">
              This draft could not be saved. Check required titles, price, and
              browser storage.
              <button onClick={() => update({ ...content })}>Retry save</button>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              key={tab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {tab === 'Curriculum' ? (
                selected ? (
                  <div className="c-editor-lesson">
                    <div className="c-editor-lesson-heading">
                      <span className="c-eyebrow">{chapter?.title}</span>
                      <button
                        className={`c-text-link ${preview ? 'is-active' : ''}`}
                        onClick={() => setPreview(!preview)}
                      >
                        <Eye size={15} />
                        {preview ? 'Back to editing' : 'Preview lesson'}
                      </button>
                    </div>
                    {preview ? (
                      <h1>{selected.title}</h1>
                    ) : (
                      <textarea
                        ref={titleInput}
                        rows={1}
                        className="c-title-input"
                        aria-label="Lesson title"
                        maxLength={160}
                        value={selected.title}
                        onChange={(event) =>
                          patchLesson({ title: event.target.value })
                        }
                        placeholder="Give your lesson a title"
                      />
                    )}
                    {!preview && (
                      <div className="c-lesson-format">
                        <button
                          className={
                            selected.kind === 'video' ? 'is-active' : ''
                          }
                          onClick={() => patchLesson({ kind: 'video' })}
                        >
                          <Upload size={14} />
                          Video lesson
                        </button>
                        <button
                          className={
                            selected.kind === 'text' ? 'is-active' : ''
                          }
                          onClick={() =>
                            patchLesson({ kind: 'text', videoAssetId: null })
                          }
                        >
                          <FileText size={14} />
                          Written lesson
                        </button>
                      </div>
                    )}
                    {selected.kind === 'video' && <LessonMedia key={`${selected.id}-video`} courseId={record.id} lesson={selected} assets={assets.data || []} kind="video" preview={preview} patch={patchLesson} flush={flush} changed={() => assets.mutate()} />}
                    {preview ? (
                      <div className="c-lesson-reading">
                        {selected.body ? (
                          <MarkdownContent body={selected.body} />
                        ) : (
                          <p>No lesson notes yet.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="c-field c-lesson-notes">
                          <span>
                            {selected.kind === 'text'
                              ? 'Lesson content'
                              : 'Lesson notes'}
                          </span>
                          <LessonEditor
                            key={selected.id}
                            body={selected.body}
                            onChange={(body) => patchLesson({ body })}
                          />
                        </div>
                        <div className="c-editor-support">
                          <div>
                            <h3>Resources</h3>
                            <p>Files students can download.</p>

                          </div>
                          <label className="c-preview-toggle">
                            <div>
                              <h3>Free lesson preview</h3>
                              <p>Let people get a feel for your course.</p>
                            </div>
                            <input
                              type="checkbox"
                              role="switch"
                              checked={selected.preview}
                              onChange={(event) =>
                                patchLesson({ preview: event.target.checked })
                              }
                            />
                            <span className="c-switch" aria-hidden="true" />
                          </label>
                        </div>
                      </>
                    )}
                    <LessonMedia key={`${selected.id}-resources`} courseId={record.id} lesson={selected} assets={assets.data || []} kind="resource" preview={preview} patch={patchLesson} flush={flush} changed={() => assets.mutate()} />
                  </div>
                ) : (
                  <EmptyCourse>
                    <h2>Every course starts with an idea.</h2>
                    <p>Add your first chapter and give it a place to grow.</p>
                    <button
                      className="c-button c-button-dark"
                      onClick={addChapter}
                    >
                      <Plus size={16} />
                      Add chapter
                    </button>
                  </EmptyCourse>
                )
              ) : tab === 'Details' ? (
                <CourseDetails
                  content={content}
                  update={update}
                  course={course}
                />
              ) : (
                <><CoursePricing content={content} update={update} /><StripeConnection seller={seller} changed={sellerChanged} /></>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Dialog
        open={!!modalChapter}
        onOpenChange={(open) => {
          if (!open) setEditingChapter(null)
        }}
      >
        <DialogContent className="c-preview-dialog">
          <DialogTitle>Shape this chapter.</DialogTitle>
          <DialogDescription>
            A clear title helps students find their way.
          </DialogDescription>
          {modalChapter && (
            <>
              <label className="c-field">
                <span>Chapter title</span>
                <input
                  maxLength={160}
                  value={modalChapter.title}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      sections: current.sections.map((section) =>
                        section.id === modalChapter.id
                          ? { ...section, title: event.target.value }
                          : section,
                      ),
                    }))
                  }
                />
              </label>
              <div className="c-dialog-actions">
                <button className="c-text-link" onClick={removeChapter}>
                  <Trash2 size={15} />
                  Delete chapter
                </button>
                <button
                  className="c-button c-button-dark"
                  onClick={() => setEditingChapter(null)}
                >
                  Done <Check size={15} />
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </CourseLayout>
  )
}

function CourseDetails({
  content,
  update,
  course,
}: {
  content: CourseContent
  update: (
    next: CourseContent | ((current: CourseContent) => CourseContent),
  ) => void
  course: DemoCourse
}) {
  const patch = (values: Partial<CourseContent>) =>
    update((current) => ({ ...current, ...values }))
  return (
    <div className="c-details-editor">
      <span className="c-eyebrow">THE FIRST IMPRESSION</span>
      <h1>Tell your story.</h1>
      <p className="c-editor-intro">A clear introduction. A reason to begin.</p>
      <label className="c-field">
        <span>Course title</span>
        <input
          value={content.title}
          maxLength={160}
          onChange={(event) => patch({ title: event.target.value })}
        />
      </label>
      <label className="c-field">
        <span>A short introduction</span>
        <textarea
          rows={2}
          value={content.summary}
          maxLength={500}
          onChange={(event) => patch({ summary: event.target.value })}
          placeholder="What makes this course worth exploring?"
        />
      </label>
      <label className="c-field">
        <span>The full story</span>
        <textarea
          rows={5}
          value={content.description}
          maxLength={20_000}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      <div className="c-fields-row">
        <label className="c-field">
          <span>Category</span>
          <select
            value={content.category}
            onChange={(event) =>
              patch({
                category: event.target.value as CourseContent['category'],
              })
            }
          >
            {Array.from(new Set([...courseCategoryIds, content.category])).map(
              (category) => (
                <option key={category} value={category}>
                  {courseCategoryLabel(category)}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="c-field">
          <span>Language</span>
          <select
            value={content.language}
            onChange={(event) =>
              patch({
                language: event.target.value as CourseContent['language'],
              })
            }
          >
            {Object.entries({
              en: 'English',
              de: 'German',
              fr: 'French',
              es: 'Spanish',
              it: 'Italian',
              pt: 'Portuguese',
              nl: 'Dutch',
            }).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="c-field"><span>What students will learn</span>{content.outcomes.map((outcome, index) => <div className="c-fields-row" key={index}><input aria-label={`Learning outcome ${index + 1}`} value={outcome} maxLength={300} onChange={event => patch({ outcomes: content.outcomes.map((value, i) => i === index ? event.target.value : value) })} /><button className="c-text-link" onClick={() => patch({ outcomes: content.outcomes.filter((_, i) => i !== index) })}>Remove</button></div>)}<button className="c-text-link" disabled={content.outcomes.length >= 20} onClick={() => patch({ outcomes: [...content.outcomes, 'New learning outcome'] })}><Plus size={15} />Add outcome</button></div>
      <div className="c-cover-preview">
        <CourseImage course={course} sizes="60vw" />
        <div className="c-player-fade" />
        <span>
          <ImagePlus size={17} />
          Course cover
        </span>
      </div>
      <label className="c-field"><span>Cover image URL</span><input type="url" value={content.coverUrl || ''} placeholder="https://…" onChange={event => patch({ coverUrl: event.target.value || null })} /><small className="c-field-hint">Use a public HTTPS image for your course cover. Lesson attachments stay private.</small></label>
    </div>
  )
}

function CoursePricing({
  content,
  update,
}: {
  content: CourseContent
  update: (
    next: CourseContent | ((current: CourseContent) => CourseContent),
  ) => void
}) {
  const patch = (values: Partial<CourseContent['price']>) =>
    update((current) => ({
      ...current,
      price: { ...current.price, ...values },
    }))
  return (
    <div className="c-pricing-editor">
      <span className="c-eyebrow">PRICING</span>
      <h1>Course price</h1>
      <label className="c-price-display">
        <div>
          <span aria-hidden="true">
            {content.price.currency === 'eur' ? '€' : '$'}
          </span>
          <input
            aria-label="Course price"
            type="number"
            min="0"
            max="10000"
            step="0.01"
            defaultValue={(content.price.amount / 100).toFixed(2)}
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid)
                patch({ amount: Math.round(Number(event.target.value) * 100) })
            }}
            onBlur={(event) => {
              event.target.value = (content.price.amount / 100).toFixed(2)
            }}
          />
        </div>
        <span>one-time purchase · click to edit</span>
      </label>
      <div className="c-fields-row">
        <label className="c-field">
          <span>Currency</span>
          <select
            value={content.price.currency}
            onChange={(event) =>
              patch({ currency: event.target.value as 'usd' | 'eur' })
            }
          >
            <option value="usd">USD · US Dollar</option>
            <option value="eur">EUR · Euro</option>
          </select>
        </label>
        <label className="c-field">
          <span>Access period, in days</span>
          <input
            type="number"
            min="1"
            max="3650"
            value={content.price.accessDays}
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid)
                patch({ accessDays: Number(event.target.value) })
            }}
          />
          <small>Counted from enrollment.</small>
        </label>
      </div>
      <label className="c-field">
        <span>Refund policy</span>
        <textarea
          rows={4}
          maxLength={5000}
          value={content.refundPolicy}
          onChange={(event) =>
            update((current) => ({
              ...current,
              refundPolicy: event.target.value,
            }))
          }
        />
      </label>

    </div>
  )
}

export default function CourseBuilderPage() {
  const router = useRouter(), { status } = useSession()
  const id = typeof router.query.id === 'string' ? router.query.id : ''
  const valid = /^[a-f0-9-]{36}$/i.test(id)
  const record = useSWR<CourseRecord>(status === 'authenticated' && valid ? creatorCoursePath(id) : null, courseRequest, { revalidateOnFocus: false, shouldRetryOnError: false })
  const seller = useSWR<CourseSeller>(status === 'authenticated' && valid ? '/api/creator/courses/seller' : null, courseRequest)
  if (status === 'unauthenticated') return <CourseLayout studio><EmptyCourse><h1>Sign in to edit your course</h1><CourseSignIn /></EmptyCourse></CourseLayout>
  if (record.error || seller.error || (router.isReady && !valid)) return <CourseLayout studio><EmptyCourse><h1>{record.error?.message || seller.error?.message || 'Choose a course from your studio'}</h1><Link href="/creator/courses">Back to studio</Link></EmptyCourse></CourseLayout>
  if (!record.data || !seller.data) return <CourseLayout studio><div className="c-loading">Opening your studio…</div></CourseLayout>
  return <CourseBuilder key={record.data.id} record={record.data} seller={seller.data} sellerChanged={() => void seller.mutate()} />
}
export const getServerSideProps = coursePageProps
