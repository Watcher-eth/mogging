import { coursePreviewProps } from '@/lib/courses/preview'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, List, X } from 'lucide-react'
import { motion } from 'motion/react'
import { CourseLayout, EmptyCourse } from '@/components/courses/course-ui'
import { CourseOutline } from '@/components/courses/course-outline'
import dynamic from 'next/dynamic'
import {
  courseHref,
  courseLessons,
  type DemoCourse,
} from '@/lib/courses/demo'
import useSWR from 'swr'
import { courseRequest, type CourseRecord } from '@/lib/courses/client'
import { courseView, type CourseOverview } from '@/lib/courses/view'
import { BunnyPlayer } from '@/components/courses/bunny-player'
import { toast } from 'sonner'
import type { WatchRange } from '@/lib/courses/watch-progress'
const MarkdownContent = dynamic(
  () => import('@/components/courses/markdown-content'),
)

function CoursePlayer({ course, draft = false }: { course: DemoCourse; draft?: boolean }) {
  const router = useRouter()
  const content = course.content
  const stored = useSWR<{ progress: { lessonId: string; completed: boolean; positionSeconds: number; watchedRanges: WatchRange[]; videoAssetId: string | null }[] }>(draft ? null : `/api/courses/${course.id}`, courseRequest, { shouldRetryOnError: false })
  const { data: savedProgress, error: progressError, mutate: refreshProgress } = stored
  const completed = stored.data?.progress.filter(row => row.completed).map(row => row.lessonId) || []
  const count = completed.length
  const complete = useCallback(async (id: string, positionSeconds = 0, done = true, watchedRanges: WatchRange[] = []) => {
    if (draft || progressError || !savedProgress) return
    try {
      await courseRequest(`/api/courses/${course.id}/lessons/${id}/progress`, 'PUT', { positionSeconds, completed: done, watchedRanges })
      await refreshProgress()
    } catch (error) { toast.error(`Progress could not be saved: ${(error as Error).message}`) }
  }, [course.id, draft, progressError, savedProgress, refreshProgress])
  const progress = { completed, count, percent: courseLessons(content).length ? Math.round(count / courseLessons(content).length * 100) : 0 }
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [renderedLesson, setRenderedLesson] = useState('')
  const readingEnd = useRef<HTMLDivElement>(null)
  const lessons = courseLessons(content)
  const selected =
    lessons.find((lesson) => lesson.id === router.query.lesson) || lessons[0]
  const chapter = content.sections.find((section) =>
    section.lessons.some((lesson) => lesson.id === selected?.id),
  )
  const index = lessons.findIndex((lesson) => lesson.id === selected?.id)
  const lessonId = selected?.id
  const lessonKind = selected?.kind
  const lessonCompleted = completed.includes(lessonId || '')
  const lessonPath = selected ? `/api/courses/${course.id}/lessons/${selected.id}` : null
  const lesson = useSWR<{ id: string; title: string; body: string; kind: 'video' | 'text'; assets: { id: string; kind: 'video' | 'resource'; title: string }[] }>(lessonPath ? `${lessonPath}${draft ? '?draft=true' : ''}` : null, courseRequest, { shouldRetryOnError: false })
  const video = lesson.data?.assets.find(asset => asset.kind === 'video')
  const playback = useSWR<{ url: string }>(lessonPath && video ? `${lessonPath}/assets/${video.id}${draft ? '?draft=true' : ''}` : null, courseRequest, { refreshInterval: 12 * 60_000, revalidateOnFocus: false })
  const download = async (id: string) => {
    try { const result = await courseRequest<{ url: string }>(`${lessonPath}/assets/${id}${draft ? '?draft=true' : ''}`); window.location.assign(result.url) }
    catch (error) { toast.error((error as Error).message) }
  }
  const documentReady = useCallback(
    () => setRenderedLesson(lessonId || ''),
    [lessonId],
  )
  useEffect(() => {
    if (
      renderedLesson !== lessonId ||
      lessonKind !== 'text' ||
      lessonCompleted ||
      !lessonId ||
      !readingEnd.current
    )
      return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          complete(lessonId)
          observer.disconnect()
        }
      },
      { threshold: 1 },
    )
    observer.observe(readingEnd.current)
    return () => observer.disconnect()
  }, [lessonId, lessonKind, lessonCompleted, complete, renderedLesson])
  const select = (id: string) => {
    void router.replace(
      { pathname: router.pathname, query: { id: course.id, lesson: id, ...(draft ? { draft: 'true' } : {}) } },
      undefined,
      { shallow: true, scroll: false },
    )
    setOutlineOpen(false)
  }

  return (
    <CourseLayout title={content.title}>
      <div className="c-workspace-bar">
        <Link href={draft ? `/creator/courses/${course.id}` : courseHref(course)} className="c-back-link">
          <ArrowLeft size={16} />
          <span>{content.title}</span>
        </Link>
        <span className="c-status">{draft ? "Draft preview" : ""}</span>
        <button
          onClick={() => setOutlineOpen(!outlineOpen)}
          className="c-icon-button c-mobile-outline"
          aria-label={outlineOpen ? 'Close lessons' : 'Show lessons'}
          aria-expanded={outlineOpen}
        >
          {outlineOpen ? <X size={18} /> : <List size={18} />}
        </button>
      </div>
      <div className="c-workspace c-learning-workspace">
        <aside
          className={`c-workspace-sidebar ${outlineOpen ? 'is-open' : ''}`}
        >
          <div className="c-learning-progress">
            <span className="c-eyebrow">YOUR PROGRESS</span>
            <div>
              <strong>{progress.percent}%</strong>
              <span>
                {progress.count} of {lessons.length} lessons
              </span>
            </div>
            <progress
              value={progress.percent}
              max={100}
              aria-label="Course completion"
            />
            {progressError && (
              <small>Enroll to save your progress.</small>
            )}
          </div>
          <CourseOutline
            thumbnail={item => draft || stored.data || item.preview ? `/api/courses/${course.id}/lessons/${item.id}/thumbnail${draft ? "?draft=true" : ""}` : undefined}
            content={content}
            selected={selected?.id}
            onSelect={select}
            completed={progress.completed}
          />
        </aside>
        <div className="c-workspace-canvas">
          {selected ? (
            <motion.article
              key={selected.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="c-lesson-canvas"
            >
              <span className="c-eyebrow">
                {chapter?.title} <span> / </span> LESSON {index + 1}
              </span>
              <h1>{selected.title}</h1>
              {lesson.error ? <div className="c-lesson-reading" role="alert"><p>{lesson.error.message}</p>{!draft && <Link className="c-button c-button-dark" href={courseHref(course)}>View course and enroll</Link>}</div> : !lesson.data ? <p className="c-muted">Loading lesson…</p> : <>
              {selected.kind === 'video' && (playback.data ? <BunnyPlayer key={selected.id} url={playback.data.url} title={selected.title} position={stored.data?.progress.find(row => row.lessonId === selected.id)?.positionSeconds || 0} watchedRanges={stored.data?.progress.find(row => row.lessonId === selected.id && row.videoAssetId === video?.id)?.watchedRanges || []} onProgress={(position, done, ranges) => void complete(selected.id, position, done, ranges)} /> : <p className="c-muted">{playback.error?.message || 'Video is not ready yet.'}</p>)}
              <div className="c-lesson-reading">
                {lesson.data.body ? (
                  <MarkdownContent
                    key={selected.id}
                    body={lesson.data.body}
                    onReady={documentReady}
                  />
                ) : (
                  <p>Your lesson notes will appear here.</p>
                )}
              </div>
              {selected.kind === 'text' && (
                <div ref={readingEnd} className="c-reading-end" />
              )}
              {lesson.data.assets.some(asset => asset.kind === 'resource') && <ul className="c-attachments">{lesson.data.assets.filter(asset => asset.kind === 'resource').map(asset => <li key={asset.id}><button className="c-text-link" onClick={() => void download(asset.id)}>{asset.title}</button></li>)}</ul>}
              </>}
              <div className="c-lesson-navigation">
                <span className="c-lesson-completion" role="status">
                  {progress.completed.includes(selected.id) ? (
                    <>
                      <Check size={15} /> Completed
                    </>
                  ) : (
                    'In progress'
                  )}
                </span>
                <div>
                  <button
                    className="c-icon-button"
                    disabled={index === 0}
                    onClick={() => select(lessons[index - 1].id)}
                    aria-label="Previous lesson"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    className="c-button c-button-light"
                    disabled={index === lessons.length - 1}
                    onClick={() => select(lessons[index + 1].id)}
                  >
                    Next lesson <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </motion.article>
          ) : (
            <EmptyCourse>
              <h2>Your next chapter is coming.</h2>
              <p>Add a lesson in creator studio to preview it here.</p>
              <Link
                href={`/creator/courses/${course.id}`}
                className="c-button c-button-dark"
              >
                Open builder
              </Link>
            </EmptyCourse>
          )}
        </div>
      </div>
    </CourseLayout>
  )
}

export default function CoursePlayerPage() {
  const router = useRouter()
  const id = typeof router.query.id === 'string' ? router.query.id : ''
  const draft = router.query.draft === 'true'
  const valid = /^[a-f0-9-]{36}$/i.test(id)
  const record = useSWR<CourseOverview | CourseRecord>(router.isReady && valid ? draft ? `/api/creator/courses/${id}` : `/api/courses/${id}/overview` : null, courseRequest, { shouldRetryOnError: false, revalidateOnFocus: false })
  if (record.error || (router.isReady && !valid)) return <CourseLayout><EmptyCourse><h1>{record.error?.message || 'Choose a course from your library'}</h1><Link href="/courses/library">My learning</Link></EmptyCourse></CourseLayout>
  if (!record.data) return <CourseLayout><div className="c-loading">Loading course…</div></CourseLayout>
  const course = 'draft' in record.data ? courseView({ ...record.data, content: record.data.draft, seller: { slug: '' } }) : courseView(record.data)
  return <CoursePlayer key={`${id}-${draft}`} course={course} draft={draft} />
}
export const getServerSideProps = coursePreviewProps
