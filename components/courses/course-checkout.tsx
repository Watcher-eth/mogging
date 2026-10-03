import { useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { courseRequest } from '@/lib/courses/client'
import { CourseSignIn } from './course-sign-in'

export function CourseCheckout({ courseId, free }: { courseId: string; free: boolean }) {
  const { status } = useSession(), router = useRouter()
  const [busy, setBusy] = useState(false), [verifyOpen, setVerifyOpen] = useState(false), [sent, setSent] = useState(false)
  const email = useSWR<{ verified: boolean; email: string | null; pendingEmail: string | null }>(status === 'authenticated' ? '/api/courses/email' : null, courseRequest)
  const enrollment = useSWR(status === 'authenticated' ? `/api/courses/${courseId}` : null, courseRequest, { shouldRetryOnError: false })
  const purchase = async () => {
    if (busy) return
    if (!email.data?.verified) { setVerifyOpen(true); return }
    setBusy(true)
    try {
      const result = await courseRequest<{ enrolled?: boolean; url?: string }>(`/api/courses/${courseId}/checkout`, 'POST', {})
      if (result.enrolled) await router.push(`/courses/learn/${courseId}`)
      else if (result.url) window.location.assign(result.url)
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      if (sent) {
        await courseRequest('/api/courses/email/verify', 'POST', { token: form.get('token') })
        await email.mutate(); setVerifyOpen(false); toast.success('Email verified. You can enroll now.')
      } else {
        await courseRequest('/api/courses/email', 'POST', { email: form.get('email') }); setSent(true)
      }
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  if (status === 'unauthenticated') return <CourseSignIn />
  if (enrollment.data) return <Link href={`/courses/learn/${courseId}`} className="c-button c-glass-control">Continue learning</Link>
  return <><button className="c-button c-glass-control" disabled={busy || status === 'loading' || email.isLoading} onClick={() => void purchase()}>{busy ? 'Opening…' : free ? 'Enroll for free' : 'Get course'}</button>
    <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}><DialogContent className="c-preview-dialog"><DialogTitle>Verify your email</DialogTitle><DialogDescription>We use this address for course access and your receipt.</DialogDescription><form onSubmit={verify}>
      {sent ? <label className="c-field"><span>Verification code from your email</span><input name="token" required minLength={40} autoComplete="one-time-code" /></label> : <label className="c-field"><span>Email address</span><input type="email" name="email" defaultValue={email.data?.email || ''} required /></label>}
      <button disabled={busy} className="c-button c-button-dark">{busy ? 'Please wait…' : sent ? 'Verify email' : 'Send verification email'}</button>
    </form></DialogContent></Dialog>
  </>
}
