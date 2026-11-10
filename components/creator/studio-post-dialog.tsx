import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPatch } from '@/lib/api/client'
import { creatorPostPlatform } from '@/lib/creator/validation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { CreatorDashboard } from './types'

export type StudioExport = { id: string; title: string; campaignName: string; minimumViews: number }
export function StudioPostDialog({ generation, preview = false, onClose, onSubmitted }: { generation: StudioExport | null; preview?: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { data } = useSWR<CreatorDashboard>(generation && !preview ? '/api/creator' : null, apiGet)
  const [postUrl, setPostUrl] = useState('')
  const [accountId, setAccountId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const platform = creatorPostPlatform(postUrl)
  const accounts = (data?.socialAccounts ?? []).filter(account => !platform || account.platform === platform)
  const selectedAccount = accounts.find(account => account.id === accountId)?.id ?? (accounts.length === 1 ? accounts[0].id : '')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!generation || preview || saving) return
    setSaving(true); setError('')
    try {
      await apiPatch('/api/creator/studio', { generationId: generation.id, postUrl, socialAccountId: selectedAccount, requirementsConfirmed: confirmed })
      toast.success('Post submitted. Add analytics when you reach your first milestone.')
      onSubmitted()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit your post') }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(generation)} onOpenChange={open => { if (!open && !saving) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-3xl border border-neutral-100 p-7 sm:p-8">
      <DialogTitle className="text-xl tracking-tight">Post it, then submit your link</DialogTitle>
      <DialogDescription className="leading-6">Your video is ready. Once you’ve posted it, paste the link here. Analytics can wait until your first milestone.</DialogDescription>
      <form onSubmit={event => void submit(event)} className="mt-2 grid gap-5">
        <div className="rounded-xl bg-neutral-50 p-4 text-sm"><p className="font-medium">{generation?.campaignName}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{generation?.title}<br />First review at {generation?.minimumViews.toLocaleString('en-US')} views · Existing campaign payout terms apply.</p></div>
        {preview ? <p className="text-xs text-amber-800" role="note">Dialog preview only. No export or submission is being saved.</p> : null}
        <label className="grid gap-2 text-sm font-medium">Published post link<input autoFocus type="url" required value={postUrl} onChange={event => setPostUrl(event.target.value)} placeholder="TikTok or Instagram post URL" className="h-11 rounded-xl border border-neutral-200 px-3 text-sm font-normal" /></label>
        <label className="grid gap-2 text-sm font-medium">Posting account<select required value={selectedAccount} onChange={event => setAccountId(event.target.value)} className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal"><option value="">Choose your account</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.handle ?? account.displayName ?? account.platform}</option>)}</select></label>
        {!preview && data && !accounts.length ? <p className="text-xs text-neutral-500"><Link className="underline" href="/creator/accounts" target="_blank">Connect your posting account</Link>, then return here.</p> : null}
        <label className="flex items-start gap-2.5 text-xs leading-5 text-neutral-600"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0 rounded" /><span>I’ve posted this video and followed the <Link target="_blank" className="underline" href="/creator/sprints">campaign requirements</Link>.</span></label>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={preview || saving || !platform || !selectedAccount || !confirmed} className="flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-medium text-white disabled:opacity-40">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{saving ? 'Submitting…' : 'Submit post'}</button>
        <div className="flex items-center justify-between text-xs text-neutral-500"><button type="button" disabled={saving} onClick={onClose}>I’ll post it first</button><Link className="underline" href="/creator/submissions">My submissions</Link></div>
      </form>
    </DialogContent>
  </Dialog>
}
