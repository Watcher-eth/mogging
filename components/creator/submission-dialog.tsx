import { MinimumViewsDialog } from './minimum-views-dialog'
import Link from 'next/link'
import { campaignRegionRates } from '@/lib/creator/sprint-defaults'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Check,
  ChevronLeft,
  FileVideo,
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
import { CreatorStepper } from './creator-stepper'
import { AnalyticsVerificationHelp } from './content-guidelines'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { creatorAccountLabel, type CreatorDashboard, type CreatorSubmission } from './types'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  MINIMUM_SUBMISSION_VIEWS,
  creatorPostPlatform,
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
  sprintMoney,
  sprintViews,
  sprintPayoutCents,
  type CreatorSprint,
} from '@/lib/creator/sprints'
import { cn } from '@/lib/utils'
const labels = ['Campaign', 'Format', 'Link', 'Analytics', 'Review']
const titles = [
  'Pick a campaign',
  'Pick a format',
  'Add your published video or slideshow',
  'Verify your analytics',
  'Review and submit',
]
const descriptions = [
  'Choose the campaign this video or slideshow should earn against.',
  'Read the brief, then choose the structure you followed.',
  'Link the public post and the account you published from.',
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
  const { data, error: dashboardError } = useSWR<CreatorDashboard>(
    open ? '/api/creator' : null,
    apiGet,
  )
  const [step, setStep] = useState(existingSubmission ? 4 : 1)
  const [sprintId, setSprintId] = useState(existingSubmission?.sprintId || initialSprintId || '')
  const [formatId, setFormatId] = useState(existingSubmission?.formatId || '')
  const [accountId, setAccountId] = useState('')
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const [postUrl, setPostUrl] = useState(existingSubmission?.postUrl || '')
  const [recording, setRecording] = useState<File | null>(null)
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false)
  const [views, setViews] = useState(existingSubmission?.viewCountThreshold?.toString() || '')
  const [rejectedViews, setRejectedViews] = useState<number | null>(null)
  const [audience, setAudience] = useState(existingSubmission?.usAudiencePercent?.toString() || '')
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const reduced = useReducedMotion()
  const fileRef = useRef<HTMLInputElement>(null)
  const campaign = campaigns?.sprints.find((item) => item.id === sprintId)
  const sprint = campaign && { ...campaign, terms: existingSubmission?.sprintTerms || campaign.terms }
  const selectedPlatform = sprint?.terms.platforms.includes(platform)
    ? platform
    : sprint?.terms.platforms[0] || platform
  const format = sprint?.terms.formats.find((item) => item.id === formatId)
  const activeSprints =
    campaigns?.sprints.filter(
      (item) =>
        sprintPhase(item) === 'active' && item.usedCents < item.budgetCents,
    ) || []
  useEffect(() => {
    if (initialSprintId) setSprintId(initialSprintId)
  }, [initialSprintId])
  const checklist =
    format && sprint
      ? [
          ...format.requirements,
          ...sprint.terms.rules,
          ...format.notAllowed.map((item) => `My post avoids: ${item}`),
        ]
      : []
  const accountRequired =
    data?.featureFlags.creatorAccountRequiredForSubmission || false
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
    if (step === 2) {
      if (!format) return toast.error('Choose a format')
      setPlatform(selectedPlatform)
    }
    if (step === 3) {
      const parsed = creatorPostUrlSchema.safeParse(postUrl)
      if (!parsed.success) return toast.error(parsed.error.issues[0].message)
      if (
        creatorPostPlatform(parsed.data) !== platform ||
        !sprint?.terms.platforms.includes(platform)
      )
        return toast.error('The post link must match an accepted platform')
      const account = data?.socialAccounts.find((item) => item.id === accountId)
      if (accountRequired && !account)
        return toast.error('Choose the publishing account')
      if (account && account.platform !== platform)
        return toast.error('The account must match the post platform')

    }
    if (step === 4 && !checkMinimumViews()) return
    if (step === 4 && (!recording || !physicalConfirmed || !views || !audience))
      return toast.error(
        'Add your recording and analytics, and confirm it was filmed with a second device',
      )
    setStep((current) => current + 1)
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
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          if (!value) setRejectedViews(null)
          onOpenChange(value)
        }
      }}
    >
      <DialogContent className="creator-dialog flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-zinc-100 px-5 py-5 text-left sm:px-7">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            {existingSubmission ? 'Update analytics' : 'Submit a post'} · Step {existingSubmission ? step - 3 : step} of {existingSubmission ? 2 : 5}
          </p>
          <DialogTitle className="pr-7 text-xl">{titles[step - 1]}</DialogTitle>
          <DialogDescription>{descriptions[step - 1]}</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-4 pt-4">
          <CreatorStepper step={existingSubmission ? step - 3 : step} labels={existingSubmission ? labels.slice(3) : labels} />
        </div>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{
                    duration: reduced ? 0 : 0.16,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="grid gap-4"
                >
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
                            setPlatform(item.terms.platforms[0])
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
                              <Check className="size-4 text-[#00A8EF]" />
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
                        <details className="rounded-xl bg-[#f5f6f7] p-4">
                          <summary className="cursor-pointer text-sm font-semibold">
                            Rates & campaign rules
                          </summary>
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
                            {sprint.terms.rules.map((rule) => (
                              <li key={rule}>{rule}</li>
                            ))}
                          </ul>
                        </details>
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
                              'rounded-2xl border p-4',
                              formatId === item.id
                                ? 'creator-choice-selected'
                                : 'border-zinc-200',
                            )}
                          >
                            <button
                              type="button"
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
                                <Check className="ml-3 size-4 shrink-0 text-[#00A8EF]" />
                              ) : null}
                            </button>
                            <details className="mt-3 text-sm">
                              <summary className="cursor-pointer text-[#00A8EF]">
                                Read the brief
                              </summary>
                              <div className="mt-3 space-y-3">
                                <Link href="/creator/cta-generator" target="_blank" className="inline-block text-xs font-medium text-[#00A8EF] underline underline-offset-4">
                                  Create mock reports in the CTA generator ↗
                                </Link>
                                <Link href="/creator/guide?topic=rules#video-requirements" target="_blank" className="block text-xs font-medium text-[#00A8EF] underline underline-offset-4">
                                  Celebrity edits and audience rules ↗
                                </Link>
                                {item.elements.map((element) => (
                                  <p key={element.title}>
                                    <strong>{element.title}</strong>
                                    <br />
                                    <span className="text-zinc-500">
                                      {element.detail}
                                    </span>
                                  </p>
                                ))}
                                <ul className="list-inside list-disc space-y-2 text-zinc-500">
                                  {item.requirements.map((rule) => (
                                    <li key={rule}>{rule}</li>
                                  ))}
                                </ul>
                              </div>
                            </details>
                          </div>
                        ))}
                    </>
                  ) : null}
                  {step === 3 ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {sprint?.terms.platforms.map((item) => (
                          <button
                            key={item}
                            type="button"
                            className={cn(
                              'flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm capitalize',
                              platform === item
                                ? 'creator-choice-selected'
                                : 'border-zinc-200',
                            )}
                            onClick={() => {
                              setPlatform(item)
                              setAccountId('')
                            }}
                          >
                            <SocialPlatformLogo
                              platform={item}
                              className="size-4"
                            />
                            {item}
                          </button>
                        ))}
                      </div>
                      <Field
                        label="Published from"
                        hint={accountRequired ? 'Required' : 'Optional'}
                      >
                        <select
                          className={fieldClass}
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                          required={accountRequired}
                        >
                          <option value="">Choose account</option>
                          {data.socialAccounts
                            .filter((item) => item.platform === platform)
                            .map((item) => (
                              <option value={item.id} key={item.id}>
                                {creatorAccountLabel(item)}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Video URL">
                        <input
                          className={fieldClass}
                          type="url"
                          value={postUrl}
                          onChange={(e) => setPostUrl(e.target.value)}
                          placeholder={
                            platform === 'tiktok'
                              ? 'https://www.tiktok.com/@handle/video/…'
                              : 'https://www.instagram.com/reel/…'
                          }
                          required
                        />
                      </Field>

                    </>
                  ) : null}
                  {step === 4 ? (
                    <>
                      <div className="rounded-2xl bg-[#f5f6f7] p-4 text-sm leading-6">
                        <strong>
                          Film your analytics with a second device.
                        </strong>
                        <p className="text-zinc-500">
                          Show the physical screen, account handle, published
                          post, views, traffic sources and complete audience
                          locations in one continuous take. Screenshots, native
                          screen recordings, cuts and edited analytics are not
                          accepted.
                        </p>
                        <AnalyticsVerificationHelp />
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
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex min-h-28 items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-sm"
                      >
                        {recording ? (
                          <FileVideo className="size-5 text-[#00A8EF]" />
                        ) : (
                          <UploadCloud className="size-5 text-[#00A8EF]" />
                        )}
                        <span className="min-w-0 break-all">
                          {recording
                            ? `${recording.name} · ${(recording.size / 1024 / 1024).toFixed(1)} MB`
                            : 'Choose recording · MP4, MOV, M4V, WebM · up to 250 MB'}
                        </span>
                      </button>
                      <label className="flex items-start gap-3 text-sm text-zinc-600">
                        <input
                          type="checkbox"
                          checked={physicalConfirmed}
                          onChange={(e) =>
                            setPhysicalConfirmed(e.target.checked)
                          }
                          className="mt-1 size-4 shrink-0 accent-[#00A8EF]"
                        />
                        This unedited physical recording was filmed with a
                        second device and shows this post’s analytics and
                        audience locations.
                      </label>
                      <div className="grid items-start gap-4 sm:grid-cols-2">
                        <Field label="Views shown in recording">
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
                            At least 20,000 views are required to submit.
                          </p>
                        </Field>
                        <Field label="Combined Tier 1 audience (%)">
                          <input
                            className={fieldClass}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={audience}
                            onChange={(e) => setAudience(e.target.value)}
                            required
                          />
                        </Field>
                      </div>
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
                          ['Analytics', recording?.name],
                        ].map(([name, value]) => (
                          <div
                            className="flex items-start justify-between gap-4"
                            key={name}
                          >
                            <dt className="shrink-0 text-zinc-500">{name}</dt>
                            <dd className="break-all text-right">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                        Confirm before submitting
                      </p>
                      {checklist.map((rule, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-3 text-sm leading-6 text-zinc-600"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-[#00A8EF]"
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
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-zinc-100 p-4 sm:px-7">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  step === (existingSubmission ? 4 : 1)
                    ? onOpenChange(false)
                    : setStep((current) => current - 1)
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
          </form>
        )}
      </DialogContent>
      <MinimumViewsDialog
        views={rejectedViews}
        onClose={() => setRejectedViews(null)}
      />
    </Dialog>
  )
}
