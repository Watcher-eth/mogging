import { z } from 'zod'
import type { CreatorSubmission } from '@/components/creator/types'
import type { CreatorConversionReport } from '../conversion-report'
import type { BonusPayment } from '../bonus-payments'
import type { SprintTerms } from '../sprints'

export const SUPPORT_MODEL = 'z-ai/glm-5.3-flash'
export const destinationSchema = z.enum(['campaigns', 'submissions', 'new-submission', 'accounts', 'money', 'conversions', 'cta', 'start', 'rules', 'video', 'improve', 'referrals', 'payout-information'])
export type SupportDestination = z.infer<typeof destinationSchema>
export const destinations: Record<SupportDestination, { label: string; href: string; description: string }> = {
  campaigns: { label: 'Explore campaigns', href: '/creator/sprints', description: 'Campaign requirements, milestones, and dates.' },
  submissions: { label: 'View submissions', href: '/creator/submissions', description: 'Your submission history and review feedback.' },
  'new-submission': { label: 'Submit a post', href: '/creator/submissions?new=1', description: 'Open the existing submission dialog.' },
  accounts: { label: 'Connected accounts', href: '/creator/accounts', description: 'Connect an account or update its analytics.' },
  money: { label: 'Open Money', href: '/creator/money', description: 'Your balance, bonuses, and payout history.' },
  conversions: { label: 'Explore conversions', href: '/creator/conversions#conversions', description: 'Your conversion analytics and video breakdown.' },
  cta: { label: 'Open CTA Studio', href: '/creator/cta-generator', description: 'Create a product moment for your next post.' },
  start: { label: 'Creator quick start', href: '/creator/guide#quick-start-title', description: 'Set up, create, and submit.' },
  rules: { label: 'Read content rules', href: '/creator/guide?topic=rules', description: 'What qualifies and what to avoid.' },
  video: { label: 'Content requirements', href: '/creator/guide?topic=video#guide-panel-video', description: 'Plan an eligible video or slideshow.' },
  improve: { label: 'Improve your content', href: '/creator/guide?topic=improve#talk-to-viewers', description: 'Hooks, product moments, and CTAs.' },
  referrals: { label: 'Referral links & codes', href: '/creator/guide?topic=referrals', description: 'Your account-specific links and codes.' },
  'payout-information': { label: 'Payout information', href: '/creator/payout-information', description: 'Manage your payout destination securely.' },
}
export const supportRequestSchema = z.object({
  message: z.string().trim().min(1).max(1500),
  conversation: z.string().max(16000).optional(),
  page: z.string().max(160).optional(),
}).strict()
export type SupportRequest = z.infer<typeof supportRequestSchema>
export type SupportCampaign = { id: string; name: string; description: string; startsAt: string; endsAt: string; status: 'published' | 'ended'; terms: SprintTerms }
export type SupportReferrals = { inviteUrl: string | null; invited: number; earnedCents: number; paidCents: number; outstandingCents: number }
export type SubmissionGroup = { key: 'review' | 'approved-paid' | 'rejected'; title: string; total: number; submissions: CreatorSubmission[] }
export type SupportOverview = { groups: SubmissionGroup[]; counts: Record<CreatorSubmission['status'], number> }
export type SupportReviewEvent = { id: string; type: string; note: string | null; createdAt: string; snapshot: import('../updates').SubmissionHistorySnapshot | null }
export type SupportPaymentSummary = { paidContentCents: number; scheduledContentCents: number; paidBonusCents: number; recordedBonusCents: number; nonUsdPayments: number }
export type SupportPayment = { id: string; submissionId: string | null; amountCents: number; currency: string; status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'; paidAt: string | null; bonusKey?: string | null }
export type SupportArtifact =
  | { type: 'submissions'; submissions: CreatorSubmission[]; total: number; groups?: SubmissionGroup[] }
  | { type: 'analytics'; metric?: 'conversions' | 'revenue' | 'downloads' | 'linkPresses'; chartKind?: 'summary' | 'bar' | 'line'; report: Pick<CreatorConversionReport, 'daily' | 'totals'>; days: number }
  | { type: 'submission-views'; rows: import('./performance').SubmissionViews[]; scope: string }
  | { type: 'video-analytics'; metric?: 'conversions' | 'revenue' | 'downloads' | 'linkPresses'; presentation?: 'comparison' | 'timeline'; chartKind?: 'summary' | 'bar' | 'line'; report: import('./video-analytics').SupportVideoAnalytics }
  | { type: 'submission-detail'; detail: import('./evidence').SubmissionEvidence }
  | { type: 'campaign-detail'; context: import('./evidence').CampaignContext; view: 'rules' | 'milestones' | 'all' }
  | { type: 'campaign-examples'; campaign: SupportCampaign; exampleKey: string }
  | { type: 'campaigns'; campaigns: SupportCampaign[] }
  | { type: 'payments'; payments: SupportPayment[]; total: number }
  | { type: 'bonuses'; payments: BonusPayment[]; total: number }
  | { type: 'referrals'; report: SupportReferrals }
  | { type: 'action'; destination: SupportDestination }
  | { type: 'cta'; text: string }
export type SupportResponse = {
  allowance?: import('./allowance').SupportAllowance
  text: string
  artifacts: SupportArtifact[]
  conversation?: string
  engine: 'glm' | 'instant' | 'sample' | 'unavailable'
  sampleData: boolean
  usage: { inputTokens: number; outputTokens: number; modelCalls: number }
}
export type SubmissionFilter = { id?: string; status?: CreatorSubmission['status']; limit?: number }
/** All methods close over a server-authenticated creator; callers cannot supply an owner. */
export interface SupportDataSource {
  submissions(filter: SubmissionFilter): Promise<{ submissions: CreatorSubmission[]; total: number }>
  history(submissionId: string): Promise<SupportReviewEvent[]>
  overview(): Promise<SupportOverview>
  videoAnalytics(query: import('./video-analytics').VideoAnalyticsQuery): Promise<import('./video-analytics').SupportVideoAnalytics>
  analytics(days: number): Promise<Pick<CreatorConversionReport, 'daily' | 'totals'>>
  campaigns(id?: string): Promise<SupportCampaign[]>
  payments(submissionId?: string): Promise<{ payments: SupportPayment[]; total: number; summary?: SupportPaymentSummary }>
  bonuses(): Promise<{ payments: BonusPayment[]; total: number }>
  referrals(): Promise<SupportReferrals>
}
