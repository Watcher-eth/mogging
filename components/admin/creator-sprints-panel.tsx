import Link from 'next/link'
import * as Tabs from '@radix-ui/react-tabs'
import {
  SprintBudget,
  SprintStatus,
} from '@/components/creator/campaign-summary'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import type { AdminSubmission } from '@/components/admin/creator-types'
import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Pencil,
  Search,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, fieldClass } from '@/components/creator/creator-shell'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import {
  sprintInputSchema,
  sprintMoney,
  sprintPhase,
  type CreatorSprint,
  type SprintTerms,
} from '@/lib/creator/sprints'
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
export function CreatorSprintsPanel({
  submissions,
  onSelectSubmission,
}: {
  submissions: AdminSubmission[]
  onSelectSubmission: (submission: AdminSubmission) => void
}) {
  const { data, error, isLoading, mutate } = useSWR<{
    sprints: CreatorSprint[]
  }>('/api/admin/creator/sprints', apiGet, { refreshInterval: 30_000 })
  const [editing, setEditing] = useState<CreatorSprint | 'new' | null>(null)
  const [phase, setPhase] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState('all')
  const campaigns = data?.sprints || []
  const selected = campaigns.find((campaign) => campaign.id === selectedId)
  const visible = campaigns.filter(
    (campaign) =>
      (phase === 'all' || sprintPhase(campaign) === phase) &&
      `${campaign.name} ${campaign.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const campaignSubmissions = submissions.filter(
    (submission) => submission.sprintId === selectedId,
  )
  const filteredSubmissions = campaignSubmissions.filter(
    (submission) =>
      submissionStatus === 'all' ||
      (submissionStatus === 'review'
        ? ['pending', 'in_review'].includes(submission.status)
        : submission.status === submissionStatus),
  )
  const filters = [
    { value: 'all', label: 'All campaigns' },
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Drafts' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'past', label: 'Ended' },
  ]

  return (
    <>
      {selected ? (
        <>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="size-4" />
            All campaigns
          </button>
          <section className="creator-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {selected.name}
                  </h2>
                  <SprintStatus sprint={selected} />
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                  {selected.description}
                </p>
              </div>
              <Button variant="outline" onClick={() => setEditing(selected)}>
                <Pencil className="size-4" />
                Edit campaign
              </Button>
            </div>
            <div className="mt-6 grid gap-6 border-t border-zinc-100 pt-5 sm:grid-cols-2">
              <SprintBudget sprint={selected} />
              <div className="flex flex-col justify-center gap-2 text-sm text-zinc-500">
                <span>{campaignDates(selected)}</span>
                <span>
                  {sprintMoney(
                    Math.max(0, selected.budgetCents - selected.usedCents),
                  )}{' '}
                  remaining ·{' '}
                  {
                    selected.terms.formats.filter((format) => format.active)
                      .length
                  }{' '}
                  active formats
                </span>
                {selected.status !== 'draft' ? (
                  <Link
                    href={`/creator/sprints?id=${selected.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#00A8EF]"
                  >
                    View creator brief <ArrowUpRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
          <section className="mt-7" aria-label="Campaign submissions">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">
                  Submissions{' '}
                  <span className="ml-1 text-zinc-400">
                    {campaignSubmissions.length}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Open a post to review its evidence, views, and earnings.
                </p>
              </div>
              <select
                aria-label="Filter submissions"
                value={submissionStatus}
                onChange={(event) => setSubmissionStatus(event.target.value)}
                className={`${fieldClass} !w-auto`}
              >
                <option value="all">All submissions</option>
                <option value="review">Needs review</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {filteredSubmissions.length ? (
              <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
                {filteredSubmissions.map((submission) => (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => onSelectSubmission(submission)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-zinc-50 sm:p-5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-50">
                      <SocialPlatformLogo
                        platform={
                          submission.platform === 'instagram'
                            ? 'instagram'
                            : 'tiktok'
                        }
                        className="size-5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {submission.title}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {submission.creatorName}
                        {submission.socialHandle
                          ? ` · @${submission.socialHandle}`
                          : ''}
                      </span>
                      <span className="mt-1 block text-xs capitalize text-zinc-500">
                        {submission.status.replaceAll('_', ' ')}
                        {submission.unreadMessages
                          ? ` · ${submission.unreadMessages} unread`
                          : ''}
                      </span>
                    </span>
                    <span className="hidden text-right text-xs text-zinc-500 sm:block">
                      <span className="block font-medium tabular-nums text-zinc-900">
                        {submission.adminViewCountThreshold?.toLocaleString() ??
                          '—'}{' '}
                        verified views
                      </span>
                      <span className="mt-1 block">
                        {submission.approvedAmountCents == null
                          ? 'Not awarded'
                          : sprintMoney(submission.approvedAmountCents)}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-[#00A8EF]" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="creator-surface p-10 text-center">
                <p className="text-sm font-medium">
                  No {submissionStatus === 'all' ? '' : 'matching '}submissions
                  yet
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  {submissionStatus === 'all'
                    ? 'Posts submitted to this campaign will appear here.'
                    : 'Choose another status to see more posts.'}
                </p>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">
              {campaigns.length} campaigns ·{' '}
              {
                campaigns.filter(
                  (campaign) => sprintPhase(campaign) === 'active',
                ).length
              }{' '}
              active
            </p>
            <Button onClick={() => setEditing('new')} className="rounded-full">
              <Plus className="size-4" />
              New campaign
            </Button>
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Campaign status"
              className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-[#f5f6f7] p-1"
            >
              {filters.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  aria-pressed={phase === filter.value}
                  onClick={() => setPhase(filter.value)}
                  className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-medium transition-colors ${phase === filter.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
              <input
                type="search"
                aria-label="Search campaigns"
                placeholder="Search campaigns"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={`${fieldClass} pl-9`}
              />
            </div>
          </div>
          {isLoading ? (
            <div className="grid min-h-56 place-items-center" role="status">
              <Loader2 className="size-5 animate-spin text-zinc-400" />
              <span className="sr-only">Loading campaigns</span>
            </div>
          ) : error ? (
            <p role="alert" className="admin-notice">
              Could not load campaigns.{' '}
              <button className="underline" onClick={() => void mutate()}>
                Try again
              </button>
            </p>
          ) : visible.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((campaign) => {
                const pending =
                  campaign.counts.pending + campaign.counts.in_review
                const total = Object.values(campaign.counts).reduce(
                  (sum, count) => sum + count,
                  0,
                )
                return (
                  <article
                    key={campaign.id}
                    className="creator-surface flex flex-col p-5 sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <SprintStatus sprint={campaign} />
                      <div className="flex gap-2">
                        {campaign.terms.platforms.map((platform) => (
                          <SocialPlatformLogo
                            key={platform}
                            platform={platform}
                            className="size-4"
                          />
                        ))}
                      </div>
                    </div>
                    <h2 className="mt-4 text-lg font-semibold tracking-tight">
                      {campaign.name}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">
                      {campaign.description}
                    </p>
                    <p className="mt-3 text-xs text-zinc-400">
                      {campaignDates(campaign)}
                    </p>
                    <div className="my-5 border-y border-zinc-100 py-4">
                      <SprintBudget sprint={campaign} />
                    </div>
                    <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                      <span>
                        <strong className="font-medium text-zinc-900">
                          {total}
                        </strong>{' '}
                        submissions
                      </span>
                      <span className={pending ? 'text-amber-700' : ''}>
                        <strong className="font-medium">{pending}</strong> need
                        review
                      </span>
                      <span>
                        {campaign.counts.approved + campaign.counts.paid}{' '}
                        approved
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setEditing(campaign)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(campaign.id)
                          setSubmissionStatus('all')
                        }}
                        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00A8EF]"
                      >
                        View submissions
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="creator-surface p-10 text-center">
              <h2 className="text-sm font-semibold">
                {campaigns.length
                  ? 'No matching campaigns'
                  : 'Your first campaign starts here'}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {campaigns.length
                  ? 'Try another status or search term.'
                  : 'Set a budget, add a creative brief, and publish when you’re ready.'}
              </p>
              {campaigns.length ? (
                <button
                  className="mt-4 text-sm font-semibold text-[#00A8EF]"
                  onClick={() => {
                    setPhase('all')
                    setQuery('')
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-24px)] max-w-3xl gap-0 overflow-hidden"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {editing ? (
            <SprintEditor
              key={typeof editing === 'string' ? editing : editing.id}
              sprint={editing === 'new' ? undefined : editing}
              onSaved={async () => {
                await mutate()
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function campaignDates(campaign: CreatorSprint) {
  const format = (date: string) =>
    new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  return `${format(campaign.startsAt)} – ${format(campaign.endsAt)}`
}

function SprintEditor({
  sprint,
  onSaved,
  onCancel,
}: {
  sprint?: CreatorSprint
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(sprint?.name || '')
  const [description, setDescription] = useState(sprint?.description || '')
  const [budget, setBudget] = useState(
    sprint ? String(sprint.budgetCents / 100) : '',
  )
  const [status, setStatus] = useState(sprint?.status || 'draft')
  const localDate = (value: string) => {
    const date = new Date(value)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  }
  const [starts, setStarts] = useState(
    localDate(sprint?.startsAt || new Date().toISOString()),
  )
  const [ends, setEnds] = useState(
    localDate(
      sprint?.endsAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    ),
  )
  const [terms, setTerms] = useState<SprintTerms>(
    () => sprint?.terms || defaultCreatorSprintTerms(),
  )
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState('details')
  const patch = (change: Partial<SprintTerms>) =>
    setTerms((current) => ({ ...current, ...change }))
  async function save(event: FormEvent) {
    event.preventDefault()
    if (
      !Number.isFinite(Date.parse(starts)) ||
      !Number.isFinite(Date.parse(ends))
    ) {
      setSection('details')
      return toast.error('Choose a valid start and end date')
    }
    const parsed = sprintInputSchema.safeParse({
      id: sprint?.id,
      name,
      description,
      status,
      budgetCents: Math.round(Number(budget) * 100),
      startsAt: new Date(starts).toISOString(),
      endsAt: new Date(ends).toISOString(),
      terms,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const key = issue.path[1]
      const targetSection =
        issue.path[0] !== 'terms'
          ? 'details'
          : ['formats', 'rules'].includes(String(key))
            ? 'content'
            : 'payouts'
      setSection(targetSection)
      return toast.error(`Check ${targetSection}: ${issue.message}`)
    }
    setBusy(true)
    try {
      await apiPost('/api/admin/creator/sprints', parsed.data)
      toast.success('Campaign saved')
      await onSaved()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not save campaign',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={save}
      noValidate
      className="flex max-h-[calc(100dvh-24px)] min-h-0 flex-col"
    >
      <DialogHeader className="shrink-0 px-6 pb-4 pt-6 pr-14 text-left">
        <DialogTitle>{sprint ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        <DialogDescription>
          New terms apply to future submissions. Existing submissions retain
          their saved terms and earnings.
        </DialogDescription>
      </DialogHeader>
      <Tabs.Root
        value={section}
        onValueChange={setSection}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List
          aria-label="Campaign editor"
          className="mx-6 mb-4 grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1"
        >
          {[
            ['details', 'Details'],
            ['payouts', 'Payouts'],
            ['content', 'Content'],
          ].map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="min-h-10 rounded-lg text-sm font-medium text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 focus-visible:outline-[#00A8EF]"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <fieldset
          disabled={busy}
          className="min-h-0 min-w-0 overflow-y-auto px-6 pb-6"
        >
          <Tabs.Content value="details" className="grid gap-5">
            <p className="text-xs leading-5 text-zinc-500">
              Set the campaign’s name, budget, and publishing schedule. Dates
              use your local time.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name">
                <input
                  required
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Status">
                <select
                  className={fieldClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="ended">Ended</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                required
                className={`${fieldClass} min-h-20 py-3`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Total budget (USD)">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={fieldClass}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </Field>
              <Field label="Starts (your local time)">
                <input
                  required
                  type="datetime-local"
                  className={fieldClass}
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                />
              </Field>
              <Field label="Ends (your local time)">
                <input
                  required
                  type="datetime-local"
                  className={fieldClass}
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </Field>
            </div>
          </Tabs.Content>
          <Tabs.Content value="payouts" className="grid gap-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Payout milestones</h3>
              <p className="mb-4 text-xs leading-5 text-zinc-500">
                Each milestone is the total payout for a post, not an additional
                reward. Amounts below are the maximum rates.
              </p>
              {terms.milestones.some((rate) => rate.audienceRates) ? (
                <p className="mb-3 text-xs text-zinc-500">
                  Existing audience tiers are retained. Editing a maximum payout
                  scales its lower tiers; changing audience limits switches to
                  proportional payouts.
                </p>
              ) : null}
              <div className="space-y-2">
                {terms.milestones.map((rate, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
                  >
                    <Field label="Views">
                      <input
                        required
                        type="number"
                        min="1"
                        className={fieldClass}
                        value={rate.views}
                        onChange={(e) =>
                          patch({
                            milestones: terms.milestones.map((row, index) =>
                              index === i
                                ? { ...row, views: Number(e.target.value) }
                                : row,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Total payout (USD)">
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        className={fieldClass}
                        value={rate.amountCents / 100}
                        onChange={(e) =>
                          patch({
                            milestones: terms.milestones.map((row, index) =>
                              index === i
                                ? {
                                    ...row,
                                    amountCents: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                    audienceRates: row.audienceRates?.map(
                                      (rate) => ({
                                        ...rate,
                                        amountCents: Math.round(
                                          (rate.amountCents *
                                            Number(e.target.value) *
                                            100) /
                                            row.amountCents,
                                        ),
                                      }),
                                    ),
                                  }
                                : row,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Remove milestone"
                      disabled={terms.milestones.length === 1}
                      onClick={() =>
                        patch({
                          milestones: terms.milestones.filter(
                            (_, index) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={terms.milestones.length >= 12}
                onClick={() =>
                  patch({
                    milestones: [
                      ...terms.milestones,
                      {
                        views: terms.milestones.at(-1)!.views * 2,
                        amountCents: terms.milestones.at(-1)!.amountCents * 2,
                      },
                    ],
                  })
                }
              >
                Add milestone
              </Button>
            </section>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Minimum Tier 1 audience %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className={fieldClass}
                  value={terms.minimumTier1Percent}
                  onChange={(e) =>
                    patch({
                      minimumTier1Percent: Number(e.target.value),
                      milestones: terms.milestones.map((row) => ({
                        ...row,
                        audienceRates: undefined,
                      })),
                    })
                  }
                />
              </Field>
              <Field label="Audience % for maximum rate">
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  className={fieldClass}
                  value={terms.maximumTier1Percent}
                  onChange={(e) =>
                    patch({
                      maximumTier1Percent: Number(e.target.value),
                      milestones: terms.milestones.map((row) => ({
                        ...row,
                        audienceRates: undefined,
                      })),
                    })
                  }
                />
              </Field>
                </div>
          </Tabs.Content>
          <Tabs.Content value="content" className="grid gap-5">
            <p className="text-xs leading-5 text-zinc-500">
              Choose accepted platforms, then define campaign rules and the
              formats creators can submit.
            </p>
            <div className="flex gap-5">
              {(['tiktok', 'instagram'] as const).map((platform) => (
                <label
                  key={platform}
                  className="flex items-center gap-2 text-sm capitalize"
                >
                  <input
                    type="checkbox"
                    checked={terms.platforms.includes(platform)}
                    onChange={(e) =>
                      patch({
                        platforms: e.target.checked
                          ? [...terms.platforms, platform]
                          : terms.platforms.filter((item) => item !== platform),
                      })
                    }
                  />
                  {platform}
                </label>
              ))}
            </div>
            <Field label="Campaign rules" hint="One per line">
              <textarea
                className={`${fieldClass} min-h-28 py-3`}
                value={terms.rules.join('\n')}
                onChange={(e) => patch({ rules: e.target.value.split('\n') })}
                onBlur={() => patch({ rules: lines(terms.rules.join('\n')) })}
              />
            </Field>
            <section className="border-t pt-5">
              <h3 className="font-semibold">Creative briefs</h3>
              {terms.formats.map((format, i) => {
                const change = (value: Partial<typeof format>) =>
                  patch({
                    formats: terms.formats.map((item, index) =>
                      index === i ? { ...item, ...value } : item,
                    ),
                  })
                return (
                  <details
                    className="mt-3 rounded-2xl border border-zinc-200 bg-white"
                    key={format.id}
                    open={terms.formats.length === 1 || undefined}
                  >
                    <summary className="cursor-pointer p-4 text-sm font-semibold">
                      {format.name || `New format ${i + 1}`}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {format.active ? 'Active' : 'Hidden'}
                      </span>
                    </summary>
                    <div className="grid gap-4 border-t border-zinc-100 p-4">
                      <div className="flex justify-between">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={format.active}
                            onChange={(event) =>
                              change({ active: event.target.checked })
                            }
                          />
                          Accept this format
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Remove format"
                          disabled={terms.formats.length === 1}
                          onClick={() =>
                            patch({
                              formats: terms.formats.filter(
                                (_, index) => i !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <Field label="Name">
                        <input
                          className={fieldClass}
                          value={format.name}
                          onChange={(e) => change({ name: e.target.value })}
                          required
                        />
                      </Field>
                      <Field label="Brief">
                        <textarea
                          className={`${fieldClass} min-h-20 py-3`}
                          value={format.shortDescription}
                          onChange={(e) =>
                            change({ shortDescription: e.target.value })
                          }
                          required
                        />
                      </Field>
                      {format.elements.map((element, index) => (
                        <div key={index} className="grid gap-3 sm:grid-cols-2">
                          <Field label="Section title">
                            <input
                              className={fieldClass}
                              required
                              value={element.title}
                              onChange={(e) =>
                                change({
                                  elements: format.elements.map((item, n) =>
                                    n === index
                                      ? { ...item, title: e.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="Instruction">
                            <input
                              className={fieldClass}
                              required
                              value={element.detail}
                              onChange={(e) =>
                                change({
                                  elements: format.elements.map((item, n) =>
                                    n === index
                                      ? { ...item, detail: e.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </Field>
                        </div>
                      ))}
                      <Field label="Requirements" hint="One per line">
                        <textarea
                          className={`${fieldClass} min-h-28 py-3`}
                          value={format.requirements.join('\n')}
                          onChange={(e) =>
                            change({ requirements: e.target.value.split('\n') })
                          }
                          onBlur={() =>
                            change({
                              requirements: lines(
                                format.requirements.join('\n'),
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Not allowed" hint="One per line">
                        <textarea
                          className={`${fieldClass} min-h-24 py-3`}
                          value={format.notAllowed.join('\n')}
                          onChange={(e) =>
                            change({ notAllowed: e.target.value.split('\n') })
                          }
                          onBlur={() =>
                            change({
                              notAllowed: lines(format.notAllowed.join('\n')),
                            })
                          }
                        />
                      </Field>
                    </div>
                  </details>
                )
              })}
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={terms.formats.length >= 8}
                onClick={() =>
                  patch({
                    formats: [
                      ...terms.formats,
                      {
                        id: crypto.randomUUID(),
                        name: '',
                        shortDescription: '',
                        active: true,
                        elements: [
                          { title: 'Opening hook', detail: '' },
                          { title: 'Product moment', detail: '' },
                          { title: 'Closing CTA', detail: '' },
                        ],
                        requirements: ['Keep the post public and original.'],
                        notAllowed: [],
                      },
                    ],
                  })
                }
              >
                Add format
              </Button>
            </section>
          </Tabs.Content>
        </fieldset>
      </Tabs.Root>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-100 bg-white px-6 py-4">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? 'Saving…' : sprint ? 'Save changes' : 'Create campaign'}
        </Button>
      </div>
    </form>
  )
}
