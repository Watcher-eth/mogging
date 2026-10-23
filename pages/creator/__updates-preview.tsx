import { SessionContext } from 'next-auth/react'
import { SWRConfig, type Middleware, type Key, type BareFetcher, type SWRConfiguration } from 'swr'
import { SidebarProvider } from '@/components/ui/sidebar'
import OverviewPage from './index'
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
async function previewFetch<Data>(request: string | string[]): Promise<Data> {
  const path = Array.isArray(request) ? request[0] : request
  if (path === '/api/creator') return { ...dashboard, submissions: sampleSubmissions, payments: samplePayments, updates: sampleUpdates } as Data
  if (path.endsWith('/preview')) {
    const index = Math.max(0, sampleSubmissions.findIndex(item => path.includes(item.id)))
    const submission = sampleSubmissions[index]
    return { thumbnailUrl: `/model${index ? index + 1 : ''}.png`, caption: submission.caption, authorName: 'examplecreator', width: 600, height: 800, viewCount: submission.viewCountThreshold, fetchedAt: submission.createdAt } as Data
  }
  if (path.endsWith('/messages')) return { submission: { status: 'in_review', unreadMessages: 0 }, messages: [], nextCursor: null } as Data
  if (path === '/api/creator/sprints') return { sprints: [campaign] } as Data
  throw new Error('Preview only: no real submissions can be sent.')
}
const previewData = (empty: boolean): Middleware => useSWRNext => <Data, Error>(key: Key, _fetcher: BareFetcher<Data> | null, config: SWRConfiguration<Data, Error>) => useSWRNext<Data, Error>(key, request => empty && (Array.isArray(request) ? request[0] : request) === '/api/creator' ? Promise.resolve({ ...dashboard, submissions: [], payments: [] } as Data) : previewFetch<Data>(request), { ...config, refreshInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false })

const sampleUpdates = [
  { id: 'review', submissionId: 'preview-review', type: 'rereview_requested', title: 'The glow-up checklist I wish I had sooner.', note: null, createdAt: '2026-10-22T23:00:00Z' },
  { id: 'approved', submissionId: 'preview-approved', type: 'approved', title: 'Your next level starts with understanding your features.', note: 'Your post meets the campaign requirements. Nice work!', createdAt: '2026-10-22T21:00:00Z' },
  { id: 'feedback', submissionId: 'preview-rejected', type: 'feedback', title: 'Three things I changed about my routine.', note: 'Please include the audience analytics page in your recording.', createdAt: '2026-10-22T20:00:00Z' },
]
export default function UpdatesPreview() {
  return <SessionContext.Provider value={{ data: { expires: '2099-01-01', user: { id: '', name: 'Example creator' } }, status: 'authenticated', update: async () => null }}>
    <SWRConfig value={{ provider: () => new Map(), use: [previewData(false)] }}><SidebarProvider className="min-h-0 flex-1 flex-col"><OverviewPage /></SidebarProvider></SWRConfig>
  </SessionContext.Provider>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} } }
