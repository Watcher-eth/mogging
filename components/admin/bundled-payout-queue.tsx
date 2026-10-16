import { useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import type { AdminDashboard } from './creator-types'
import type { CreatorPayoutRequest } from '@/components/creator/types'
import { creatorEarnedCents } from '@/lib/creator/money'
import { sprintMoney } from '@/lib/creator/sprints'
import { apiPatch } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function BundledPayoutQueue({ data, onRefresh }: { data: AdminDashboard; onRefresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<CreatorPayoutRequest | null>(null)
  const pending = data.payoutRequests?.filter(request => request.status === 'pending') || []
  if (!pending.length) return null
  return <section aria-label="Bundled payout requests" className="mb-7 rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
    <h2 className="text-base font-semibold">Bundled payout requests <span className="ml-1 text-zinc-400">{pending.length}</span></h2>
    <p className="mt-1 text-xs leading-5 text-zinc-500">One transfer per creator. These amounts already deduct earlier payouts and exclude transfers processing separately.</p>
    <div className="mt-4 divide-y divide-sky-100">{pending.map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
      <div><p className="text-sm font-semibold">{data.creators.find(creator => creator.id === request.creatorProfileId)?.displayName || 'Creator'}</p><p className="mt-1 text-xs text-zinc-500">Requested {new Date(request.requestedAt).toLocaleDateString()} · {data.payments.filter(payment => payment.payoutRequestId === request.id).length} payment records</p></div>
      <div className="flex items-center gap-4"><strong className="text-xl tabular-nums">{sprintMoney(request.amountCents)}</strong><Button variant="outline" className="rounded-full bg-white" onClick={() => setSelected(request)}>Review bundle</Button></div>
    </div>)}</div>
    {selected ? <RecordBundle key={selected.id} request={selected} data={data} onClose={() => setSelected(null)} onSaved={async () => { await onRefresh(); setSelected(null) }} /> : null}
  </section>
}

function RecordBundle({ request, data, onClose, onSaved }: { request: CreatorPayoutRequest; data: AdminDashboard; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const records = data.payments.filter(payment => payment.payoutRequestId === request.id)
  const submissionIds = [...new Set(records.map(payment => payment.submissionId))]
  const creator = data.creators.find(item => item.id === request.creatorProfileId)
  async function save() {
    setSaving(true)
    try {
      const receiptImage = receipt ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read receipt')); reader.readAsDataURL(receipt) }) : undefined
      await apiPatch('/api/admin/creator/payout-requests', { id: request.id, expectedAmountCents: request.amountCents, providerReference: reference || undefined, receiptImage })
      toast.success('Bundled payout recorded. Every included payment is settled.')
      await onSaved()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not record bundled payout') }
    finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}><DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[28px] p-6">
    <DialogHeader className="pr-8 text-left"><DialogTitle>Record bundled payout</DialogTitle><DialogDescription>{creator?.displayName} · One combined transfer</DialogDescription></DialogHeader>
    <p className="text-4xl font-semibold tabular-nums">{sprintMoney(request.amountCents)}</p>
    <div className="rounded-xl bg-zinc-50 p-4 text-sm"><p className="font-semibold">{request.paymentOption === 'paypal' ? 'PayPal' : request.network || 'Crypto'}</p><p className="mt-2 select-text break-all text-zinc-600">{request.destination}</p><p className="mt-2 text-xs text-zinc-400">Payout destination saved with this request.</p></div>
    <ul className="divide-y divide-zinc-100">{submissionIds.map(id => {
      const submission = data.submissions.find(item => item.id === id)
      const amount = records.filter(payment => payment.submissionId === id).reduce((sum, payment) => sum + payment.amountCents, 0)
      const paid = data.payments.filter(payment => payment.submissionId === id && payment.status === 'paid' && payment.payoutRequestId !== request.id).reduce((sum, payment) => sum + payment.amountCents, 0)
      const processing = data.payments.filter(payment => payment.submissionId === id && payment.status === 'processing' && payment.payoutRequestId !== request.id).reduce((sum, payment) => sum + payment.amountCents, 0)
      return <li key={id || 'manual'} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{submission?.title || 'Manual payout'}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{submission?.platform} · {submission?.socialHandle ? `@${submission.socialHandle}` : creator?.displayName}<br />{submission ? <>{sprintMoney(creatorEarnedCents(submission))} total earned · {sprintMoney(paid)} already paid{processing > 0 ? <> · {sprintMoney(processing)} processing separately</> : null}</> : 'Previously scheduled manual payment'}</p></div><strong className="shrink-0 tabular-nums">{sprintMoney(amount)}</strong></li>
    })}</ul>
    <p className="text-xs leading-5 text-zinc-500">Includes reviewed earnings at the time of the request. Later earnings stay for the next bundle. Only mark paid after sending the full transfer; this settles all included records together.</p>
    <label className="grid gap-2 text-sm font-medium">{request.paymentOption === 'paypal' ? 'Payment reference (optional)' : 'Transaction hash'}<input className="creator-field" value={reference} onChange={event => setReference(event.target.value)} maxLength={180} /></label>
    {request.paymentOption === 'paypal' ? <label className="grid gap-2 text-sm font-medium">Shared receipt (optional)<input type="file" accept="image/png,image/jpeg,image/webp" className="min-w-0 text-xs" onChange={event => { const file = event.target.files?.[0]; if (file && file.size > 5 * 1024 * 1024) { event.target.value = ''; setReceipt(null); toast.error('Choose a receipt up to 5 MB'); return }; setReceipt(file || null) }} /><span className="text-xs font-normal text-zinc-500">The same proof is attached to every included payment.</span></label> : null}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}Mark {sprintMoney(request.amountCents)} paid</Button></div>
  </DialogContent></Dialog>
}
