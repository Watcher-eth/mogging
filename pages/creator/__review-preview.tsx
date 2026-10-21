import { useMemo } from 'react'
import { SessionContext } from 'next-auth/react'
import { useRouter } from 'next/router'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import { SWRConfig, type Middleware, type Key, type BareFetcher, type SWRConfiguration } from 'swr'
import { SidebarProvider } from '@/components/ui/sidebar'
import CreatorSubmissionsPage from './submissions'
import type { CreatorDashboard, CreatorSubmission } from '@/components/creator/types'
import { getCreatorSubmissionReviewItems } from '@/lib/creator/submission-review'

const createdAt = '2026-10-20T15:00:00.000Z'
const submission: CreatorSubmission = {
  id: 'preview-rejected-video',
  socialAccountId: 'preview-account',
  formatId: 'custom-video-v1',
  requirementsConfirmedAt: createdAt,
  title: 'My Mogging transformation',
  platform: 'tiktok',
  caption: 'Your next level starts with knowing what to improve.',
  postUrl: 'https://www.tiktok.com/@examplecreator/video/1234567890',
  videoUrl: null,
  videoContentType: null,
  videoSizeBytes: null,
  analyticsScreenshotUrl: null,
  analyticsContentType: null,
  analyticsSizeBytes: null,
  viewCountThreshold: 40000,
  usAudiencePercent: 35,
  adminViewCountThreshold: null,
  adminUsAudiencePercent: null,
  status: 'rejected',
  reviewNote: null,
  reviewChecklist: getCreatorSubmissionReviewItems('custom-video-v1').map((item, index) => ({
    id: item.id,
    met: index > 1,
    note: index === 0
      ? 'Show Mogging and a clear invitation to try it within the first 2–3 seconds, rather than only at the end.'
      : index === 1 ? 'Add @moggingcom to your post caption so the app is clearly credited.' : null,
  })),
  createdAt,
}
const dashboard: CreatorDashboard = {
  profile: { id: 'preview-profile', displayName: 'Example creator', socialHandle: 'examplecreator', authStatus: 'verified', paymentOption: 'paypal', paypalEmail: 'example@example.com', cryptoNetwork: null, cryptoWalletAddress: null },
  submissions: [submission],
  payments: [],
  socialAccounts: [{ id: 'preview-account', platform: 'tiktok', handle: 'examplecreator', profileUrl: null, avatarUrl: null, connectionMethod: 'manual', providerAccountId: null, oauthVerifiedAt: null, analyticsVideoUrl: null, analyticsStorageKey: null, analyticsContentType: null, analyticsSizeBytes: null, analyticsPeriodDays: null, analyticsConfirmedAt: null, status: 'approved', reviewNote: null, createdAt, trackingLink: null }],
  communityMetrics: { totalQualifiedViews: 0, totalFirstTimePaidCustomers: 0, totalPaidCents: 0, paidCreators: 0, approvedSubmissions: 0 },
  featureFlags: { creatorAccountRequiredForSubmission: true },
}

// Supply fixtures at the data boundary; render the production portal unchanged.
async function previewFetch<Data>(request: string | string[]): Promise<Data> {
  const endpoint = Array.isArray(request) ? request[0] : request
  if (endpoint.endsWith('/messages')) return { submission: { status: 'rejected', unreadMessages: 0 }, messages: [], nextCursor: null } as Data
  if (endpoint.endsWith('/preview')) return { thumbnailUrl: null, caption: submission.caption, authorName: 'examplecreator', width: null, height: null, viewCount: 40000, fetchedAt: createdAt } as Data
  if (endpoint === '/api/creator') return dashboard as Data
  throw new Error('This preview only supports sample submission data.')
}
const previewData: Middleware = useSWRNext => <Data, Error>(key: Key, _fetcher: BareFetcher<Data> | null, config: SWRConfiguration<Data, Error>) => useSWRNext<Data, Error>(key, previewFetch<Data>, { ...config, refreshInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false })

export default function CreatorRejectionPreview() {
  const router = useRouter()
  const previewRouter = useMemo(() => ({ ...router, pathname: '/creator/submissions' }), [router])
  return <SessionContext.Provider value={{ data: { expires: '2099-01-01', user: { id: '', name: 'Example creator' } }, status: 'authenticated', update: async () => null }}>
    <SWRConfig value={{ provider: () => new Map(), use: [previewData] }}>
      <RouterContext.Provider value={previewRouter}>
        <p className="px-4 pt-3 text-center text-xs text-zinc-400">Local preview · sample submission · no real review changed</p>
        <SidebarProvider className="min-h-0 flex-1 flex-col"><CreatorSubmissionsPage /></SidebarProvider>
      </RouterContext.Provider>
    </SWRConfig>
  </SessionContext.Provider>
}

export function getServerSideProps() {
  return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} }
}
