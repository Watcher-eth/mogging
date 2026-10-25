export const CREATOR_REFERRAL_VIDEO_LIMIT = 5
export const creatorReferralCents = (paidCents: number) => Math.floor(Math.max(0, paidCents) / 20)

export type CreatorReferralReport = {
  inviteUrl: string
  invited: number
  earnedCents: number
  paidCents: number
  outstandingCents: number
  referrals: Array<{
    id: string
    name: string
    joinedAt: string
    approvedVideos: number
    earnedCents: number
    status: 'active' | 'complete' | 'on_hold'
  }>
}
