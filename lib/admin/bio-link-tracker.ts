import type { AdminSubmission } from '@/components/admin/creator-types'
import { hasLaunchCampaignBonuses } from '@/lib/creator/campaign-launch'

const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' })

export function bioLinkMonth(date: string | Date) {
  const parsed = new Date(date)
  if (!Number.isFinite(parsed.getTime())) return null
  const parts = monthFormatter.formatToParts(parsed)
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}

export type BioLinkMonth = { submissions: AdminSubmission[]; verified: number }

// Group by the video's original submission month, so later reviews do not move history.
// Account IDs keep two handles belonging to the same creator independent.
export function buildBioLinkTracker(submissions: AdminSubmission[]) {
  const accounts = new Map<string, Map<string, BioLinkMonth>>()
  for (const submission of submissions) {
    if (!submission.socialAccountId || !hasLaunchCampaignBonuses(submission)) continue
    const month = bioLinkMonth(submission.createdAt)
    if (!month) continue
    let months = accounts.get(submission.socialAccountId)
    if (!months) accounts.set(submission.socialAccountId, months = new Map())
    let entry = months.get(month)
    if (!entry) months.set(month, entry = { submissions: [], verified: 0 })
    entry.submissions.push(submission)
    if (submission.exclusivityConfirmed) entry.verified++
  }
  return accounts
}
