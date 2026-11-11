export type CreatorStatus = 'pending' | 'verified' | 'suspended'
export type AccountStatus = 'pending' | 'approved' | 'missing_information'
export type SubmissionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid'
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'
export type SubmissionReviewResult = { id: string; met: boolean; note: string | null }

export type AdminAttributionReport = {
  clicks: number
  uniqueClicks: number
  botClicks: number
  signups: number
  installs: number
  paywallViews: number
  checkouts: number
  purchases: number
  paidCustomers: number
  refunds: number
  disputes: number
  grossRevenueCents: number
  reversedRevenueCents: number
  revenueCents: number
  firstTouchSignups: number
  firstTouchPaywallViews: number
  firstTouchPaidCustomers: number
  firstTouchRevenueCents: number
  recentClicks: number
  recentSignups: number
  recentInstalls: number
  recentPaywallViews: number
  recentPaidCustomers: number
  recentRevenueCents: number
}

export type AdminCreatorWarning = {
  id: string
  creatorProfileId: string
  note: string
  category?: string
  penaltyPoints?: number
  submissionId?: string | null
  createdByEmail: string
  createdAt: string
  resolvedAt: string | null
  resolvedByEmail: string | null
}

export type AdminCreator = {
  retainerTerms?: import('@/lib/creator/retainer').CreatorRetainer | null
  videoStudioAccess?: boolean
  bundledPayouts?: boolean
  id: string
  displayName: string
  email: string
  image: string | null
  primaryContact: string | null
  authStatus: CreatorStatus
  paymentOption: 'paypal' | 'crypto' | 'bank_transfer'
  paypalEmail: string | null
  paypalMeUrl?: string | null
  cryptoNetwork: string | null
  cryptoWalletAddress: string | null
  bankTransferDetails?: string | null
  accountCount: number
  warnings?: AdminCreatorWarning[]
  attribution: AdminAttributionReport
  createdAt: string
}

export type AdminAccount = {
  lastActiveAt?: string | null
  id: string
  creatorProfileId: string
  creatorName: string
  creatorEmail: string
  platform: 'tiktok' | 'instagram'
  handle: string | null
  displayName?: string | null
  profileUrl: string | null
  avatarUrl: string | null
  connectionMethod: 'manual' | 'oauth'
  analyticsVideoUrl: string | null
  analyticsContentType: string | null
  analyticsSizeBytes: number | null
  analyticsPeriodDays: number | null
  analyticsConfirmedAt: string | null
  status: AccountStatus
  reviewNote: string | null
  trackingLinkUrl: string | null
  trackingLinkSlug: string | null
  trackingLinkActive: boolean | null
  attribution: AdminAttributionReport
  createdAt: string
}

export type AdminSubmission = {
  studioGenerationId?: string | null
  exclusivityConfirmed?: boolean
  updatedAt?: string
  creatorAvatarUrl?: string | null
  unreadMessages?: number
  sprintId?: string | null
  sprintName?: string | null
  sprintTerms?: import('@/lib/creator/sprints').SprintTerms | null
  reviewRequestedAt?: string | null
  analyticsVideoRequest?: import('@/lib/creator/analytics-video-request').AnalyticsVideoRequest | null
  approvedAmountCents?: number | null
  campaignPayoutCorrected?: boolean
  id: string
  creatorProfileId: string
  creatorName: string
  creatorEmail: string
  socialAccountId: string | null
  socialHandle: string | null
  socialAccountStatus: AccountStatus | null
  formatId: string | null
  requirementsConfirmedAt: string | null
  title: string
  platform: string
  caption: string | null
  postUrl: string | null
  videoUrl: string | null
  videoContentType: string | null
  videoSizeBytes: number | null
  analyticsScreenshotUrl: string | null
  analyticsStorageKey?: string | null
  audienceCheck?: import('@/lib/creator/audience-check').AudienceCheck | null
  analyticsContentType: string | null
  analyticsSizeBytes: number | null
  viewCountThreshold: number | null
  usAudiencePercent: number | null
  adminViewCountThreshold: number | null
  adminUsAudiencePercent: number | null
  status: SubmissionStatus
  reviewNote: string | null
  reviewChecklist: SubmissionReviewResult[] | null
  createdAt: string
}

export type AdminPayment = {
  cryptoChain?: import('@/lib/admin/crypto-payouts/shared').PayoutChain | null
  bonusSprintId?: string | null
  bonusKey?: string | null
  bonusNote?: string | null
  payoutRequestId?: string | null
  id: string
  creatorProfileId: string
  creatorName: string
  creatorEmail: string
  submissionId: string | null
  submissionTitle: string | null
  amountCents: number
  currency: string
  status: PaymentStatus
  paymentOption: 'paypal' | 'crypto' | 'bank_transfer'
  providerReference: string | null
  hasReceipt?: boolean
  paidAt: string | null
  createdAt: string
}

export type AdminAttributionMetrics = {
  postedAt?: string | null
  submissionId: string
  qualifiedViews: number
  linkClicks: number
  installs: number
  firstTimePaidCustomers: number
  createdAt: string
  updatedAt: string
}

export type AdminProgramSettings = {
  id: string
  monthlySubscriptionCents: number
  ninetyDayContributionMarginCents: number
  updatedAt: string
}

export type AdminDashboard = {
  creatorCoverage?: { mobile?: Array<Record<string, unknown>>; storeCampaigns?: Array<Record<string, unknown>>; sources: Array<Record<string, unknown>>; billing: Array<Record<string, unknown>>; posts: Array<Record<string, unknown>>; totals: Record<string, unknown> }
  payoutRequests?: import('@/components/creator/types').CreatorPayoutRequest[]
  creators: AdminCreator[]
  accounts: AdminAccount[]
  submissions: AdminSubmission[]
  payments: AdminPayment[]
  attributionMetrics: AdminAttributionMetrics[]
  settings: AdminProgramSettings
  rules: {
    compensationCapRate: number
    conversionBonusCapRate: number
  }
}

export type AdminQueueSubmission = Pick<AdminSubmission,
  'id' | 'creatorProfileId' | 'creatorName' | 'socialHandle' | 'sprintId' | 'sprintName' |
  'formatId' | 'title' | 'platform' | 'status' | 'approvedAmountCents' | 'adminViewCountThreshold' |
  'adminUsAudiencePercent' | 'createdAt' | 'reviewRequestedAt' | 'studioGenerationId' | 'sprintTerms' | 'analyticsVideoRequest'
> & { formatName?: string | null; retainerTerms?: import('@/lib/creator/retainer').CreatorRetainer | null;
  submitOnPublish?: boolean; viewCountThreshold?: number | null;
  awaitingAnalyticsVideo?: boolean; hasAnalyticsRecording?: boolean; analyticsScreenshotUrl?: string | null }

export type AdminBundleData = {
  submissions: Pick<AdminSubmission, 'id' | 'title' | 'platform' | 'socialHandle' | 'sprintId' | 'approvedAmountCents' | 'status' | 'adminViewCountThreshold' | 'adminUsAudiencePercent'>[]
  payments: Pick<AdminPayment, 'submissionId' | 'payoutRequestId' | 'amountCents' | 'status' | 'cryptoChain'>[]
  creators: Pick<AdminCreator, 'id' | 'displayName'>[]
  payoutRequests?: AdminDashboard['payoutRequests']
}

export type AdminQueueData = Omit<AdminBundleData, 'submissions'> & {
  submissions: AdminQueueSubmission[]
  counts: { videoCount: number; pendingCount: number; newVideos: number; accountCount: number; newAccounts: number; paymentCount: number; outstandingCents: number; newOutstandingCents: number }
}

export type AdminReviewedPage = {
  submissions: AdminQueueSubmission[]
  next: { before: string; beforeId: string } | null
}

export type AdminSubmissionReviewData = {
  target: AdminSubmission
  creator?: AdminCreator
  payments: AdminPayment[]
  metrics: AdminAttributionMetrics[]
  balance: Omit<ReturnType<typeof import('@/lib/creator/money').creatorContentBalances>, 'unpaid'> & { unpaid: [string, number][] }
}

export type ReviewTarget =
  | { resource: 'creator'; item: AdminCreator }
  | { resource: 'account'; item: AdminAccount }
  | { resource: 'submission'; item: AdminSubmission }
  | { resource: 'payment'; item: AdminPayment }
