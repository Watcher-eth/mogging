import { useState } from 'react'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'

export function CreatorExclusivityReview({ submission, onSaved }: { submission: { id: string; exclusivityConfirmed?: boolean }; onSaved: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(submission.exclusivityConfirmed ?? false)
  const [busy, setBusy] = useState(false)
  async function save(value: boolean) {
    setBusy(true)
    try {
      await apiPost('/api/admin/creator/review', { resource: 'exclusivity', id: submission.id, confirmed: value })
      setConfirmed(value)
      await onSaved()
    } catch (error) { toast.error(error instanceof ApiClientError ? error.message : 'Could not save bio-link review') }
    finally { setBusy(false) }
  }
  return <label className="mt-5 flex items-start gap-3 rounded-xl border border-zinc-200 p-4 text-sm">
    <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => void save(event.target.checked)} className="mt-1 size-4 shrink-0 accent-black" />
    <span><span className="font-semibold">30-day bio link verified · admin only</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Confirm this creator kept their Mogging link in bio for the entire 30-day campaign. They may post other content. Every submission to the new campaigns during this period must be checked. Existing campaign submissions are excluded. The bonus accrues after the period ends, independently of content approval.</span></span>
  </label>
}
