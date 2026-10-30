export type CreatorProfile = {
  videoStudioAccess?: boolean
  bundledPayouts?: boolean
  id: string
  displayName: string
  socialHandle: string | null
  authStatus: 'pending' | 'verified' | 'suspended'
  paymentOption: 'paypal' | 'crypto'
  paypalEmail: string | null
  paypalMeUrl?: string | null
  cryptoNetwork: string | null
  cryptoWalletAddress: string | null
}

export type CreatorSubmission = {
  studioGenerationId?: string | null
  updatedAt?: string | null
  unreadMessages?: number
  sprintId?: string | null
  sprintTerms?: import('@/lib/creator/sprints').SprintTerms | null
  reviewRequestedAt?: string | null
  approvedAmountCents?: number | null
  postedAt?: string | null
  id: string
  socialAccountId: string | null
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
  adminViewCountThreshold: number | null
  adminUsAudiencePercent: number | null
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid'
  reviewNote: string | null
  reviewChecklist: Array<{ id: string; met: boolean; note: string | null }> | null
  createdAt: string
}

export type CreatorPayment = {
  creatorReferralAwardId?: string | null
  bonusSprintId?: string | null
  bonusKey?: string | null
  bonusNote?: string | null
  payoutRequestId?: string | null
  id: string
  submissionId: string | null
  amountCents: number
  currency: string
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'
  paymentOption: 'paypal' | 'crypto'
  paidAt: string | null
}

export type CreatorSocialAccount = {
  followers?: import('@/lib/creator/tiktok-anchor').CreatorFollowers | null
  tiktokAnchorJoinedAt?: string | null
  id: string
  platform: 'tiktok' | 'instagram'
  handle: string | null
  displayName?: string | null
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
  trackingLink: {
    id: string
    slug: string
    publicUrl: string
    isActive: boolean
  } | null
}

export type CreatorDashboard = {
  updates?: import('@/lib/creator/updates').CreatorUpdate[]
  payoutRequests?: CreatorPayoutRequest[]
  profile: CreatorProfile | null
  submissions: CreatorSubmission[]
  payments: CreatorPayment[]
  socialAccounts: CreatorSocialAccount[]
  communityMetrics: {
    totalQualifiedViews: number
    totalFirstTimePaidCustomers: number
    totalPaidCents: number
    paidCreators: number
    approvedSubmissions: number
  }
  featureFlags: {
    creatorAccountRequiredForSubmission: boolean
  }
}

export type CreatorPayoutRequest = {
  id: string
  creatorProfileId: string
  amountCents: number
  status: 'pending' | 'paid'
  paymentOption: 'paypal' | 'crypto'
  destination: string
  network: string | null
  requestedAt: string
  paidAt: string | null
}

export function creatorAccountLabel(account: Pick<CreatorSocialAccount, 'handle' | 'displayName' | 'platform'>) {
  return account.handle ? `@${account.handle}` : account.displayName || (account.platform === 'tiktok' ? 'TikTok account' : 'Instagram account')
}
