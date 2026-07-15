export type CreatorProfile = {
  id: string
  displayName: string
  socialHandle: string | null
  authStatus: 'pending' | 'verified' | 'suspended'
  paymentOption: 'paypal' | 'crypto'
  paypalEmail: string | null
  cryptoNetwork: string | null
  cryptoWalletAddress: string | null
}

export type CreatorSubmission = {
  id: string
  socialAccountId: string | null
  title: string
  platform: string
  caption: string | null
  postUrl: string | null
  videoUrl: string
  videoContentType: string
  videoSizeBytes: number
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid'
  reviewNote: string | null
  createdAt: string
}

export type CreatorPayment = {
  id: string
  submissionId: string | null
  amountCents: number
  currency: string
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'
  paymentOption: 'paypal' | 'crypto'
  paidAt: string | null
}

export type CreatorSocialAccount = {
  id: string
  platform: 'tiktok' | 'instagram'
  handle: string
  profileUrl: string | null
  avatarUrl: string | null
  connectionMethod: string
  providerAccountId: string | null
  oauthVerifiedAt: string | null
  analyticsVideoUrl: string | null
  analyticsStorageKey: string | null
  analyticsContentType: string | null
  analyticsSizeBytes: number | null
  analyticsPeriodDays: number | null
  analyticsConfirmedAt: string | null
  status: 'pending' | 'approved' | 'missing_information'
  reviewNote: string | null
  createdAt: string
}

export type CreatorDashboard = {
  profile: CreatorProfile | null
  submissions: CreatorSubmission[]
  payments: CreatorPayment[]
  socialAccounts: CreatorSocialAccount[]
}
