import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { TikTokAccountDialog } from './tiktok-anchor-onboarding'
import { publishingTikTokHandle, tiktokAnchorEligible, TIKTOK_ANCHOR_REQUIREMENTS_ENABLED, TIKTOK_ANCHOR_REQUIREMENT } from '@/lib/creator/tiktok-anchor'
import { detectPostingAccount } from '@/lib/creator/post-account'
import { creatorContentRestriction } from '@/lib/creator/content-policy'
import { creatorCampaignRules, creatorFormatElement, CREATOR_REREVIEW_GUIDANCE } from '@/lib/creator/post-guidance'
import { PublishedPostPlayer } from './published-post-player'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { AnalyticsRecordingPreview } from './analytics-recording-preview'
import { CampaignRegionHelp } from './campaign-region-help'
import { MinimumViewsDialog } from './minimum-views-dialog'
import Link from 'next/link'
import { campaignRegionRates } from '@/lib/creator/sprint-defaults'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import {
  Check,
  ChevronLeft,
  Eye,
  Info,
  Users,
  Loader2,
  UploadCloud,
} from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldClass } from './creator-shell'
import { creatorAccountLabel, type CreatorDashboard, type CreatorSubmission } from './types'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  MINIMUM_SUBMISSION_VIEWS,
  creatorPostUrlSchema,
} from '@/lib/creator/validation'
import {
  creatorVideoContentType,
  CREATOR_VIDEO_ACCEPT,
  MAX_CREATOR_ANALYTICS_VIDEO_BYTES,
} from '@/lib/creator/video-types'
import { uploadAnalyticsRecording } from '@/lib/creator/analytics-upload'
import {
  sprintPhase,
  sprintFormat,
  sprintMoney,
  sprintViews,
  sprintPayoutCents,
  type CreatorSprint,
} from '@/lib/creator/sprints'
import { cn } from '@/lib/utils'
const labels = ['Campaign', 'Format', 'Link', 'Analytics', 'Review']
const titles = [
  'Pick a campaign',
  'Choose your format',
  'Link your post',
  'Verify your analytics',
  'Review and submit',
]
const descriptions = [
  'Submit as soon as your post reaches 20,000 views—the first milestone. Choose its campaign below.',
  'Choose the format you used for your post.',
  'Paste your published TikTok or Instagram URL to preview it.',
  'Upload one continuous recording filmed with a second device.',
  'Confirm the campaign requirements before sending your post for review.',
]
export function SubmissionDialog({
  open,
  onOpenChange,
  initialSprintId,
  existingSubmission,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  initialSprintId?: string
  existingSubmission?: CreatorSubmission
  onSubmitted: () => Promise<void>
}) {
  const { data: campaigns, error: sprintError } = useSWR<{
    sprints: CreatorSprint[]
  }>(open ? '/api/creator/sprints' : null, apiGet)
  const { data, error: dashboardError, mutate: refreshDashboard } = useSWR<CreatorDashboard>(
    open ? '/api/creator' : null,
    apiGet,
  )
  const [step, setStep] = useState(existingSubmission ? 4 : 1)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  function changeStep(value: number) {
    setStepDirection(value > step ? 1 : -1)
    setStep(value)
  }
  const [sprintId, setSprintId] = useState(existingSubmission?.sprintId || initialSprintId || '')
  const [formatId, setFormatId] = useState(existingSubmission?.formatId || '')
  const [selectedAccountId, setAccountId] = useState(existingSubmission?.socialAccountId || '')
  const [anchorSetupOpen, setAnchorSetupOpen] = useState(false)
  const [usedRefCode, setUsedRefCode] = useState(false)
  const [postUrl, setPostUrl] = useState(existingSubmission?.postUrl || '')
  const [recording, setRecording] = useState<File | null>(null)
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false)
  const [views, setViews] = useState(existingSubmission?.viewCountThreshold?.toString() || '')
  const [rejectedViews, setRejectedViews] = useState<number | null>(null)
  const [audience, setAudience] = useState(existingSubmission?.usAudiencePercent?.toString() || '')
  const [confirmed, setConfirmed] = useState<string[]>([])
  const canCheckAll = (data?.submissions.filter(item => item.status === 'approved' || item.status === 'paid').length ?? 0) >= 5
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  const stepLabels = existingSubmission ? labels.slice(3) : labels
  const visibleStep = existingSubmission ? step - 3 : step
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    if (contentRef.current) contentRef.current.scrollTop = 0
    headingRef.current?.focus({ preventScroll: true })
  }, [step])
  const campaign = campaigns?.sprints.find((item) => item.id === sprintId)
  const sprint = campaign && { ...campaign, terms: existingSubmission?.sprintTerms || campaign.terms }
  const format = sprint ? sprintFormat(sprint.terms, formatId) : undefined
  const activeSprints =
    campaigns?.sprints.filter(
      (item) =>
        sprintPhase(item) === 'active' && item.usedCents < item.budgetCents,
    ) || []
  useEffect(() => {
    if (initialSprintId) setSprintId(initialSprintId)
  }, [initialSprintId])
  const detected = detectPostingAccount(postUrl, data?.socialAccounts || [], selectedAccountId)
  const { platform, account: publishingAccount } = detected
  const accountId = publishingAccount?.id || ''
  const anchorEligibility = tiktokAnchorEligible(publishingAccount)
  const anchorRequired = TIKTOK_ANCHOR_REQUIREMENTS_ENABLED && !existingSubmission && platform === 'tiktok' && anchorEligibility === true
  const checklist =
    format && sprint
      ? [
          ...creatorCampaignRules(format.requirements),
          ...(anchorRequired ? [TIKTOK_ANCHOR_REQUIREMENT] : []),
          ...creatorCampaignRules(sprint.terms.rules),
          ...format.notAllowed.map((item) => `My post avoids: ${creatorContentRestriction(item)}`),
        ]
      : []
  const accountRequired =
    platform === 'tiktok' || data?.featureFlags.creatorAccountRequiredForSubmission || false
  function checkMinimumViews() {
    const count = Number(views)
    if (
      views.trim() &&
      Number.isInteger(count) &&
      count >= 0 &&
      count < MINIMUM_SUBMISSION_VIEWS
    ) {
      setRejectedViews(count)
      return false
    }
    return true
  }
  function next(event: FormEvent) {
    event.preventDefault()
    if (
      step === 1 &&
      (!sprint || !activeSprints.some((item) => item.id === sprint.id))
    )
      return toast.error('Choose an active campaign with available budget')
    if (step === 2 && !format) return toast.error('Choose a format')
    if (step === 3) {

      const parsed = creatorPostUrlSchema.safeParse(postUrl)
      if (!parsed.success) return toast.error(parsed.error.issues[0].message)
      if (
        !platform || !sprint?.terms.platforms.includes(platform)
      )
        return toast.error('The post link must match an accepted platform')
      const account = publishingAccount
      if (detected.handle && !account)
        return toast.error(`Connect @${detected.handle} in Accounts before submitting`)
      if (accountRequired && !account)
        return toast.error('Choose the publishing account')
      if (account && account.platform !== platform)
        return toast.error('The account must match the post platform')
      if (platform === 'tiktok') {
        if (TIKTOK_ANCHOR_REQUIREMENTS_ENABLED && anchorEligibility === null) return toast.error('Confirm this account’s follower range in Accounts first')
        if (anchorRequired && !account?.tiktokAnchorJoinedAt) { setAnchorSetupOpen(true); return toast.error('Join the Mogging project before submitting') }
        const handle = publishingTikTokHandle(parsed.data)
        if (handle && account?.handle?.toLowerCase() !== handle) return toast.error('Choose the TikTok account that published this post')
      }

    }
    if (step === 4 && !checkMinimumViews()) return
    if (step === 4 && (!recording || !physicalConfirmed || !views || !audience))
      return toast.error(
        'Add your recording and analytics, and confirm it was filmed with a second device',
      )
    changeStep(step + 1)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!checkMinimumViews()) return
    if (
      !recording ||
      !physicalConfirmed ||
      !sprint ||
      !format ||
      confirmed.length !== checklist.length
    )
      return
    const contentType = creatorVideoContentType(recording)
    if (!contentType) return toast.error('Choose a supported recording')
    setBusy(true)
    try {
      const intent = await apiPost<{
        key: string
        publicUrl: string
        uploadUrl: string
        method: 'PUT' | 'POST'
      }>('/api/creator/submission-analytics-upload-intent', {
        contentType,
        sizeBytes: recording.size,
      })
      await uploadAnalyticsRecording(
        intent,
        recording,
        contentType,
        setProgress,
      )
      await apiPost(existingSubmission ? `/api/creator/submissions/${encodeURIComponent(existingSubmission.id)}/rereview` : '/api/creator/submissions', {
        sprintId,
        formatId,
        requirementsConfirmed: true,
        tiktokAnchorLinked: anchorRequired && confirmed.includes(String(checklist.indexOf(TIKTOK_ANCHOR_REQUIREMENT))),
        socialAccountId: accountId || null,
        postUrl,
        analyticsVideoUrl: intent.publicUrl,
        analyticsPhysicalRecordingConfirmed: true,
        analyticsStorageKey: intent.key,
        analyticsContentType: contentType,
        analyticsSizeBytes: recording.size,
        viewCountThreshold: Number(views),
        usAudiencePercent: Number(audience),
      })
      toast.success(existingSubmission ? 'Updated analytics submitted for review' : 'Video submitted for review')
      await onSubmitted()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not submit video',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          if (!value) setRejectedViews(null)
          onOpenChange(value)
        }
      }}
    >
      <DialogContent className="creator-dialog creator-submission-dialog flex gap-0 max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="creator-dialog-header shrink-0 border-b border-zinc-100 px-5 py-5 text-left sm:px-7">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            {existingSubmission ? 'Update analytics' : 'Submit a post'}
          </p>
          <DialogTitle ref={headingRef} tabIndex={-1} className="creator-dialog-title pr-7 text-xl outline-none">{titles[step - 1]}</DialogTitle>
          <DialogDescription>{existingSubmission ? CREATOR_REREVIEW_GUIDANCE : descriptions[step - 1]}</DialogDescription>
        </DialogHeader>
        {!data || !campaigns ? (
          <div className="min-h-48 p-8 text-center">
            {sprintError || dashboardError ? (
              <p role="alert">
                Could not load submission settings. Close and try again.
              </p>
            ) : (
              <Loader2 className="mx-auto animate-spin" />
            )}
          </div>
        ) : (
          <form
            onSubmit={step === 5 ? submit : next}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
              <AnimatedDialogPanel contentKey={step} motionStyle="swish" direction={stepDirection} contentClassName="grid gap-4">
                  {step === 1 ? (
                    <>
                      {activeSprints.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setSprintId(item.id)
                            setFormatId('')
                            setConfirmed([])
                            setAccountId('')
                          }}
                          className={cn(
                            'rounded-2xl border p-4 text-left',
                            sprintId === item.id
                              ? 'creator-choice-selected'
                              : 'border-zinc-200',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <strong className="text-sm">{item.name}</strong>
                            {sprintId === item.id ? (
                              <Check className="size-4 text-zinc-950" />
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {sprintMoney(item.budgetCents - item.usedCents)}{' '}
                            remaining · {sprintMoney(item.budgetCents)} total
                            budget
                          </p>
                          <p className="mt-3 text-sm text-zinc-500">
                            {item.description}
                          </p>
                        </button>
                      ))}
                      {!activeSprints.length ? (
                        <p className="py-8 text-center text-sm text-zinc-500">
                          No active campaigns with available budget. Check back
                          for new campaigns.
                        </p>
                      ) : null}
                      {sprint ? (
                        <Disclosure className="rounded-xl bg-[#f5f6f7] p-4">
                          <DisclosureSummary className="cursor-pointer text-sm font-semibold">
                            Rates & campaign rules
                          </DisclosureSummary><AccordionContent>
                          <p className="mt-3 text-xs text-zinc-500">
                            {campaignRegionRates(sprint.terms)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-4">
                            {sprint.terms.milestones.map((rate) => (
                              <div key={rate.views} className="text-sm">
                                <strong>{sprintMoney(rate.amountCents)}</strong>
                                <p className="text-xs text-zinc-500">
                                  {sprintViews(rate.views)} views
                                </p>
                              </div>
                            ))}
                          </div>
                          <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-zinc-500">
                            {creatorCampaignRules(sprint.terms.rules).map((rule) => (
                              <li key={rule}>{rule}</li>
                            ))}
                          </ul>
                        </AccordionContent></Disclosure>
                      ) : null}
                    </>
                  ) : null}
                  {step === 2 ? (
                    <>
                      {sprint?.terms.formats
                        .filter((item) => item.active)
                        .map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'creator-selection border text-left',
                              formatId === item.id
                                ? 'creator-choice-selected'
                                : 'border-zinc-200',
                            )}
                          >
                            <button
                              type="button"
                              aria-pressed={formatId === item.id}
                              className="flex w-full items-center justify-between text-left"
                              onClick={() => {
                                setFormatId(item.id)
                                setConfirmed([])
                              }}
                            >
                              <span>
                                <strong className="text-sm">{item.name}</strong>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {item.shortDescription}
                                </p>
                              </span>
                              {formatId === item.id ? (
                                <Check className="ml-3 size-4 shrink-0 text-zinc-950" />
                              ) : null}
                            </button>
                            <Disclosure className="mt-3 text-sm">
                              <DisclosureSummary className="cursor-pointer text-zinc-950">
                                Read the brief
                              </DisclosureSummary><AccordionContent>
                              <div className="mt-3 space-y-3">
                                <Link href="/creator/cta-generator" target="_blank" className="inline-block text-xs font-medium text-zinc-950 underline underline-offset-4">
                                  Create mock reports in the CTA generator ↗
                                </Link>
                                <Link href="/creator/guide?topic=rules#video-requirements" target="_blank" className="block text-xs font-medium text-zinc-950 underline underline-offset-4">
                                  Celebrity edits and audience rules ↗
                                </Link>
                                {item.elements.map(creatorFormatElement).map((element) => (
                                  <p key={element.title}>
                                    <strong>{element.title}</strong>
                                    <br />
                                    <span className="text-zinc-500">
                                      {element.detail}
                                    </span>
                                  </p>
                                ))}
                                <ul className="list-inside list-disc space-y-2 text-zinc-500">
                                  {creatorCampaignRules(item.requirements).map((rule) => (
                                    <li key={rule}>{rule}</li>
                                  ))}
                                </ul>
                              </div>
                            </AccordionContent></Disclosure>
                          </div>
                        ))}
                    </>
                  ) : null}
                  {step === 3 ? (
                    <>
                      <div className="flex items-center justify-between gap-4 pb-1">
                        <div><p className="text-xs text-zinc-500">Selected format</p><p className="mt-1 text-sm font-semibold">{format?.name}</p></div>
                        <button type="button" onClick={() => changeStep(2)} className="min-h-11 text-xs font-medium text-zinc-500 underline underline-offset-4">Change</button>
                      </div>
                      <PublishedPostPlayer postUrl={postUrl} />
                      <div className="grid gap-2">
                      <Field label="Video URL"><input className={fieldClass} type="url" value={postUrl} onChange={event => { setPostUrl(event.target.value); setAccountId(''); setConfirmed([]) }} placeholder="Paste your TikTok or Instagram link" required /></Field>
                      {((detected.handle && !publishingAccount) || (platform && !detected.candidates.length)) ? <div aria-live="polite">
                        {detected.handle && !publishingAccount ? <p className="text-xs leading-5 text-amber-700">This post is from @{detected.handle}. <Link href="/creator/accounts" className="font-semibold underline">Connect this account</Link> before submitting.</p> : platform && !detected.candidates.length ? <p className="text-xs text-amber-700"><Link href="/creator/accounts" className="underline">Connect a {platform} account</Link> before submitting.</p> : null}
                      </div> : null}
                      {!detected.handle && detected.candidates.length > 1 ? <div className="mt-4"><Field label="Published from" hint="This link doesn’t include a username. Choose the posting account."><select className={fieldClass} value={accountId} onChange={event => { setAccountId(event.target.value); setConfirmed([]) }} required={accountRequired}><option value="">Choose account</option>{detected.candidates.map(item => <option key={item.id} value={item.id}>{creatorAccountLabel(item)}</option>)}</select></Field></div> : null}
                      {platform && !sprint?.terms.platforms.includes(platform) ? <p role="alert" className="mt-3 text-xs text-red-600">This campaign does not accept {platform} posts.</p> : null}
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-1 text-sm text-zinc-600">
                      <span className="relative grid size-[18px] shrink-0 place-items-center">
                        <input type="checkbox" checked={usedRefCode} onChange={event => setUsedRefCode(event.target.checked)} className="peer size-[18px] appearance-none rounded-[5px] border border-zinc-300 bg-white checked:border-black checked:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
                        <Check aria-hidden="true" className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100" strokeWidth={2.5} />
                      </span>
                      <span>Did you use a ref code <span className="text-zinc-400">(optional)</span></span>
                    </label>
                      </div>
                      {TIKTOK_ANCHOR_REQUIREMENTS_ENABLED && platform === 'tiktok' && publishingAccount ? (
                        <div className="rounded-xl bg-zinc-100 p-4 text-sm leading-6">
                          {anchorEligibility === null ? <><strong>Confirm your follower range first.</strong><p className="text-zinc-600">We need it to show the requirements for this publishing account.</p><Link href="/creator/accounts" className="font-medium text-zinc-950 underline underline-offset-4">Update in Accounts</Link></> : anchorRequired ? <><strong>TikTok anchor required for this account</strong><p className="mt-1 text-zinc-600">Accept the Mogging TikTok One project before posting. On TikTok’s posting screen, choose Content disclosure → Disclose post content → Branded content → Link project → Mogging.</p>{publishingAccount.tiktokAnchorJoinedAt ? <p className="mt-2 text-xs font-medium text-zinc-950">Joining confirmed · Link the anchor on this post and every new TikTok submission.</p> : <button type="button" onClick={() => setAnchorSetupOpen(true)} className="mt-2 min-h-11 font-medium text-zinc-950 underline underline-offset-4">Join project to continue →</button>}</> : <p className="text-zinc-600">This account has fewer than 1,000 followers. The TikTok anchor requirement does not apply.</p>}
                        </div>
                      ) : null}

                    </>
                  ) : null}
                  {step === 4 ? (
                    <>
                      <aside role="note" className="creator-info-bubble">
                        <Info aria-hidden="true" className="size-8 shrink-0" fill="white" stroke="#202123" strokeWidth={1.7} />
                        <p><strong>Film your analytics with a second device.</strong> Show your handle, post, views, traffic sources and all audience locations in one unedited take. No screenshots or screen recordings.</p>
                      </aside>
                      <div className="grid items-start gap-4 sm:grid-cols-2">
                        <Field label={<span className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2"><Eye aria-hidden="true" className="size-4 shrink-0" />Views shown in recording</span><span title="Use the total views visible in your analytics recording"><Info aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" /></span></span>}>
                          <input
                            className={fieldClass}
                            type="number"
                            min="0"
                            max="2000000000"
                            step="1"
                            value={views}
                            onChange={(e) => setViews(e.target.value)}
                            required
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Submit as soon as you reach 20,000 views. Request rereview at each new milestone.
                          </p>
                        </Field>
                        <div className="creator-field-label">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="submission-tier-one-audience" className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#3a3a3c]"><Users aria-hidden="true" className="size-4 shrink-0" />Combined Tier 1 audience (%)</label>
                            <CampaignRegionHelp monochrome />
                          </div>
                          <input
                            id="submission-tier-one-audience"
                            className={fieldClass}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={audience}
                            onChange={(e) => setAudience(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <input
                        ref={fileRef}
                        className="sr-only"
                        type="file"
                        accept={CREATOR_VIDEO_ACCEPT}
                        aria-label="Analytics recording"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (!file) return
                          if (
                            !file.size ||
                            !creatorVideoContentType(file) ||
                            file.size > MAX_CREATOR_ANALYTICS_VIDEO_BYTES
                          )
                            return toast.error(
                              'Choose a supported, non-empty recording up to 250 MB',
                            )
                          setRecording(file)
                          setPhysicalConfirmed(false)
                        }}
                      />
                      {recording ? <AnalyticsRecordingPreview file={recording} onChoose={() => fileRef.current?.click()} /> : <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-28 items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-sm">
                        <UploadCloud className="size-5 shrink-0 text-zinc-950" />
                        <span>Choose recording<span className="mt-1 block text-xs text-zinc-400">MP4, MOV, M4V, WebM · up to 250 MB</span></span>
                      </button>}
                      <label className="flex items-start gap-3 text-sm text-zinc-600">
                        <input
                          type="checkbox"
                          checked={physicalConfirmed}
                          onChange={(e) =>
                            setPhysicalConfirmed(e.target.checked)
                          }
                          className="mt-1 size-4 shrink-0 accent-black"
                        />
                        This unedited physical recording was filmed with a
                        second device and shows this post’s analytics and
                        audience locations.
                      </label>
                      {sprint && views && audience ? (
                        <p className="text-sm text-zinc-500">
                          Estimated earnings:{' '}
                          <strong className="text-zinc-900">
                            {sprintMoney(
                              sprintPayoutCents(
                                sprint.terms,
                                Number(views),
                                Number(audience),
                              ),
                            )}
                          </strong>{' '}
                          · subject to review and remaining budget
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  {step === 5 ? (
                    <>
                      <dl className="grid gap-3 rounded-2xl bg-[#f5f6f7] p-4 text-sm">
                        {[
                          ['Campaign', sprint?.name],
                          ['Format', format?.name],
                          ['Platform', platform],
                          ['Video', postUrl],
                          ...(usedRefCode ? [['Ref code', 'Used']] : []),
                        ].map(([name, value]) => (
                          <div
                            className="flex items-start justify-between gap-4"
                            key={name}
                          >
                            <dt className="shrink-0 text-zinc-500">{name}</dt>
                            <dd className="break-all text-right">{name === 'Platform' && platform ? <span className="inline-flex items-center gap-2"><span>{platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white"><SocialPlatformLogo platform={platform} className="size-3.5" /></span></span> : value}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Confirm before submitting</p>
                        {canCheckAll ? <button type="button" disabled={!checklist.length || confirmed.length === checklist.length} onClick={() => setConfirmed(checklist.map((_, i) => String(i)))} className="min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:cursor-default disabled:text-zinc-400 disabled:hover:bg-transparent">Check all</button> : null}
                      </div>
                      {checklist.map((rule, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-3 text-sm leading-6 text-zinc-600"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-black"
                            checked={confirmed.includes(String(i))}
                            onChange={(e) =>
                              setConfirmed((current) =>
                                e.target.checked
                                  ? [...current, String(i)]
                                  : current.filter(
                                      (item) => item !== String(i),
                                    ),
                              )
                            }
                          />
                          {rule}
                        </label>
                      ))}
                      <p className="text-xs text-zinc-500">
                        Your campaign terms are saved with this submission.
                        Reviewed earnings appear in Money.
                      </p>
                    </>
                  ) : null}
              </AnimatedDialogPanel>
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-100 p-4 sm:px-7">
              <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  step === (existingSubmission ? 4 : 1)
                    ? onOpenChange(false)
                    : changeStep(step - 1)
                }
              >
                {step === (existingSubmission ? 4 : 1) ? (
                  'Cancel'
                ) : (
                  <>
                    <ChevronLeft className="size-4" />
                    Back
                  </>
                )}
              </Button>
              <Button
                disabled={
                  busy ||
                  (step === 1 && !sprint) ||
                  (step === 2 && !format) ||
                  (step === 5 && confirmed.length !== checklist.length)
                }
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading {progress}%
                  </>
                ) : step === 5 ? (
                  existingSubmission ? 'Submit for review' : 'Submit post'
                ) : (
                  'Continue'
                )}
              </Button>
              </div>
              <ol aria-label={`Submission progress: step ${visibleStep} of ${stepLabels.length}`} className="flex h-3 items-center justify-center gap-1.5">
                {stepLabels.map((label, index) => <li key={label} aria-current={index + 1 === visibleStep ? 'step' : undefined} className="flex items-center">
                  <span aria-hidden="true" className={cn('block h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none', index + 1 === visibleStep ? 'w-5 bg-black' : index + 1 < visibleStep ? 'w-1.5 bg-black/40' : 'w-1.5 bg-zinc-200')} />
                  <span className="sr-only">{label}{index + 1 < visibleStep ? ', complete' : index + 1 === visibleStep ? ', current step' : ''}</span>
                </li>)}
              </ol>
            </div>
          </form>
        )}
      </DialogContent>
      <MinimumViewsDialog
        views={rejectedViews}
        onClose={() => setRejectedViews(null)}
      />
    </Dialog>
    {publishingAccount && anchorRequired && anchorSetupOpen ? <TikTokAccountDialog key={publishingAccount.id} account={publishingAccount} mode="anchor" open onOpenChange={setAnchorSetupOpen} onSaved={() => refreshDashboard()} /> : null}
    </>
  )
}
