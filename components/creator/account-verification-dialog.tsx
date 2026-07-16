import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  FileVideo,
  Loader2,
  Play,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CreatorSocialAccount } from '@/components/creator/types'
import { apiPatch, apiPost, ApiClientError } from '@/lib/api/client'

const analyticsVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'] as const
const maxAnalyticsVideoBytes = 250 * 1024 * 1024

const instructions = {
  tiktok: [
    'Open TikTok and go to your profile. Keep the username visible.',
    'Open the menu, then TikTok Studio, then Analytics.',
    'Set the analytics date range to the most recent 28 days.',
    'Open the Viewers tab and scroll to Viewer Insights.',
    'Open Locations and show the complete country list.',
    'Move slowly enough for every screen and value to be reviewed.',
  ],
  instagram: [
    'Open Instagram and go to your profile. Keep the username visible.',
    'Open Professional Dashboard, then Insights.',
    'Set the analytics date range to the most recent 30 days or closest available range.',
    'Show Accounts Reached and total audience performance.',
    'Open Top Locations and show the complete country list.',
    'Move slowly enough for every screen and value to be reviewed.',
  ],
} as const

type AnalyticsEvidence = {
  analyticsVideoUrl: string
  analyticsStorageKey: string
  analyticsContentType: (typeof analyticsVideoTypes)[number]
  analyticsSizeBytes: number
  analyticsPast28DaysConfirmed: true
}

export function AccountVerificationDialog({ account, open, onOpenChange, onSubmitted }: { account: CreatorSocialAccount | null; open: boolean; onOpenChange: (open: boolean) => void; onSubmitted: () => Promise<void> }) {
  const [analyticsFile, setAnalyticsFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyticsConfirmed, setAnalyticsConfirmed] = useState(false)
  const [recordingConfirmed, setRecordingConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!analyticsFile) {
      setPreviewUrl(null)
      return
    }
    const nextPreviewUrl = URL.createObjectURL(analyticsFile)
    setPreviewUrl(nextPreviewUrl)
    return () => URL.revokeObjectURL(nextPreviewUrl)
  }, [analyticsFile])

  useEffect(() => {
    if (open) return
    setAnalyticsFile(null)
    setAnalyticsConfirmed(false)
    setRecordingConfirmed(false)
    setSaving(false)
  }, [open])

  function chooseAnalyticsVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file) return
    if (!analyticsVideoTypes.includes(file.type as (typeof analyticsVideoTypes)[number])) {
      toast.error('Choose an MP4, MOV, or WebM recording')
      return
    }
    if (file.size > maxAnalyticsVideoBytes) {
      toast.error('The analytics recording must be 250 MB or smaller')
      return
    }
    setAnalyticsFile(file)
  }

  async function uploadAnalyticsVideo(): Promise<AnalyticsEvidence> {
    if (!analyticsFile || !analyticsConfirmed || !recordingConfirmed) {
      throw new ApiClientError(400, 'analytics_required', 'Add the required recording and confirm both requirements')
    }
    const contentType = analyticsFile.type as (typeof analyticsVideoTypes)[number]
    const intent = await apiPost<{ key: string; publicUrl: string; uploadUrl: string; method: 'PUT' | 'POST' }>('/api/creator/accounts/analytics-upload-intent', {
      contentType,
      sizeBytes: analyticsFile.size,
    })
    const response = await fetch(intent.uploadUrl, {
      method: intent.method,
      headers: { 'Content-Type': contentType },
      body: analyticsFile,
    })
    if (!response.ok) throw new ApiClientError(response.status, 'upload_failed', 'Analytics recording upload failed')
    return {
      analyticsVideoUrl: intent.publicUrl,
      analyticsStorageKey: intent.key,
      analyticsContentType: contentType,
      analyticsSizeBytes: analyticsFile.size,
      analyticsPast28DaysConfirmed: true,
    }
  }

  async function submitVerification() {
    if (!account) return
    setSaving(true)
    try {
      const analytics = await uploadAnalyticsVideo()
      await apiPatch('/api/creator/accounts', { accountId: account.id, ...analytics })
      await onSubmitted()
      onOpenChange(false)
      toast.success(`@${account.handle} verification submitted`)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not submit account verification')
    } finally {
      setSaving(false)
    }
  }

  if (!account) return null
  const platformLabel = account.platform === 'tiktok' ? 'TikTok' : 'Instagram'
  const ready = Boolean(analyticsFile && analyticsConfirmed && recordingConfirmed)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0">
        <div className="border-b border-zinc-200 px-6 py-5 sm:px-7">
          <DialogHeader>
            <div className="flex items-start gap-3 pr-8">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-white"><ShieldCheck className="size-5" /></span>
              <div><DialogTitle className="text-2xl">Verify @{account.handle}</DialogTitle><DialogDescription className="mt-1">Audience verification for your connected {platformLabel} account.</DialogDescription></div>
            </div>
          </DialogHeader>
        </div>

        <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section>
            <div className="flex items-center gap-3"><span className="h-px flex-1 bg-zinc-200" /><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Follow These Steps</p><span className="h-px flex-1 bg-zinc-200" /></div>
            <ol className="mt-5 grid gap-2.5">
              {instructions[account.platform].map((instruction, index) => (
                <li key={instruction} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm leading-6 text-zinc-700">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white">{index + 1}</span>
                  {instruction}
                </li>
              ))}
            </ol>
            <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><FileVideo className="size-4" />MP4, MOV, or WebM · up to 250 MB</p>
          </section>

          <section>
            <input ref={fileInputRef} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mov" onChange={chooseAnalyticsVideo} />
            {previewUrl ? (
              <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-black">
                <video className="aspect-[9/16] max-h-[520px] w-full object-contain" src={previewUrl} controls preload="metadata" />
                <div className="flex items-center gap-3 bg-zinc-950 p-3 text-white"><FileVideo className="size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{analyticsFile?.name}</p><p className="mt-0.5 text-[11px] text-white/45">Ready to upload</p></div><button type="button" disabled={saving} onClick={() => setAnalyticsFile(null)} className="grid size-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Remove analytics recording"><X className="size-4" /></button></div>
              </div>
            ) : (
              <button type="button" disabled={saving} onClick={() => fileInputRef.current?.click()} className="group grid min-h-[420px] w-full place-items-center rounded-[24px] border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-center transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.995]">
                <span><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white shadow-sm"><Play className="size-5" /></span><span className="mt-4 block text-sm font-semibold">Choose Verification Recording</span><span className="mt-2 block text-xs leading-5 text-zinc-500">Film the complete analytics walkthrough in one continuous take.</span></span>
              </button>
            )}
          </section>
        </div>

        <div className="mx-6 rounded-2xl border border-red-200 bg-red-50 p-5 sm:mx-7 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700"><AlertTriangle className="size-4" /></span><div><p className="text-sm font-semibold text-red-950">Physical Recording Required</p><p className="mt-2 text-xs leading-5 text-red-800">Use a second phone or camera to film your main phone while your hand navigates through every required analytics screen. Screen recordings, cuts, edits, hidden usernames, and altered analytics are not accepted.</p><ul className="mt-3 grid gap-1.5 text-xs leading-5 text-red-800"><li>• Your hand and physical phone must remain visible.</li><li>• Record one continuous take with no cuts or edits.</li><li>• Keep the account username and analytics values readable.</li></ul></div></div>
        </div>

        <div className="grid gap-3 px-6 py-6 sm:px-7">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-3.5 text-xs leading-5 text-zinc-600"><input type="checkbox" className="mt-0.5 size-4 rounded border-zinc-300 accent-black" checked={analyticsConfirmed} onChange={(event) => setAnalyticsConfirmed(event.target.checked)} /><span>I confirm the recording shows this account’s recent analytics and complete audience location data.</span></label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-3.5 text-xs leading-5 text-zinc-600"><input type="checkbox" className="mt-0.5 size-4 rounded border-zinc-300 accent-black" checked={recordingConfirmed} onChange={(event) => setRecordingConfirmed(event.target.checked)} /><span>I confirm this is an unedited physical recording taken with a second device.</span></label>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="h-11 rounded-xl" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            {analyticsFile ? <Button type="button" className="h-11 rounded-xl sm:min-w-56" disabled={saving || !ready} onClick={() => void submitVerification()}>{saving ? <Loader2 className="animate-spin" /> : <UploadCloud />}{saving ? 'Uploading Verification…' : 'Submit for Review'}</Button> : <Button type="button" className="h-11 rounded-xl sm:min-w-56" disabled={saving} onClick={() => fileInputRef.current?.click()}><Smartphone />Choose Recording</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
