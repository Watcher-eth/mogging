import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { toast } from 'sonner'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { AdminPasswordGate } from '@/components/admin/admin-password-gate'
import { apiGet } from '@/lib/api/client'
import { BunnyPlayer } from '@/components/courses/bunny-player'
import { adminCoursePageProps } from '@/lib/admin/page'
import { courseRequest, CourseRequestError, type CourseRecord } from '@/lib/courses/client'
import { lessonsOf } from '@/lib/courses/validation'
const MarkdownContent = dynamic(() => import('@/components/courses/markdown-content'))
function ReviewVideo({ courseId, lessonId, assetId }: { courseId: string; lessonId: string; assetId: string }) {
  const playback = useSWR<{ url: string }>(`/api/admin/courses/${courseId}/lessons/${lessonId}/assets/${assetId}`, courseRequest)
  return playback.data ? <BunnyPlayer url={playback.data.url} title="Course review" /> : <p>{playback.error?.message || 'Loading video…'}</p>
}
function CourseReview({ course, changed }: { course: CourseRecord; changed: () => Promise<unknown> }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(lessonsOf(course.draft)[0]?.id)
  const lesson = lessonsOf(course.draft).find(item => item.id === selected)
  const review = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    try { await courseRequest(`/api/admin/courses/${course.id}/review`, 'POST', { version: course.submittedVersion, decision, note }); await changed(); toast.success(decision === 'approve' ? 'Course published' : 'Course returned to creator') }
    catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="c-details-editor"><span className="c-eyebrow">VERSION {course.submittedVersion}</span><h2>{course.draft.title}</h2><p>{course.draft.summary}</p><p>{course.draft.description}</p><p>Price: {new Intl.NumberFormat('en-US', { style: 'currency', currency: course.draft.price.currency }).format(course.draft.price.amount / 100)} · {course.draft.price.accessDays} days</p><p>Refund policy: {course.draft.refundPolicy}</p>
    <label className="c-field"><span>Review lesson</span><select value={selected} onChange={event => setSelected(event.target.value)}>{lessonsOf(course.draft).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    {lesson && <><h3>{lesson.title}</h3>{lesson.videoAssetId && <ReviewVideo courseId={course.id} lessonId={lesson.id} assetId={lesson.videoAssetId} />}<MarkdownContent body={lesson.body} />{lesson.resourceAssetIds.map(id => <ReviewResource key={id} courseId={course.id} lessonId={lesson.id} assetId={id} />)}</>}
    <label className="c-field"><span>Review note</span><textarea rows={2} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} /></label>
    <div className="c-media-actions"><button disabled={busy} className="c-button c-button-dark" onClick={() => void review('approve')}>Approve and publish</button><button disabled={busy || !note.trim()} className="c-button c-button-light" onClick={() => void review('reject')}>Return for changes</button></div>
  </section>
}
function ReviewResource({ courseId, lessonId, assetId }: { courseId: string; lessonId: string; assetId: string }) {
  const download = async () => {
    try { const result = await courseRequest<{ url: string }>(`/api/admin/courses/${courseId}/lessons/${lessonId}/assets/${assetId}`); window.location.assign(result.url) }
    catch (error) { toast.error((error as Error).message) }
  }
  return <button className="c-text-link" onClick={() => void download()}>Review attachment</button>
}
function CourseModeration({ course, changed }: { course: CourseRecord; changed: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const moderate = async (field: 'listed' | 'salesEnabled' | 'contentBlocked', value: boolean) => {
    if (field === 'contentBlocked' && value && !window.confirm('Block this course for all students, including existing purchasers?')) return
    setBusy(true)
    try { await courseRequest(`/api/admin/courses/${course.id}`, 'PATCH', { [field]: value }); await changed(); toast.success('Course settings updated') }
    catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="c-studio-course"><div className="c-studio-course-title"><h2>{course.published?.title || course.draft.title}</h2><span>{course.id}</span></div><div className="c-media-actions">{([
    ['listed', 'Listed in catalog'], ['salesEnabled', 'Accept new enrollments'], ['contentBlocked', 'Block course content'],
  ] as const).map(([field, label]) => <label key={field}><input type="checkbox" disabled={busy} checked={course[field]} onChange={event => void moderate(field, event.target.checked)} /> {label}</label>)}</div></section>
}
export default function CourseReviews() {
  const [view, setView] = useState<'review' | 'published' | 'archived'>('review'), [page, setPage] = useState(1)
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet)
  const queue = useSWR<{ items: CourseRecord[]; hasMore: boolean }>(access.data?.unlocked ? `/api/admin/courses?status=${view}&page=${page}` : null, courseRequest, { shouldRetryOnError: false })

  if (access.error) return <p role="alert" className="admin-notice">Admin access could not be verified.</p>
  if (access.isLoading) return <p className="admin-empty">Checking admin access…</p>
  if (!access.data?.unlocked || (queue.error instanceof CourseRequestError && queue.error.status === 401)) return <AdminPasswordGate onUnlocked={() => { void access.mutate(); void queue.mutate() }} />
  return <><CreatorHeader eyebrow="Manage" title="Courses" description="Review submitted lessons and manage published courses." /><div className="course-app admin-course-content"><div className="c-studio-container"><div className="c-filter-tabs">{(['review', 'published', 'archived'] as const).map(tab => <button key={tab} aria-pressed={view === tab} className={view === tab ? 'is-active' : ''} onClick={() => { setView(tab); setPage(1) }}>{tab === 'review' ? 'Awaiting review' : tab === 'published' ? 'Published' : 'Archived'}</button>)}</div>
    {queue.error ? <div role="alert"><p>{queue.error.message}</p><Link href="/admin/creators" className="c-button c-button-dark">Unlock admin access</Link></div> : !queue.data ? <p>Loading review queue…</p> : <>
      {queue.data.items.map(course => view === 'review' ? <CourseReview key={`${course.id}-${course.version}`} course={course} changed={() => queue.mutate()} /> : <CourseModeration key={course.id} course={course} changed={() => queue.mutate()} />)}
      {!queue.data.items.length && <p className="c-muted">No courses in this view.</p>}
      {(page > 1 || queue.data.hasMore) && <div className="c-media-actions"><button className="c-button c-button-light" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="c-button c-button-light" disabled={!queue.data.hasMore} onClick={() => setPage(page + 1)}>Next</button></div>}
    </>}
  </div></div></>
}
export const getServerSideProps = adminCoursePageProps
