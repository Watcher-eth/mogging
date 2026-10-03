import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { CourseLayout, CourseTile, EmptyCourse } from '@/components/courses/course-ui'
import { CourseSignIn } from '@/components/courses/course-sign-in'
import { coursePreviewProps } from '@/lib/courses/preview'
import { courseRequest } from '@/lib/courses/client'
import { courseView } from '@/lib/courses/view'
import type { PublicCourseContent } from '@/lib/courses/validation'

type LibraryItem = { id: string; slug: string; sellerSlug: string; content: PublicCourseContent | null; active: boolean; enrollment: { expiresAt: string } }
function LearningCourse({ item }: { item: LibraryItem }) {
  const progress = useSWR<{ progress: { completed: boolean }[] }>(item.active ? `/api/courses/${item.id}` : null, courseRequest)
  if (!item.content) return null
  const lessons = item.content.sections.flatMap(section => section.lessons).length
  const count = progress.data?.progress.filter(row => row.completed).length || 0
  const percent = lessons ? Math.round(count / lessons * 100) : 0
  const course = courseView({ ...item, content: item.content, seller: { slug: item.sellerSlug } })
  return <div><CourseTile course={course} learning={item.active} /><div className="c-library-progress"><div><span>{item.active ? `${count} of ${lessons} lessons` : 'Access expired or refunded'}</span><span>{item.active ? `${percent}%` : ''}</span></div>{item.active && <progress value={percent} max={100} aria-label={`${item.content.title} progress`} />}{progress.error && <p role="alert">Progress could not be loaded.</p>}</div></div>
}
export default function CourseLibraryPage() {
  const router = useRouter(), { status } = useSession()
  const [page, setPage] = useState(1)
  const library = useSWR<{ items: LibraryItem[]; page: number; hasMore: boolean }>(status === 'authenticated' ? `/api/courses/library?page=${page}` : null, courseRequest)
  const refreshLibrary = library.mutate
  const orderId = typeof router.query.order === 'string' && /^[a-f0-9-]{36}$/i.test(router.query.order) ? router.query.order : null
  const order = useSWR<{ state: string; courseId: string }>(status === 'authenticated' && orderId ? `/api/courses/orders/${orderId}` : null, courseRequest, { refreshInterval: result => result?.state === 'pending' ? 4000 : 0, shouldRetryOnError: false })
  useEffect(() => { if (order.data?.state === 'paid') void refreshLibrary() }, [order.data?.state, refreshLibrary])
  return <CourseLayout title="My learning"><div className="c-page-heading c-library-heading"><h1>My learning</h1></div>
    {status === 'unauthenticated' ? <EmptyCourse><h2>Sign in to see your courses</h2><CourseSignIn /></EmptyCourse> : <>
      {order.data?.state === 'pending' && <p className="c-preview-note" role="status">Your payment is being confirmed. Course access appears after confirmation.</p>}
      {order.data?.state === 'paid' && <p className="c-preview-note" role="status">Payment confirmed. Your course is ready.</p>}
      {order.data && !['pending', 'paid'].includes(order.data.state) && <p className="c-preview-note">Payment status: {order.data.state}. <Link href="/courses">View courses</Link></p>}
      {(library.error || order.error) && <p className="c-preview-note" role="alert">{library.error?.message || order.error?.message}</p>}
      {library.isLoading && <p className="c-preview-note">Loading your courses…</p>}
      <section className="c-library-grid">{library.data?.items.map(item => <LearningCourse key={item.id} item={item} />)}</section>
      {library.data?.items.length === 0 && <EmptyCourse><p>You haven’t enrolled in any courses yet.</p><Link className="c-button c-button-light" href="/courses">Browse courses</Link></EmptyCourse>}
      {(page > 1 || library.data?.hasMore) && <div className="c-media-actions"><button className="c-button c-button-light" disabled={page === 1 || library.isLoading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="c-button c-button-light" disabled={!library.data?.hasMore || library.isLoading} onClick={() => setPage(page + 1)}>Next</button></div>}
    </>}
  </CourseLayout>
}
export const getServerSideProps = coursePreviewProps
