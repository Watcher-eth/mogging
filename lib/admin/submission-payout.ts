import { sprintPayoutCents, type SprintTerms } from '@/lib/creator/sprints'
import { calculateCreatorPayout, CREATOR_VIEW_THRESHOLDS } from '@/lib/creator/payouts'

export type AdminPayoutSelection = {
  viewCountThreshold: number
  usAudiencePercent: number | null
}

export function getSubmissionPayoutEstimate(selection: AdminPayoutSelection, submission?: { sprintTerms?: SprintTerms | null }) {
  // The submitted version's saved terms own the payout, including on rereview.
  if (submission?.sprintTerms) return { payout: sprintPayoutCents(submission.sprintTerms, selection.viewCountThreshold, selection.usAudiencePercent) / 100, isCapped: false }
  if (!selection.viewCountThreshold || !CREATOR_VIEW_THRESHOLDS.some(item => item.views === selection.viewCountThreshold)) return null
  return calculateCreatorPayout(selection.viewCountThreshold, true, selection.usAudiencePercent)
}
