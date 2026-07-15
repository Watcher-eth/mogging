export type CreatorStatus = 'pending' | 'verified' | 'suspended'
export type AccountStatus = 'pending' | 'approved' | 'missing_information'
export type SubmissionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid'
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'

export type AdminCreator = {
  id: string
  displayName: string
  email: string
  image: string | null
  primaryContact: string | null
  authStatus: CreatorStatus
  paymentOption: 'paypal' | 'crypto'
  paypalEmail: string | null
  cryptoNetwork: string | null
  cryptoWalletAddress: string | null
  createdAt: string
}

export type AdminAccount = {
  id: string
  creatorProfileId: string
  creatorName: string
  creatorEmail: string
  platform: 'tiktok' | 'instagram'
  handle: string
  profileUrl: string | null
  connectionMethod: 'manual' | 'oauth'
  analyticsVideoUrl: string | null
  analyticsContentType: string | null
  analyticsSizeBytes: number | null
  analyticsPeriodDays: number | null
  analyticsConfirmedAt: string | null
  status: AccountStatus
  reviewNote: string | null
  createdAt: string
}

export type AdminSubmission = {
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
  analyticsContentType: string | null
  analyticsSizeBytes: number | null
  viewCountThreshold: number | null
  usAudiencePercent: number | null
  status: SubmissionStatus
  reviewNote: string | null
  createdAt: string
}

export type AdminPayment = {
  id: string
  creatorProfileId: string
  creatorName: string
  creatorEmail: string
  submissionId: string | null
  submissionTitle: string | null
  amountCents: number
  currency: string
  status: PaymentStatus
  paymentOption: 'paypal' | 'crypto'
  providerReference: string | null
  paidAt: string | null
  createdAt: string
}

export type AdminAttributionMetrics = {
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

export type ReviewTarget =
  | { resource: 'creator'; item: AdminCreator }
  | { resource: 'account'; item: AdminAccount }
  | { resource: 'submission'; item: AdminSubmission }
  | { resource: 'payment'; item: AdminPayment }
