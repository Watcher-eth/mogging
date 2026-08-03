import Link from 'next/link'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import { Check, CheckCircle2, ChevronLeft, CircleAlert, Eye, ImageIcon, Loader2, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { ACTIVE_CREATOR_SUBMISSION_FORMATS, type CreatorSubmissionFormat } from '@/lib/creator/formats'
import { calculateCreatorPayout, CREATOR_US_AUDIENCE_TIERS, CREATOR_VIEW_THRESHOLDS } from '@/lib/creator/payouts'
import { cn } from '@/lib/utils'

const analyticsImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export default function CreatorSubmitPage() {
  return <CreatorShell><SubmitContent /></CreatorShell>
}

function SubmitContent() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [formatId, setFormatId] = useState('')
  const [previewFormat, setPreviewFormat] = useState<CreatorSubmissionFormat | null>(null)
  const [requirementsConfirmed, setRequirementsConfirmed] = useState(false)
  const [socialAccountId, setSocialAccountId] = useState('')
  const [postUrl, setPostUrl] = useState('')
  const [analyticsScreenshot, setAnalyticsScreenshot] = useState<File | null>(null)
  const [viewCountThreshold, setViewCountThreshold] = useState('')
  const [usAudiencePercent, setUsAudiencePercent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const accountRequired = data?.featureFlags.creatorAccountRequiredForSubmission ?? false

  function chooseAnalyticsScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null
    if (!next) return
    if (!analyticsImageTypes.includes(next.type)) return toast.error('Choose a JPEG, PNG, or WebP screenshot')
    if (next.size > 10 * 1024 * 1024) return toast.error('Analytics screenshot must be 10 MB or smaller')
    setAnalyticsScreenshot(next)
  }

  function continueToAnalytics(event: FormEvent) {
    event.preventDefault()
    if (!formatId) return toast.error('Choose a submission format')
    if (accountRequired && !socialAccountId) return toast.error('Choose the account this video belongs to')
    if (!postUrl) return toast.error('Add the published post URL')
    setStep(2)
  }

  function review(event: FormEvent) {
    event.preventDefault()
    if (!analyticsScreenshot) return toast.error('Add an analytics screenshot to continue')
    if (!viewCountThreshold) return toast.error('Choose the view threshold for this submission')
    setRequirementsConfirmed(false)
    setStep(3)
  }

  async function submit() {
    if (!analyticsScreenshot || !formatId || !postUrl || !viewCountThreshold || !requirementsConfirmed) return
    setSubmitting(true)
    try {
      const intent = await apiPost<{ key: string; publicUrl: string; uploadUrl: string; method: 'PUT' | 'POST' }>('/api/creator/submission-analytics-upload-intent', { contentType: analyticsScreenshot.type, sizeBytes: analyticsScreenshot.size })
      const response = await fetch(intent.uploadUrl, { method: intent.method, headers: { 'Content-Type': analyticsScreenshot.type }, body: analyticsScreenshot })
      if (!response.ok) throw new Error('Analytics screenshot upload failed')
      await apiPost('/api/creator/submissions', { formatId, requirementsConfirmed: true, socialAccountId: socialAccountId || null, postUrl, analyticsScreenshotUrl: intent.publicUrl, analyticsStorageKey: intent.key, analyticsContentType: analyticsScreenshot.type, analyticsSizeBytes: analyticsScreenshot.size, viewCountThreshold: Number(viewCountThreshold), usAudiencePercent: usAudiencePercent ? Number(usAudiencePercent) : null })
      toast.success('Video submitted for review')
      void router.push('/creator/submissions')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : 'Could not submit video')
    } finally { setSubmitting(false) }
  }

  if (isLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-sm text-zinc-500">Could not load submission settings.</div>
  if (accountRequired && !data?.socialAccounts.length) {
    return <><CreatorHeader eyebrow="New Submission" title="Submit a video" description="Upload finished creator content and track its review in your dashboard." /><div className="creator-surface p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-[16px] bg-[#e8f2ff] text-[#0071e3]"><ShieldCheck className="size-5" /></span><p className="mt-5 text-base font-semibold">Connect a social account first</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6e6e73]">You need at least one TikTok or Instagram account so every video can be matched to the account that published it.</p><Button asChild className="mt-6 h-11 rounded-full px-5"><Link href="/creator/accounts">Connect Account</Link></Button></div><PayoutSetupNote /><SubmissionGuidance accountRequired /></>
  }

  const selectedAccount = data.socialAccounts.find((account) => account.id === socialAccountId)
  const selectedFormat = ACTIVE_CREATOR_SUBMISSION_FORMATS.find((format) => format.id === formatId)
  const platform = selectedAccount ? (selectedAccount.platform === 'instagram' ? 'Instagram Reels' : 'TikTok') : 'Unlinked'
  const linkedToApprovedAccount = selectedAccount?.status === 'approved'
  const potentialEarnings = viewCountThreshold
    ? calculateCreatorPayout(Number(viewCountThreshold), true, usAudiencePercent ? Number(usAudiencePercent) : null).payout
    : null

  return (
    <>
      <CreatorHeader eyebrow="New Submission" title="Submit a video" description="Share the published post and its analytics evidence. We’ll keep review and payment status together in your dashboard." />
      <PayoutSetupNote />
      <SubmissionStepper step={step} />
      <div className="t-page-slide min-h-[720px] sm:min-h-[650px]" data-page={step}>
        <section className="t-page" data-page-id="1">
          <form onSubmit={continueToAnalytics} className="creator-surface grid gap-7 p-5 sm:p-7">
            <FormatPicker selectedId={formatId} onSelect={(nextFormatId) => { setFormatId(nextFormatId); setRequirementsConfirmed(false) }} onPreview={setPreviewFormat} />
            <Field label="Published From" hint={accountRequired ? 'Required' : 'Optional for now'}><Select value={socialAccountId || undefined} onValueChange={(value) => setSocialAccountId(value === 'unlinked' ? '' : value)} required={accountRequired}><SelectTrigger><SelectValue placeholder="No connected account" /></SelectTrigger><SelectContent>{!accountRequired ? <SelectItem value="unlinked">No connected account</SelectItem> : null}{data.socialAccounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.handle} · {account.platform === 'tiktok' ? 'TikTok' : 'Instagram'} · {account.status === 'approved' ? 'Approved' : 'Not approved'}</SelectItem>)}</SelectContent></Select></Field>
            {!linkedToApprovedAccount ? <div className="flex gap-3 rounded-[16px] bg-[#fff4ce] px-4 py-3 text-sm leading-6 text-[#6b4f00]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[#8a5a00]" /><p><strong className="font-semibold">Account not approved yet.</strong> You can submit now, but the video stays flagged until its social account is approved.</p></div> : null}
            <Field label="Published Post URL" hint="Required"><input className={fieldClass} type="url" value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://www.tiktok.com/… or https://www.instagram.com/…" required /></Field>
            <div className="flex justify-end"><Button className="h-11 rounded-full px-5">Continue to Analytics</Button></div>
          </form>
        </section>
        <section className="t-page" data-page-id="2">
          <form onSubmit={review} className="creator-surface grid gap-7 p-5 sm:p-7">
            <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Analytics Evidence</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Confirm the Performance Snapshot</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Choose the threshold you are submitting for and upload the screenshot we should use to confirm the view count, traffic sources, and audience location.</p></div>
            <Field label="Video Analytics Screenshot" hint="Required · JPEG, PNG or WebP · max 10 MB">
              <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAnalyticsScreenshot} />
              {analyticsScreenshot ? <div className="flex items-center gap-3 rounded-[16px] bg-[#f5f5f7] p-3"><span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-white text-[#0071e3] shadow-sm"><ImageIcon className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{analyticsScreenshot.name}</p><p className="mt-0.5 text-xs text-[#6e6e73]">{formatBytes(analyticsScreenshot.size)} · analytics evidence</p></div><button type="button" className="grid size-9 place-items-center rounded-full text-[#86868b] transition-[background-color,color,transform] duration-150 hover:bg-white hover:text-[#1d1d1f] active:scale-[0.96]" onClick={() => { setAnalyticsScreenshot(null); if (inputRef.current) inputRef.current.value = '' }} aria-label="Remove analytics screenshot"><X className="size-4" /></button></div> : <button type="button" onClick={() => inputRef.current?.click()} className="group grid min-h-44 place-items-center rounded-[18px] border border-dashed border-black/15 bg-[#f5f5f7]/70 p-6 text-center transition-[border-color,background-color,transform] duration-150 hover:border-[#0071e3]/40 hover:bg-[#f5f5f7] active:scale-[0.99]"><span><span className="mx-auto grid size-11 place-items-center rounded-[14px] bg-white text-[#0071e3] shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5"><UploadCloud className="size-5" /></span><span className="mt-4 block text-sm font-semibold">Choose Analytics Screenshot</span><span className="mt-1 block max-w-md text-xs leading-5 text-[#6e6e73]">Include traffic sources and audience location so the team can verify where views came from.</span></span></button>}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="View Count Threshold" hint="Required"><Select value={viewCountThreshold || undefined} onValueChange={setViewCountThreshold} required><SelectTrigger><SelectValue placeholder="Choose a Threshold" /></SelectTrigger><SelectContent>{CREATOR_VIEW_THRESHOLDS.map((threshold) => <SelectItem key={threshold.views} value={String(threshold.views)}>{threshold.label} views</SelectItem>)}</SelectContent></Select></Field>
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-sm font-medium"><label htmlFor="submission-audience-tier">Audience Tier</label><span className="text-xs font-normal text-zinc-400">Based on screenshot</span></div>
                <Select value={usAudiencePercent || 'base'} onValueChange={(value) => setUsAudiencePercent(value === 'base' ? '' : value)}><SelectTrigger id="submission-audience-tier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">20%+ combined Tier-1 · base rate</SelectItem>{CREATOR_US_AUDIENCE_TIERS.map((percentage) => <SelectItem key={percentage} value={String(percentage)}>{percentage === 40 ? '40%+ U.S.' : `${percentage}% U.S.`}</SelectItem>)}</SelectContent></Select>
                <p className="text-[11px] leading-5 text-zinc-500">Choose the U.S. percentage shown in your analytics. If it is below 22.5%, use the combined Tier-1 base rate. <Link href="/creator/guide#audience-tiers" className="font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-black">See audience eligibility in the guide.</Link></p>
              </div>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-zinc-100 pt-4 text-sm" aria-live="polite"><span className="font-medium text-zinc-500">Potential Earnings:</span><strong className="font-semibold tabular-nums text-black">{potentialEarnings === null ? 'Choose a view threshold' : `$${potentialEarnings}`}</strong>{potentialEarnings !== null ? <span className="text-xs text-zinc-400">estimated after verification</span> : null}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => setStep(1)}><ChevronLeft />Back to Post Details</Button><Button className="h-11 rounded-full px-5">Review Submission</Button></div>
          </form>
        </section>
        <section className="t-page" data-page-id="3">
          <div className="creator-surface p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Ready to Submit</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{selectedFormat?.name}</h2></div><span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium">{platform}</span></div>
            <div className="mt-7 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm"><ReviewRow label="Format" value={selectedFormat?.name || ''} /><ReviewRow label="Account" value={selectedAccount ? `@${selectedAccount.handle}` : 'Not connected'} /><ReviewRow label="Account Eligibility" value={linkedToApprovedAccount ? 'Approved' : 'Not approved'} /><ReviewRow label="Published Post" value={postUrl} /><ReviewRow label="Analytics Screenshot" value={analyticsScreenshot?.name || ''} /><ReviewRow label="View Count Threshold" value={`${formatViewCount(Number(viewCountThreshold))} views`} /><ReviewRow label="U.S. Audience" value={usAudiencePercent ? `${usAudiencePercent}%` : 'Default 20% Tier 1 Audience'} /><ReviewRow label="Status" value="Not submitted" /></div>
            {!linkedToApprovedAccount ? <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><p>This submission will be marked as <strong className="font-semibold">not connected to an approved account</strong>.</p></div> : null}
            <label className={cn('mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.995]', requirementsConfirmed ? 'border-emerald-200 bg-emerald-50/70' : 'border-zinc-200 bg-white')}><input type="checkbox" className="mt-0.5 size-4 rounded border-zinc-300 accent-emerald-600" checked={requirementsConfirmed} onChange={(event) => setRequirementsConfirmed(event.target.checked)} /><span><span className="block text-sm font-semibold">I checked the {selectedFormat?.name} requirements</span><span className="mt-1 block text-xs leading-5 text-zinc-500">I confirm this video follows the complete format brief and is ready for review.</span></span></label>
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" className="h-11 rounded-full" onClick={() => setStep(2)} disabled={submitting}><ChevronLeft />Back to Analytics</Button><Button className="h-11 rounded-full px-5" onClick={() => void submit()} disabled={submitting || !requirementsConfirmed}>{submitting ? <Loader2 className="animate-spin" /> : <Check />} {submitting ? 'Uploading Analytics…' : 'Submit Video'}</Button></div>
          </div>
        </section>
      </div>
      <SubmissionGuidance accountRequired={accountRequired} selectedFormat={selectedFormat} />
      <FormatBriefDialog format={previewFormat} open={Boolean(previewFormat)} onOpenChange={(open) => { if (!open) setPreviewFormat(null) }} />
    </>
  )
}

function FormatPicker({ selectedId, onSelect, onPreview }: { selectedId: string; onSelect: (formatId: string) => void; onPreview: (format: CreatorSubmissionFormat) => void }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4"><div><h2 className="text-sm font-semibold">Choose a Format</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Select the brief this video was created for.</p></div><span className="text-xs text-zinc-400">Required</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIVE_CREATOR_SUBMISSION_FORMATS.map((format) => {
          const selected = selectedId === format.id
          return <div key={format.id} className={cn('rounded-[18px] border p-4 transition-[border-color,background-color,box-shadow] duration-150', selected ? 'border-[#0071e3]/40 bg-[#f2f7ff] shadow-[0_0_0_3px_rgba(0,113,227,0.08)]' : 'border-black/[0.08] bg-white')}><button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => onSelect(format.id)}><span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors', selected ? 'border-[#0071e3] bg-[#0071e3] text-white' : 'border-black/20 bg-white')}>{selected ? <Check className="size-3" /> : null}</span><span className="min-w-0"><span className="block text-sm font-semibold">{format.name}</span><span className="mt-1.5 block text-xs leading-5 text-[#6e6e73]">{format.shortDescription}</span></span></button><button type="button" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0071e3] transition-opacity hover:opacity-70" onClick={() => onPreview(format)}><Eye className="size-3.5" />Preview Requirements</button></div>
        })}
      </div>
    </section>
  )
}

function FormatBriefDialog({ format, open, onOpenChange }: { format: CreatorSubmissionFormat | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="creator-dialog max-h-[90vh] max-w-2xl overflow-y-auto rounded-[26px] border-white/70 bg-white/95 p-0">{format ? <><DialogHeader className="border-b border-black/[0.06] p-6 pr-14 sm:p-7"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">Format Brief</p><DialogTitle className="text-2xl">{format.name}</DialogTitle><DialogDescription>{format.shortDescription}</DialogDescription></DialogHeader><div className="grid gap-8 p-6 sm:p-7"><BriefList eyebrow="Throughout the video" items={format.elements.map((item) => ({ title: item.title, detail: item.detail }))} /><BriefList eyebrow="Requirements" items={format.requirements.map((item) => ({ title: item }))} /><BriefList eyebrow="Not allowed" items={format.notAllowed.map((item) => ({ title: item }))} /><div className="flex gap-3 rounded-[16px] bg-[#e5f7ea] p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#248a3d]" /><div><p className="text-sm font-semibold text-[#174b26]">One confirmation at review</p><p className="mt-1 text-xs leading-5 text-[#2b6338]">You’ll confirm once that your finished video follows this complete brief before submitting.</p></div></div></div></> : null}</DialogContent></Dialog>
}

function BriefList({ eyebrow, items }: { eyebrow: string; items: ReadonlyArray<{ title: string; detail?: string }> }) {
  return <section><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p><ol className="mt-4 grid gap-4">{items.map((item, index) => <li key={item.title} className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="pt-0.5 text-xs font-medium tabular-nums text-zinc-300">{String(index + 1).padStart(2, '0')}</span><span><span className="block text-sm font-medium text-zinc-800">{item.title}</span>{item.detail ? <span className="mt-1 block text-sm leading-6 text-zinc-500">{item.detail}</span> : null}</span></li>)}</ol></section>
}

function SubmissionGuidance({ accountRequired, selectedFormat }: { accountRequired: boolean; selectedFormat?: CreatorSubmissionFormat }) {
  const requirements = selectedFormat?.requirements || [
    'Choose a format to see its complete requirements',
    accountRequired ? 'Connect at least one TikTok or Instagram account' : 'Account connection is optional while early submissions are enabled',
  ]

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <section className="creator-surface p-5">
        <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-zinc-100"><ShieldCheck className="size-4" /></span><h2 className="text-sm font-semibold">{selectedFormat ? `${selectedFormat.name} requirements` : 'Format requirements'}</h2></div>
        <ul className="mt-4 grid gap-3">{requirements.map((requirement) => <li key={requirement} className="flex gap-2.5 text-sm leading-5 text-zinc-600"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span>{requirement}</span></li>)}</ul>
      </section>
      <section className="creator-surface p-5">
        <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-zinc-100"><LockKeyhole className="size-4" /></span><h2 className="text-sm font-semibold">Payout lock</h2></div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">Submit only when you’re satisfied with the post’s performance. The view count used during review becomes the payout snapshot and <strong className="font-semibold text-black">will not update afterward.</strong> Payout information must be set up before funds can be released.</p>
      </section>
    </div>
  )
}

function PayoutSetupNote() {
  return <div className="mb-5 flex flex-col gap-3 rounded-[16px] bg-[#e8f2ff] px-4 py-3 text-sm text-[#234f7d] sm:flex-row sm:items-center sm:justify-between"><p><strong className="font-semibold text-[#173f69]">Payout setup is optional.</strong> Add it before payment is released to receive your earnings.</p><Link href="/creator/payout-information" className="shrink-0 font-semibold text-[#0071e3] transition-opacity hover:opacity-70">Set Up Payouts</Link></div>
}

function SubmissionStepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Post Details', 'Analytics', 'Review']
  return <div className="mb-5 grid grid-cols-3 rounded-[16px] bg-black/[0.045] p-1" aria-label={`Submission step ${step} of 3`}>{labels.map((label, index) => { const number = index + 1; const active = number === step; const complete = number < step; return <div key={label} className={cn('flex items-center justify-center gap-2 rounded-[12px] px-2 py-2 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-200', active ? 'bg-white text-[#1d1d1f] shadow-sm' : complete ? 'text-[#248a3d]' : 'text-[#86868b]')}><span className={cn('grid size-5 place-items-center rounded-full text-[10px]', active ? 'bg-[#0071e3] text-white' : complete ? 'bg-[#e5f7ea]' : 'bg-black/[0.05]')}>{complete ? <Check className="size-3" /> : number}</span><span className="hidden sm:inline">{label}</span></div> })}</div>
}

function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span><span className="truncate font-medium">{value}</span></div> }
function formatViewCount(views: number) { return views === 1_000_000 ? '+1M' : new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(views) }
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB` }
