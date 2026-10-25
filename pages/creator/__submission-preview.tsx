import { CreatorConversions } from '@/components/creator/creator-conversions'
import { EMPTY_CREATOR_CONVERSION_REPORT } from '@/lib/creator/conversion-report'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { TikTokAccountDialog } from '@/components/creator/tiktok-anchor-onboarding'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import { SessionContext } from 'next-auth/react'
import { SWRConfig, type Middleware, type Key, type BareFetcher, type SWRConfiguration } from 'swr'
import { SidebarProvider } from '@/components/ui/sidebar'
import { CreatorShell, CreatorHeader } from '@/components/creator/creator-shell'
import { ConnectAccountForm } from '@/components/creator/connect-account-form'
import { PayoutInformation } from '@/components/creator/payout-information-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import CreatorSubmissionsPage from './submissions'
import CreatorOverviewPage from './index'
import CreatorProgramGuidePage from './guide'
import { SubmissionDialog } from '@/components/creator/submission-dialog'
import type { CreatorDashboard, CreatorSocialAccount } from '@/components/creator/types'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import type { CreatorSprint } from '@/lib/creator/sprints'

const account: CreatorSocialAccount = {
  id: '11111111-1111-4111-8111-111111111111', platform: 'tiktok', handle: 'examplecreator',
  profileUrl: null, avatarUrl: null, connectionMethod: 'manual', providerAccountId: null,
  oauthVerifiedAt: null, analyticsVideoUrl: null, analyticsStorageKey: null, analyticsContentType: null,
  analyticsSizeBytes: null, analyticsPeriodDays: null, analyticsConfirmedAt: null,
  status: 'approved', reviewNote: null, createdAt: '2026-10-20T15:00:00Z', trackingLink: null,
}
const dashboard: CreatorDashboard = {
  profile: { id: 'preview', displayName: 'Example creator', socialHandle: 'examplecreator', authStatus: 'verified', paymentOption: 'paypal', paypalEmail: 'creator@example.invalid', cryptoNetwork: null, cryptoWalletAddress: null },
  submissions: [{
    id: 'preview-submission', status: 'approved', socialAccountId: account.id,
    formatId: 'custom-video-v1', requirementsConfirmedAt: account.createdAt,
    title: 'My first Mogging post', platform: 'TikTok', caption: null,
    postUrl: 'https://www.tiktok.com/@examplecreator/video/1234567890',
    videoUrl: null, videoContentType: null, videoSizeBytes: null,
    analyticsScreenshotUrl: null, analyticsContentType: null, analyticsSizeBytes: null,
    viewCountThreshold: 40000, usAudiencePercent: 30, adminViewCountThreshold: null,
    adminUsAudiencePercent: null, reviewNote: null, reviewChecklist: null, createdAt: account.createdAt, updatedAt: '2026-10-22T17:00:00Z',
  }],
  payments: [], socialAccounts: [account, { ...account, id: '22222222-2222-4222-8222-222222222222', platform: 'instagram' }],
  communityMetrics: { totalQualifiedViews: 340000, totalFirstTimePaidCustomers: 0, totalPaidCents: 0, paidCreators: 0, approvedSubmissions: 1 },
  featureFlags: { creatorAccountRequiredForSubmission: true },
}
const sampleSubmissions: CreatorDashboard['submissions'] = [
  { ...dashboard.submissions[0], id: 'preview-paid', status: 'paid', caption: 'A small change. A whole new level of confidence.', viewCountThreshold: 330000, approvedAmountCents: 2500, createdAt: '2026-10-21T16:00:00Z' },
  { ...dashboard.submissions[0], id: 'preview-approved', status: 'approved', caption: 'Your next level starts with understanding your features.', viewCountThreshold: 125000, approvedAmountCents: 1500, createdAt: '2026-10-20T16:00:00Z' },
  { ...dashboard.submissions[0], id: 'preview-review', status: 'in_review', reviewRequestedAt: '2026-10-22T16:00:00Z', platform: 'Instagram Reels', caption: 'The glow-up checklist I wish I had sooner.', viewCountThreshold: 64000, createdAt: '2026-10-22T16:00:00Z' },
  { ...dashboard.submissions[0], id: 'preview-rejected', status: 'rejected', caption: 'Three things I changed about my routine.', viewCountThreshold: 25000, createdAt: '2026-10-19T16:00:00Z' },
]
const samplePayments: CreatorDashboard['payments'] = [
  { id: 'preview-payment', submissionId: 'preview-paid', amountCents: 2500, currency: 'USD', status: 'paid', paymentOption: 'paypal', paidAt: '2026-10-22T16:00:00Z' },
]
const campaign: CreatorSprint = {
  id: '33333333-3333-4333-8333-333333333333', name: 'Mogging Creator Program', description: 'Create content that helps your audience discover their potential.',
  status: 'published', budgetCents: 1000000, usedCents: 250000, startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z',
  terms: defaultCreatorSprintTerms(), counts: { pending: 0, in_review: 0, approved: 1, rejected: 0, paid: 0 },
}
const bonusDemoSubmissions = sampleSubmissions.map(item => ({ ...item, sprintId: campaign.id, adminUsAudiencePercent: 47 }))
const bonusDemoPayments: CreatorDashboard['payments'] = [
  ...samplePayments,
  { id: 'demo-audience', submissionId: null, bonusSprintId: campaign.id, bonusKey: 'audience:preview-approved:1000', bonusNote: 'Audience excellence · General Looksmaxxing Content', amountCents: 1000, currency: 'USD', status: 'pending', paymentOption: 'paypal', paidAt: null },
  { id: 'demo-conversion', submissionId: null, bonusSprintId: campaign.id, bonusKey: 'conversion:preview-approved:450', bonusNote: 'Conversion bonus · General Looksmaxxing Content', amountCents: 450, currency: 'USD', status: 'pending', paymentOption: 'paypal', paidAt: null },
  { id: 'demo-paid-bonus', submissionId: null, bonusSprintId: campaign.id, bonusKey: 'audience:preview-paid:1000', bonusNote: 'Audience excellence · General Looksmaxxing Content', amountCents: 1000, currency: 'USD', status: 'paid', paymentOption: 'paypal', paidAt: '2026-10-22T16:00:00Z' },
  { id: 'demo-campaign-bonus', submissionId: null, bonusSprintId: campaign.id, bonusKey: 'million:1500', bonusNote: 'Million View Club · General Looksmaxxing Content', amountCents: 1500, currency: 'USD', status: 'pending', paymentOption: 'paypal', paidAt: null },
]
async function previewFetch<Data>(request: string | string[], bonuses = false, guide = false, overview = false): Promise<Data> {
  const path = Array.isArray(request) ? request[0] : request
  if (path === '/api/creator') return { ...dashboard, ...(guide || overview ? { socialAccounts: dashboard.socialAccounts.map((item, index) => ({ ...item, ...(overview ? { avatarUrl: index ? '/model2.png' : '/model.png', followers: { source: 'manual', count: 5000, checkedAt: item.createdAt } } : {}), trackingLink: { id: item.id, slug: `example${index}`, publicUrl: `https://www.mogging.com/r/example${index}`, isActive: true } })) } : {}), submissions: bonuses ? bonusDemoSubmissions : sampleSubmissions, payments: overview ? [
    ...bonusDemoPayments.filter(payment => payment.id !== 'preview-payment'),
    { ...samplePayments[0], amountCents: 1000 },
    { ...samplePayments[0], id: 'preview-bundle-paid', amountCents: 750, payoutRequestId: 'preview-bundle' },
    { ...samplePayments[0], id: 'preview-bundle-approved', submissionId: 'preview-approved', amountCents: 750, payoutRequestId: 'preview-bundle' },
  ] : bonuses ? bonusDemoPayments : samplePayments } as Data
  if (path === '/api/creator/referrals') return { inviteUrl: 'https://www.mogging.com/creator/join/preview-personal-creator-link0001', invited: 2, earnedCents: 325, paidCents: 125, outstandingCents: 200, referrals: [{ id: 'referral-one', name: 'Alex', joinedAt: '2026-10-25T16:00:00Z', approvedVideos: 3, earnedCents: 200, status: 'active' }, { id: 'referral-two', name: 'Sam', joinedAt: '2026-10-24T16:00:00Z', approvedVideos: 1, earnedCents: 125, status: 'active' }] } as Data
  if (path.endsWith('/preview')) {
    const index = Math.max(0, sampleSubmissions.findIndex(item => path.includes(item.id)))
    const submission = sampleSubmissions[index]
    return { thumbnailUrl: `/model${index ? index + 1 : ''}.png`, caption: submission.caption, authorName: 'examplecreator', width: overview ? 1080 : 600, height: overview ? 1920 : 800, viewCount: submission.viewCountThreshold, fetchedAt: submission.createdAt } as Data
  }
  if (path.endsWith('/messages')) return { submission: { status: 'in_review', unreadMessages: 0 }, messages: [], nextCursor: null } as Data
  if (path === '/api/creator/sprints') return { sprints: guide ? [...LAUNCH_CAMPAIGNS].reverse().map((item, index) => ({ ...campaign, id: `guide-${index}`, name: item.name, budgetCents: 250000, usedCents: 0, terms: launchCampaignTerms(item) })) : [campaign] } as Data
  throw new Error('Preview only: no real submissions can be sent.')
}
const previewData = (empty: boolean, bonuses: boolean, guide: boolean, overview: boolean): Middleware => useSWRNext => <Data, Error>(key: Key, _fetcher: BareFetcher<Data> | null, config: SWRConfiguration<Data, Error>) => useSWRNext<Data, Error>(key, request => empty && (Array.isArray(request) ? request[0] : request) === '/api/creator' ? Promise.resolve({ ...dashboard, submissions: [], payments: [], ...(overview ? { socialAccounts: [] } : {}) } as Data) : previewFetch<Data>(request, bonuses, guide, overview), { ...config, refreshInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false })
export default function SubmissionPreview() {
  const router = useRouter()
  const guide = router.query.view === 'guide'
  const overview = router.query.view === 'overview'
  const conversions = router.query.view === 'conversions'
  const anchors = router.query.view === 'anchors'
  const [anchorOpen, setAnchorOpen] = useState(true)
  const bonuses = router.query.view === 'bonuses' || overview
  const history = bonuses || router.query.view === 'submissions' || router.query.view === 'empty'
  const empty = router.query.view === 'empty' || (overview && router.query.empty === '1')
  const previewMiddleware = useMemo(() => previewData(empty, bonuses, guide, overview), [empty, bonuses, guide, overview])
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<'account' | 'payout' | null>(null)
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const previewRouter = useMemo(() => ({
    ...router,
    pathname: conversions ? '/creator/conversions' : overview ? '/creator' : guide ? '/creator/guide' : history ? '/creator/submissions' : '/creator/submit',
    replace: async (...args: Parameters<typeof router.replace>) => {
      const [destination, , options] = args
      if (typeof destination === 'object' && destination.pathname === '/creator/submissions') {
        return router.replace({ pathname: '/creator/__submission-preview', query: { ...(typeof destination.query === 'object' ? destination.query : {}), view: bonuses ? 'bonuses' : 'submissions' } }, undefined, options)
      }
      return router.replace(...args)
    },
    push: async (...args: Parameters<typeof router.push>) => {
      const [destination] = args
      if (typeof destination === 'string') {
        const target = new URL(destination, 'http://preview.local')
        if (target.pathname === '/creator/guide') return router.push({ pathname: '/creator/__submission-preview', query: { view: 'guide', ...Object.fromEntries(target.searchParams) }, hash: target.hash })
        if (['/creator/submissions', '/creator/submit'].includes(target.pathname) && target.searchParams.get('new') === '1') {
          setOpen(true)
          return true
        }
      }
      return router.push(...args)
    },
  }), [router, history, guide, bonuses, overview, conversions])
  return <SessionContext.Provider value={{ data: { expires: '2099-01-01', user: { id: '', name: 'Example creator' } }, status: 'authenticated', update: async () => null }}>
    <SWRConfig key={empty ? 'empty' : bonuses ? 'bonuses' : 'populated'} value={{ provider: () => new Map(), use: [previewMiddleware] }}><RouterContext.Provider value={previewRouter}>
      <SidebarProvider className="min-h-0 flex-1 flex-col">
        {overview ? <><p className="bg-[#f6f8f7] py-2 text-center text-[10px] text-[#8b958e]">Private overview preview · sample data</p><CreatorOverviewPage />{open ? <SubmissionDialog open onOpenChange={setOpen} onSubmitted={async () => {}} /> : null}</> : conversions ? <CreatorShell><CreatorConversions report={EMPTY_CREATOR_CONVERSION_REPORT} /></CreatorShell> : anchors ? <CreatorShell><CreatorHeader eyebrow="TikTok" title="Optional app anchor" description="Local preview · sample account" /><Button onClick={() => setAnchorOpen(true)}>View optional anchor setup</Button><TikTokAccountDialog account={{ ...account, followers: { source: 'public', count: 5000, checkedAt: account.createdAt } }} mode="anchor" open={anchorOpen} onOpenChange={setAnchorOpen} onSaved={async () => {}} /></CreatorShell> : guide ? <CreatorProgramGuidePage /> : history ? <><div className="flex justify-center gap-5 px-4 pt-3 text-xs text-zinc-400"><a href="?view=submissions" className="underline underline-offset-4">Mock submissions</a><a href="?view=empty" className="underline underline-offset-4">Animated empty state</a><a href="?view=bonuses" className="underline underline-offset-4">Bonus earnings</a><span>Local preview · sample data</span></div><CreatorSubmissionsPage />{open ? <SubmissionDialog open onOpenChange={setOpen} onSubmitted={async () => {}} /> : null}</> : <CreatorShell>
        <CreatorHeader eyebrow="Creator videos" title="Your submissions" description="Your content, reviews and earnings in one place." />
        <div className="creator-surface p-6"><p className="text-sm font-medium">You’re ready for your next post.</p><p className="mt-2 text-sm text-zinc-500">Open New video to try the updated submission flow.</p><p className="mt-5 text-xs text-zinc-400">Local preview · sample accounts · no real submissions</p></div>
        <div className="mt-5 flex gap-3"><Button variant="outline" onClick={() => setPanel('account')}>Preview account form</Button><Button variant="outline" onClick={() => setPanel('payout')}>Preview payout form</Button></div>
        <Dialog open={panel !== null} onOpenChange={value => { if (!value) setPanel(null) }}><DialogContent className="creator-dialog creator-dialog-flow max-h-[92dvh] overflow-y-auto p-0">
          <DialogHeader className="creator-dialog-header text-left"><DialogTitle className="creator-dialog-title">{panel === 'account' ? 'Connect account' : 'Payout information'}</DialogTitle><DialogDescription>{panel === 'account' ? 'Add the account you publish from.' : 'Choose where to receive your earnings.'}</DialogDescription></DialogHeader>
          {panel === 'account' ? <ConnectAccountForm platform={platform} onPlatformChange={setPlatform} counts={{tiktok:1, instagram:1}} disabled={false} onConnected={async () => {}} /> : <div className="px-7 pb-7"><PayoutInformation email="creator@example.invalid" embedded /></div>}
        </DialogContent></Dialog>
        {open ? <SubmissionDialog open onOpenChange={setOpen} onSubmitted={async () => {}} /> : null}
      </CreatorShell>}</SidebarProvider>
    </RouterContext.Provider></SWRConfig>
  </SessionContext.Provider>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} } }
