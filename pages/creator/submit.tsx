import Link from 'next/link'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import { Check, ChevronLeft, FileVideo, Loader2, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreatorHeader, CreatorShell, Field, areaClass, fieldClass } from '@/components/creator/creator-shell'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm']

export default function CreatorSubmitPage() {
  return <CreatorShell><SubmitContent /></CreatorShell>
}

function SubmitContent() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [step, setStep] = useState<1 | 2>(1)
  const [title, setTitle] = useState('')
  const [socialAccountId, setSocialAccountId] = useState('')
  const [caption, setCaption] = useState('')
  const [postUrl, setPostUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null
    if (!next) return
    if (!videoTypes.includes(next.type)) return toast.error('Choose an MP4, MOV, or WebM video')
    if (next.size > 500 * 1024 * 1024) return toast.error('Video must be 500 MB or smaller')
    setFile(next)
  }

  function review(event: FormEvent) {
    event.preventDefault()
    if (!socialAccountId) return toast.error('Choose the account this video belongs to')
    if (!file) return toast.error('Add a video to continue')
    setStep(2)
  }

  async function submit() {
    if (!file) return
    setSubmitting(true)
    try {
      const intent = await apiPost<{ key: string; publicUrl: string; uploadUrl: string; method: 'PUT' | 'POST' }>('/api/creator/upload-intent', { contentType: file.type, sizeBytes: file.size })
      const response = await fetch(intent.uploadUrl, { method: intent.method, headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('Video upload failed')
      await apiPost('/api/creator/submissions', { title, socialAccountId, caption: caption || null, postUrl: postUrl || null, videoUrl: intent.publicUrl, videoStorageKey: intent.key, videoContentType: file.type, videoSizeBytes: file.size })
      toast.success('Video submitted for review')
      void router.push('/creator/submissions')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : 'Could not submit video')
    } finally { setSubmitting(false) }
  }

  if (isLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
  if (!data?.socialAccounts.length) {
    return <><CreatorHeader eyebrow="New submission" title="Submit a video" description="Upload finished creator content and track its review in your dashboard." /><div className="rounded-[28px] border border-dashed border-zinc-300 bg-white p-10 text-center"><p className="text-sm font-medium">Connect a social account first</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">You need at least one TikTok or Instagram account so every video can be matched to the account that published it.</p><Button asChild className="mt-6 h-11 rounded-xl"><Link href="/creator/accounts">Connect an account</Link></Button></div><PayoutSetupNote /><SubmissionGuidance /></>
  }

  const selectedAccount = data.socialAccounts.find((account) => account.id === socialAccountId)
  const platform = selectedAccount?.platform === 'instagram' ? 'Instagram Reels' : 'TikTok'

  return (
    <>
      <CreatorHeader eyebrow="New submission" title="Submit a video" description="Upload finished creator content. We’ll keep its review and payment status together in your dashboard." />
      <PayoutSetupNote />
      <div className="mb-5 flex items-center gap-2 text-xs font-medium text-zinc-400"><span className={cn('grid size-6 place-items-center rounded-full border', step >= 1 && 'border-black bg-black text-white')}>1</span><span className="h-px w-8 bg-zinc-200" /><span className={cn('grid size-6 place-items-center rounded-full border', step >= 2 && 'border-black bg-black text-white')}>2</span><span className="ml-2">{step === 1 ? 'Details' : 'Review'}</span></div>
      <div className="t-page-slide min-h-[720px] sm:min-h-[650px]" data-page={step}>
        <section className="t-page" data-page-id="1">
          <form onSubmit={review} className="grid gap-6 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Video title"><input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Summer campaign — cut 01" required /></Field><Field label="Published from" hint="Required"><Select value={socialAccountId} onValueChange={setSocialAccountId} required><SelectTrigger><SelectValue placeholder="Choose a connected account" /></SelectTrigger><SelectContent>{data.socialAccounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.handle} · {account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</SelectItem>)}</SelectContent></Select></Field></div>
            <Field label="Video file" hint="MP4, MOV or WebM · max 500 MB">
              <input ref={inputRef} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mov" onChange={chooseFile} />
              {file ? <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><FileVideo className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="mt-0.5 text-xs text-zinc-500">{formatBytes(file.size)}</p></div><button type="button" className="grid size-9 place-items-center rounded-full text-zinc-500 hover:bg-white hover:text-black" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="Remove video"><X className="size-4" /></button></div> : <button type="button" onClick={() => inputRef.current?.click()} className="group grid min-h-44 place-items-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center transition-[border-color,background-color,transform] duration-150 ease-out hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.995]"><span><span className="mx-auto grid size-11 place-items-center rounded-xl border border-zinc-200 bg-white shadow-sm transition-transform duration-200 ease-out group-hover:-translate-y-0.5"><UploadCloud className="size-5" /></span><span className="mt-4 block text-sm font-medium">Choose your finished video</span><span className="mt-1 block text-xs text-zinc-500">The file uploads after you review the details</span></span></button>}
            </Field>
            <Field label="Caption" hint={`${caption.length}/2200`}><textarea className={areaClass} value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 2200))} placeholder="Paste the final caption or notes for the team…" /></Field>
            <Field label="Published post URL" hint="Optional"><input className={fieldClass} type="url" value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://" /></Field>
            <div className="flex justify-end"><Button className="h-11 rounded-xl px-5">Review submission</Button></div>
          </form>
        </section>
        <section className="t-page" data-page-id="2">
          <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Ready to submit</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{title}</h2></div><span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium">{platform}</span></div>
            <div className="mt-7 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm"><ReviewRow label="Account" value={selectedAccount ? `@${selectedAccount.handle}` : ''} /><ReviewRow label="File" value={file?.name || ''} /><ReviewRow label="Size" value={file ? formatBytes(file.size) : ''} /><ReviewRow label="Status" value="Pending review" /></div>
            {caption ? <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{caption}</p></div> : null}
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" className="h-11 rounded-xl" onClick={() => setStep(1)} disabled={submitting}><ChevronLeft />Back to edit</Button><Button className="h-11 rounded-xl px-5" onClick={() => void submit()} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : <Check />} {submitting ? 'Uploading video…' : 'Submit video'}</Button></div>
          </div>
        </section>
      </div>
      <SubmissionGuidance />
    </>
  )
}

function SubmissionGuidance() {
  const requirements = [
    'Connect at least one TikTok or Instagram account',
    'Tag @mogging in the post or caption',
    'Meet the campaign’s minimum view threshold',
    'Submit within 30 days of publishing',
    'Keep the post public and the content original',
  ]

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-zinc-100"><ShieldCheck className="size-4" /></span><h2 className="text-sm font-semibold">Submission requirements</h2></div>
        <ul className="mt-4 grid gap-3">{requirements.map((requirement) => <li key={requirement} className="flex gap-2.5 text-sm leading-5 text-zinc-600"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span>{requirement}</span></li>)}</ul>
      </section>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-zinc-100"><LockKeyhole className="size-4" /></span><h2 className="text-sm font-semibold">Payout lock</h2></div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">Submit only when you’re satisfied with the post’s performance. The view count used during review becomes the payout snapshot and <strong className="font-semibold text-black">will not update afterward.</strong> Payout information must be set up before funds can be released.</p>
      </section>
    </div>
  )
}

function PayoutSetupNote() {
  return <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between"><p><strong className="font-semibold">Payout setup is optional for submission.</strong> Add it before payment is released if you want to receive your earnings.</p><Link href="/creator/payout-information" className="shrink-0 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 transition-colors hover:text-blue-900">Set up payouts</Link></div>
}

function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span><span className="truncate font-medium">{value}</span></div> }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB` }
