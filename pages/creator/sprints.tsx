import { CampaignRegionHelp } from '@/components/creator/campaign-region-help'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CampaignHelp } from '@/components/creator/campaign-help'
import { SprintBudget, SprintStatus } from '@/components/creator/campaign-summary'
import Link from 'next/link'
import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { getCampaignPreview } from '@/lib/creator/sprint-service'
import { campaignTimeLabel, type CampaignPreview } from '@/lib/creator/campaign-preview'
import { siteUrl } from '@/lib/seo'
import { CREATOR_AUDIENCE_BANDS, campaignHasAudienceBands, campaignRegionRates } from '@/lib/creator/sprint-defaults'
import { useRouter } from 'next/router'
import { useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, ArrowRight, FileText, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { StudioTabs, StudioTabContent } from '@/components/creator/studio-tabs'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { apiGet } from '@/lib/api/client'
import {
  sprintPhase,
  sprintPayoutCents,
  sprintMoney,
  sprintViews,
  type CreatorSprint,
  type SprintProof,
} from '@/lib/creator/sprints'
type Props = { campaign: CampaignPreview | null; timeLabel: string | null }

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const campaign = typeof query.id === 'string' ? await getCampaignPreview(query.id) : null
  if (query.id && !campaign) return { notFound: true }
  return { props: { campaign, timeLabel: campaign ? campaignTimeLabel(campaign) : null } }
}

export default function SprintsPage({ campaign, timeLabel }: Props) {
  const url = campaign ? `${siteUrl}/creator/sprints?id=${encodeURIComponent(campaign.id)}` : `${siteUrl}/creator/sprints`
  const title = campaign ? `${campaign.name} | Mogging Creators` : 'Campaigns | Mogging Creators'
  const description = campaign ? `${sprintMoney(campaign.budgetCents)} campaign budget · ${timeLabel}. ${campaign.description}` : 'Explore Mogging creator campaigns, budgets, and briefs.'
  const imageUrl = campaign ? `${siteUrl}/api/og/campaign?id=${encodeURIComponent(campaign.id)}` : null
  return (
    <>
      <Head>
        <title key="title">{title}</title>
        <meta key="description" name="description" content={description} />
        <link key="canonical" rel="canonical" href={url} />
        <meta key="og:title" property="og:title" content={title} />
        <meta key="og:description" property="og:description" content={description} />
        <meta key="og:url" property="og:url" content={url} />
        <meta key="twitter:title" name="twitter:title" content={title} />
        <meta key="twitter:description" name="twitter:description" content={description} />
        {campaign && imageUrl ? <>
          <meta key="og:image" property="og:image" content={imageUrl} />
          <meta key="og:image:width" property="og:image:width" content="1200" />
          <meta key="og:image:height" property="og:image:height" content="630" />
          <meta key="og:image:alt" property="og:image:alt" content={`${campaign.name} — ${sprintMoney(campaign.budgetCents)} campaign budget, ${timeLabel}`} />
          <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
          <meta key="twitter:image" name="twitter:image" content={imageUrl} />
        </> : null}
      </Head>
      <CreatorShell>
        <SprintsContent />
      </CreatorShell>
    </>
  )
}
function SprintsContent() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{
    sprints: CreatorSprint[]
  }>('/api/creator/sprints', apiGet)
  const [phase, setPhase] = useState('active')
  const selected = data?.sprints.find((item) => item.id === router.query.id)
  if (isLoading) return <Loader2 className="mx-auto my-16 animate-spin" />
  if (error)
    return (
      <p role="alert">
        Could not load campaigns.{' '}
        <button onClick={() => void mutate()} className="text-[#00A8EF]">
          Try again
        </button>
      </p>
    )
  if (router.query.id && !selected)
    return (
      <p>
        Campaign unavailable.{' '}
        <Link href="/creator/sprints">Back to campaigns</Link>
      </p>
    )
  if (selected) return <SprintDetail sprint={selected} />
  return (
    <>
      <CreatorHeader
        eyebrow="Mogging"
        title="Campaigns"
        titleAccessory={<CampaignHelp />}
        description="Choose a campaign. Know the budget, rates and rules before you create."
      />
      <StudioTabs
        value={phase}
        onChange={setPhase}
        items={[
          { value: 'active', label: 'Active' },
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'past', label: 'Past' },
        ]}
      >
        {['active', 'scheduled', 'past'].map((tab) => (
          <StudioTabContent key={tab} value={tab}>
            <div className="grid gap-4">
              {data?.sprints
                .filter((sprint) => sprintPhase(sprint) === tab)
                .map((sprint) => (
                  <Link
                    key={sprint.id}
                    href={`/creator/sprints?id=${sprint.id}`}
                    className="creator-surface group block p-5 sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold tracking-tight">
                          {sprint.name}
                        </h2>
                        <SprintStatus sprint={sprint} />
                      </div>
                      <div className="flex gap-2">
                        {sprint.terms.platforms.map((platform) => (
                          <SocialPlatformLogo
                            key={platform}
                            platform={platform}
                            className="size-4"
                          />
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {sprint.description}
                    </p>
                    <div className="my-5 border-y border-zinc-100 py-4">
                      <SprintBudget sprint={sprint} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>
                        {sprint.counts.pending + sprint.counts.in_review}{' '}
                        pending · {sprint.counts.approved + sprint.counts.paid}{' '}
                        approved · {sprint.counts.rejected} rejected
                      </span>
                      <ArrowRight className="size-4 text-[#00A8EF] transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              {!data?.sprints.some((item) => sprintPhase(item) === tab) ? (
                <div className="creator-surface p-10 text-center">
                  <h2 className="font-semibold">No {tab} campaigns</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {tab === 'active'
                      ? 'New campaigns will appear here when they open.'
                      : tab === 'scheduled'
                        ? 'Upcoming campaigns will appear here.'
                        : 'Completed campaigns will remain here for reference.'}
                  </p>
                </div>
              ) : null}
            </div>
          </StudioTabContent>
        ))}
      </StudioTabs>
    </>
  )
}
function SprintDetail({ sprint }: { sprint: CreatorSprint }) {
  const [tab, setTab] = useState('overview')
  const [audienceTier, setAudienceTier] = useState<string>('A')
  const hasAudienceBands = campaignHasAudienceBands(sprint.terms)
  const audienceBand = CREATOR_AUDIENCE_BANDS.find((band) => band.tier === audienceTier)!
  const { data, isLoading, error } = useSWR<{ submissions: SprintProof[] }>(
    tab === 'submissions' ? `/api/creator/sprints/${sprint.id}` : null,
    apiGet,
  )
  return (
    <>
      <Link
        href="/creator/sprints"
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500"
      >
        <ArrowLeft className="size-4" />
        All campaigns
      </Link>
      <CreatorHeader
        eyebrow="Campaign"
        title={sprint.name}
        description={sprint.description}
        action={
          sprintPhase(sprint) === 'active' &&
          sprint.usedCents < sprint.budgetCents ? (
            <Button asChild>
              <Link href={`/creator/submit?sprint=${sprint.id}`}>
                <Plus />
                Submit a video
              </Link>
            </Button>
          ) : (
            <SprintStatus sprint={sprint} />
          )
        }
      />
      <StudioTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'submissions', label: 'Approved submissions' },
        ]}
      >
        <StudioTabContent value="overview">
          <div className="creator-surface p-5 sm:p-7">
            <SprintBudget sprint={sprint} />
            <div className="mt-7 rounded-2xl border border-[#e8ebee] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Milestone payouts</h2>
                {hasAudienceBands ? <Select value={audienceTier} onValueChange={setAudienceTier}>
                  <SelectTrigger aria-label="Milestone payout tier" className="h-8 w-24 rounded-full px-3 text-xs shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...CREATOR_AUDIENCE_BANDS].reverse().map((band) => (
                      <SelectItem key={band.tier} value={band.tier}>Tier {band.tier}</SelectItem>
                    ))}
                  </SelectContent>
                </Select> : null}
              </div>
              <div
                className="mt-5 overflow-x-auto pb-1"
                role="region"
                aria-label="Milestone payout timeline"
                tabIndex={0}
              >
                <ol
                  className="flex min-w-max justify-between"
                  aria-label="Total payouts by verified view count"
                >
                  {sprint.terms.milestones.map((item, index) => (
                    <li
                      key={item.views}
                      className="relative min-w-[80px] flex-1 text-left last:flex-none last:min-w-[56px]"
                    >
                      <div className="relative mb-3 h-4" aria-hidden="true">
                        <span className="absolute left-3 top-1 size-2 rounded-full bg-[#00A8EF]" />
                        {index < sprint.terms.milestones.length - 1 ? (
                          <span className="absolute left-7 right-[-4px] top-2 h-px bg-[#dfe3e7]" />
                        ) : null}
                      </div>
                      <p className="text-lg font-semibold leading-6 tracking-tight tabular-nums text-zinc-900">
                        {sprintMoney(hasAudienceBands ? sprintPayoutCents(sprint.terms, item.views, audienceBand.minimumPercent) : item.amountCents)}
                      </p>
                      <p className="mt-1.5 text-xs font-medium tabular-nums text-zinc-500">
                        {sprintViews(item.views)}
                        <span className="sr-only"> views</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 py-1">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f5f6f7]">
                <FileText className="size-5 text-zinc-500" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tabular-nums">
                  {Object.values(sprint.counts).reduce(
                    (sum, count) => sum + count,
                    0,
                  )}{' '}
                  submissions
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500 tabular-nums">
                  <span title="Approved videos awaiting payment">
                    {sprint.counts.approved} earning
                  </span>{' '}
                  · {sprint.counts.pending + sprint.counts.in_review} pending ·{' '}
                  <span title="All approved videos, including earning and paid videos">
                    {sprint.counts.approved + sprint.counts.paid} approved
                  </span>{' '}
                  · {sprint.counts.rejected} rejected
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('submissions')}
                className="group inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-[#00A8EF]"
              >
                View approved
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <div className="mt-7 grid gap-7 lg:grid-cols-2">
              <section>
                <h2 className="mb-3 text-sm font-semibold">Formats & briefs</h2>
                {sprint.terms.formats
                  .filter((item) => item.active)
                  .map((format) => (
                    <Dialog key={format.id}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          data-creator-card
                          className="group mb-3 flex w-full items-center gap-3 rounded-2xl bg-[#f5f6f7] p-4 text-left transition-colors hover:bg-[#eef0f2]"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white">
                            <FileText className="size-5 text-zinc-500" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">
                              {format.name}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-zinc-500">
                              {format.shortDescription}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#00A8EF]">
                            Brief
                            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="creator-dialog max-h-[calc(100dvh-32px)] max-w-2xl overflow-y-auto p-6 sm:p-8">
                        <DialogHeader className="pr-6 text-left">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                            Format brief
                          </p>
                          <DialogTitle>{format.name}</DialogTitle>
                          <DialogDescription>
                            {format.shortDescription}
                          </DialogDescription>
                        </DialogHeader>
                        <Link href="/creator/cta-generator" target="_blank" className="text-xs font-medium text-[#00A8EF] underline underline-offset-4">
                          Create mock reports in the CTA generator ↗
                        </Link>
                        <Link href="/creator/guide?topic=rules#video-requirements" target="_blank" className="text-xs font-medium text-[#00A8EF] underline underline-offset-4">
                          Celebrity edits and audience rules ↗
                        </Link>
                        <section className="mt-3 space-y-4">
                          <h3 className="text-sm font-semibold">
                            Video instructions
                          </h3>
                          <ol className="list-decimal space-y-4 pl-5 text-sm leading-6">
                            {format.elements.map((item) => (
                              <li key={item.title}>
                                <strong>{item.title}</strong>
                                <p className="text-zinc-500">{item.detail}</p>
                              </li>
                            ))}
                          </ol>
                        </section>
                        <section className="mt-3 space-y-3 border-t border-zinc-100 pt-5">
                          <h3 className="text-sm font-semibold">
                            Requirements
                          </h3>
                          <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-zinc-600">
                            {format.requirements.map((rule) => (
                              <li key={rule}>{rule}</li>
                            ))}
                          </ul>
                        </section>
                        {format.notAllowed.length ? (
                          <section className="creator-warning mt-3 rounded-xl p-4">
                            <h3 className="text-sm font-semibold">
                              Not allowed
                            </h3>
                            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                              {format.notAllowed.map((rule) => (
                                <li key={rule}>{rule}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                      </DialogContent>
                    </Dialog>
                  ))}
              </section>
              <section>
                <h2 className="mb-3 text-sm font-semibold">Rules</h2>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 rounded-xl bg-[#f5f6f7] py-2 pl-4 pr-2 text-sm leading-6 text-zinc-600">
                    <span className="min-w-0 flex-1">{campaignRegionRates(sprint.terms)}</span>
                    {hasAudienceBands ? <CampaignRegionHelp /> : null}
                  </li>
                  {[
                    'A continuous analytics recording filmed with a second device is required.',
                    ...sprint.terms.rules,
                  ].map((rule) => (
                    <li
                      key={rule}
                      className="rounded-xl bg-[#f5f6f7] px-4 py-3 text-sm leading-6 text-zinc-600"
                    >
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </StudioTabContent>
        <StudioTabContent value="submissions">
          {isLoading ? (
            <Loader2 className="mx-auto my-10 animate-spin" />
          ) : error ? (
            <p role="alert">Could not load approved submissions.</p>
          ) : data?.submissions.length ? (
            <div className="grid gap-3">
              {data.submissions.map((item) => (
                <article key={item.id} className="creator-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {item.handle ? `@${item.handle}` : 'Creator'}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.platform} · {item.title}
                      </p>
                    </div>
                    <span className="rounded-lg bg-[#29CE53] px-3 py-1 text-xs text-white">
                      {item.status === 'paid' ? 'Paid' : 'Approved'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
                    <span className="text-zinc-500">
                      {sprintViews(item.views)} verified views
                    </span>
                    <div className="flex items-center gap-4">
                      <strong>{sprintMoney(item.amountCents)}</strong>
                      {item.postUrl ? (
                        <a
                          href={item.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#00A8EF]"
                        >
                          View video ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="creator-surface p-10 text-center text-sm text-zinc-500">
              Approved videos will appear here.
            </div>
          )}
        </StudioTabContent>
      </StudioTabs>
    </>
  )
}
