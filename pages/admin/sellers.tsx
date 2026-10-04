import useSWR from 'swr'
import { toast } from 'sonner'
import { useState } from 'react'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { AdminPasswordGate } from '@/components/admin/admin-password-gate'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/admin/analytics-ui'
import { apiGet } from '@/lib/api/client'
import { adminCoursePageProps } from '@/lib/admin/page'
import { courseRequest, CourseRequestError, type CourseSeller } from '@/lib/courses/client'

export default function SellersAdminPage() {
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet)
  const sellers = useSWR<CourseSeller[]>(access.data?.unlocked ? '/api/admin/courses/sellers' : null, courseRequest)
  const [saving, setSaving] = useState<string | null>(null)
  async function approve(id: string) {
    setSaving(id)
    try { await courseRequest(`/api/admin/courses/sellers/${id}`, 'PATCH', { status: 'enabled' }); await sellers.mutate(); toast.success('Seller enabled') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not approve seller') }
    finally { setSaving(null) }
  }
  if (access.error) return <Notice>Admin access could not be verified.</Notice>
  if (access.isLoading) return <Notice>Checking admin access…</Notice>
  if (!access.data?.unlocked || (sellers.error instanceof CourseRequestError && sellers.error.status === 401)) return <AdminPasswordGate onUnlocked={() => void access.mutate()} />
  return <><CreatorHeader eyebrow="Manage" title="Course sellers" description="Review and approve seller registrations." />
    {sellers.error ? <Notice>Could not load sellers. <button className="underline" onClick={() => void sellers.mutate()}>Retry</button></Notice> : !sellers.data ? <Notice>Loading sellers…</Notice> : <div className="admin-list">{sellers.data.map(seller => <article key={seller.id} className="admin-resource-row flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h2 className="text-base font-medium">{seller.slug}</h2><p className="mt-1 text-xs text-[#73777d]">{seller.country} · {seller.supportEmail}</p><p className="mt-3 max-w-2xl text-sm leading-6 text-[#73777d]">{seller.bio}</p></div>{seller.status === 'pending' ? <Button disabled={saving !== null} onClick={() => void approve(seller.id)}>{saving === seller.id ? 'Saving…' : 'Approve seller'}</Button> : <span className="text-xs capitalize text-[#73777d]">{seller.status}</span>}</article>)}{!sellers.data.length ? <p className="admin-empty">No seller registrations yet.</p> : null}</div>}
  </>
}
export const getServerSideProps = adminCoursePageProps
