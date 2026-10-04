import { CourseSignIn } from '@/components/courses/course-sign-in'
import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Plus, ChevronRight } from 'lucide-react'
import { CourseLayout, EmptyCourse } from '@/components/courses/course-ui'
import { StripeConnection } from '@/components/courses/stripe-connection'
import { coursePageProps } from '@/lib/courses/pages'
import { courseRequest, CourseRequestError, newCourseContent, type CourseRecord, type CourseSeller } from '@/lib/courses/client'
import { sellerSchema, lessonsOf } from '@/lib/courses/validation'

type Dashboard = { page: number; hasMore: boolean; activeStudents: number; totals: { currency: string; courseSales: string; refunds: string; orders: number }[]; orders: { id: string; courseTitle: string; buyerEmail: string; amount: number; totalAmount: number | null; refundedAmount: number; currency: string; paidAt: string | null; state: string; pendingRefundKey: string | null }[] }
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100)

function CourseStudents({ course, close }: { course: CourseRecord; close: () => void }) {
  const [page, setPage] = useState(1)
  const students = useSWR<{ hasMore: boolean; students: { id: string; name: string | null; source: string; expiresAt: string; revokedAt: string | null }[] }>(`/api/creator/courses/${course.id}/students?page=${page}`, courseRequest)
  return <section className="c-course-orders"><div className="c-media-actions"><h2>Students · {course.draft.title}</h2><button className="c-text-link" onClick={close}>Close</button></div>{students.error && <p role="alert">{students.error.message}</p>}{students.isLoading && <p>Loading students…</p>}{students.data?.students.map(student => <div key={student.id}><strong>{student.name || 'Student'}</strong><span>{student.source === 'free' ? 'Free enrollment' : 'Purchased'} · {student.revokedAt ? 'Access revoked' : new Date(student.expiresAt).getTime() <= Date.now() ? 'Access expired' : `Access until ${new Date(student.expiresAt).toLocaleDateString()}`}</span></div>)}{students.data?.students.length === 0 && <p>No students on this page.</p>}{(page > 1 || students.data?.hasMore) && <div className="c-media-actions"><button className="c-button c-button-light" disabled={page === 1 || students.isLoading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="c-button c-button-light" disabled={!students.data?.hasMore || students.isLoading} onClick={() => setPage(page + 1)}>Next</button></div>}</section>
}

function SellerSetup({ saved }: { saved: () => void }) {
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    const fields = new FormData(event.currentTarget)
    try {
      await courseRequest('/api/creator/courses/seller', 'PUT', { slug: fields.get('slug'), country: fields.get('country'), supportEmail: fields.get('supportEmail'), bio: '' })
      saved()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="c-details-editor">
    <h2>Set up your course studio</h2>
    <p className="c-field-hint">Choose your permanent creator URL and the country where your Stripe business is registered.</p>
    <label className="c-field"><span>Creator handle</span><input required name="slug" minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="your-name" /></label>
    <div className="c-fields-row">
      <label className="c-field"><span>Business country</span><select name="country" defaultValue="US">{sellerSchema.shape.country.options.map(country => <option key={country} value={country}>{new Intl.DisplayNames(['en'], { type: 'region' }).of(country)}</option>)}</select></label>
      <label className="c-field"><span>Support email</span><input required name="supportEmail" type="email" placeholder="you@example.com" /></label>
    </div>
    <button disabled={busy} className="c-button c-button-dark">{busy ? 'Creating…' : 'Create studio'}</button>
  </form>
}

export default function CreatorCoursesPage() {
  const { status } = useSession(), router = useRouter()
  const active = status === 'authenticated'
  const seller = useSWR<CourseSeller, CourseRequestError>(active ? '/api/creator/courses/seller' : null, courseRequest, { shouldRetryOnError: false })
  const records = useSWR<CourseRecord[]>(seller.data ? '/api/creator/courses' : null, courseRequest)
  const [page, setPage] = useState(1)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [studentCourse, setStudentCourse] = useState<CourseRecord | null>(null)
  const dashboard = useSWR<Dashboard>(seller.data ? `/api/creator/courses/dashboard?page=${page}` : null, courseRequest)
  const [creating, setCreating] = useState(false)
  const [refunding, setRefunding] = useState<string | null>(null)
  const refundKeys = useRef(new Map<string, string>())
  const create = async () => {
    if (creating) return
    setCreating(true)
    try {
      const course = await courseRequest<CourseRecord>('/api/creator/courses', 'POST', { slug: `course-${crypto.randomUUID().slice(0, 8)}`, content: newCourseContent() })
      await router.push(`/creator/courses/${course.id}`)
    } catch (error) { toast.error((error as Error).message) } finally { setCreating(false) }
  }
  const archive = async (course: CourseRecord) => {
    if (!window.confirm('Archive this course? New enrollments will stop. Existing students keep their access.')) return
    setArchiving(course.id)
    try { await courseRequest(`/api/creator/courses/${course.id}/archive`, 'POST', { version: course.version }); await records.mutate(); toast.success('Course archived') }
    catch (error) { toast.error((error as Error).message) } finally { setArchiving(null) }
  }
  const refund = async (order: Dashboard['orders'][number]) => {
    if (refunding) return
    const retry = order.pendingRefundKey || refundKeys.current.has(order.id)
    if (!window.confirm(retry ? `Check the existing refund request for ${order.buyerEmail}?` : `Refund the remaining ${money((order.totalAmount ?? order.amount) - order.refundedAmount, order.currency)} to ${order.buyerEmail}? A full refund removes course access.`)) return
    const key = order.pendingRefundKey || refundKeys.current.get(order.id) || crypto.randomUUID()
    refundKeys.current.set(order.id, key)
    setRefunding(order.id)
    try {
      const response = await fetch(`/api/creator/courses/orders/${order.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: '{}' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message || 'Refund failed')
      refundKeys.current.delete(order.id)
      toast.success('Refund requested')
    } catch (error) { toast.error((error as Error).message) }
    finally { setRefunding(null); void dashboard.mutate().catch(() => {}) }
  }
  return <CourseLayout title="Creator studio" studio><div className="c-studio-container">
    <div className="c-page-heading c-studio-heading"><div><span className="c-eyebrow">CREATOR STUDIO</span><h1>Your courses</h1></div>
      {seller.data && <button disabled={creating} onClick={() => void create()} className="c-button c-button-dark"><Plus size={16} />{creating ? 'Creating…' : 'Create course'}</button>}
    </div>
    {status === 'unauthenticated' ? <EmptyCourse><h2>Sign in to your studio</h2><CourseSignIn /></EmptyCourse>
      : seller.error?.status === 404 ? <SellerSetup saved={() => void seller.mutate()} />
      : seller.error ? <div><p role="alert">{seller.error.message}</p>{seller.error.status === 401 && <CourseSignIn />}</div>
      : !seller.data ? <p className="c-muted">Loading studio…</p>
      : <>
        <section className="c-studio-stats" aria-label="Revenue overview">
          <div><span>Course sales</span>{dashboard.data?.totals.length ? dashboard.data.totals.map(total => <strong key={total.currency}>{money(Number(total.courseSales), total.currency)}</strong>) : <strong>0</strong>}<small>Gross course sales · before fees</small></div>
          <div><span>Students</span><strong>{dashboard.data?.activeStudents ?? 0}</strong><small>Active enrollments</small></div>
          <div><span>Refunds</span>{dashboard.data?.totals.length ? dashboard.data.totals.map(total => <strong key={total.currency}>{money(Number(total.refunds), total.currency)}</strong>) : <strong>0</strong>}<small>Refunded payments, including tax</small></div>
          <div><span>Platform commission</span><strong>0<span>%</span></strong><small>Free hosting for now</small></div>
        </section>
        {dashboard.error && <p role="alert">Revenue could not be loaded: {dashboard.error.message}</p>}
        <StripeConnection seller={seller.data} changed={() => void seller.mutate()} />
        {seller.data.status !== 'enabled' && <p className="c-field-hint">Seller approval is required for uploads and publishing. You can build your course while it is being reviewed.</p>}
        <section className="c-studio-course-list">
          {records.error && <p role="alert">{records.error.message}</p>}
          {records.data?.map(course => <div key={course.id} className="c-studio-course">
            <Link className="c-studio-course-photo" href={`/creator/courses/${course.id}`} aria-label={`Edit ${course.draft.title}`}>{course.draft.coverUrl && <Image src={course.draft.coverUrl} unoptimized fill sizes="160px" alt="" className="c-course-image" />}</Link>
            <div className="c-studio-course-title"><span className="c-eyebrow">{course.submittedVersion ? 'IN REVIEW' : course.status.toUpperCase()}</span><Link href={`/creator/courses/${course.id}`}><h2>{course.draft.title}</h2></Link><span>{lessonsOf(course.draft).length} lessons · {course.draft.sections.length} chapters</span>{course.reviewNote && <p>{course.reviewNote}</p>}</div>
            <div className="c-studio-course-actions"><button className="c-text-link" onClick={() => setStudentCourse(course)}>Students</button><Link className="c-button c-button-light" href={`/creator/courses/${course.id}`}>Edit course <ChevronRight size={15} /></Link>{course.status !== 'archived' && <button disabled={Boolean(archiving)} className="c-text-link" onClick={() => void archive(course)}>Archive</button>}</div>
          </div>)}
          {records.data?.length === 0 && <p className="c-muted">Create your first course to get started.</p>}
        </section>
        {studentCourse && <CourseStudents key={studentCourse.id} course={studentCourse} close={() => setStudentCourse(null)} />}
        {!!dashboard.data?.orders.length && <section className="c-course-orders"><h2>Recent orders</h2>{dashboard.data.orders.map(order => <div key={order.id}><div><strong>{order.courseTitle}</strong><span>{order.buyerEmail} · {order.state}</span></div><span>{money(order.totalAmount ?? order.amount, order.currency)}</span>{order.paidAt && order.refundedAmount < (order.totalAmount ?? order.amount) && <button disabled={Boolean(refunding)} className="c-text-link" onClick={() => void refund(order)}>{refunding === order.id ? 'Requesting…' : order.pendingRefundKey ? 'Check refund' : 'Refund'}</button>}</div>)}</section>}
        {(page > 1 || dashboard.data?.hasMore) && <div className="c-media-actions"><button className="c-button c-button-light" disabled={page === 1 || dashboard.isLoading} onClick={() => setPage(page - 1)}>Previous orders</button><span>Page {page}</span><button className="c-button c-button-light" disabled={!dashboard.data?.hasMore || dashboard.isLoading} onClick={() => setPage(page + 1)}>Next orders</button></div>}
      </>}
  </div></CourseLayout>
}
export const getServerSideProps = coursePageProps
