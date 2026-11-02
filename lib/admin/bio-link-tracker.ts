import type { AdminAccount, AdminSubmission } from '@/components/admin/creator-types'
import { hasLaunchCampaignBonuses } from '@/lib/creator/campaign-launch'

const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' })

export function bioLinkMonth(date: string | Date) {
  const parsed = new Date(date)
  if (!Number.isFinite(parsed.getTime())) return null
  const parts = monthFormatter.formatToParts(parsed)
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}

export type BioLinkMonth = { submissions: AdminSubmission[]; verified: number }

export type AccountSort = 'active-desc' | 'active-asc' | 'consistency-desc' | 'consistency-asc' | 'connected-desc'

export function accountConsistency(history: Map<string, BioLinkMonth> | undefined, year: number) {
  let active = 0, complete = 0
  for (const [month, entry] of history || []) {
    if (!month.startsWith(`${year}-`)) continue
    active++
    if (entry.verified === entry.submissions.length) complete++
  }
  return { active, complete, rate: active ? complete / active : null }
}

export function filterAndSortAccounts(accounts: AdminAccount[], tracker: ReturnType<typeof buildBioLinkTracker>, year: number, query: string, sort: AccountSort) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term => term.replace(/^@/, ''))
  const rows = accounts.filter(account => {
    const searchable = [account.handle, account.displayName, account.creatorName, account.creatorEmail, account.platform].filter(Boolean).join(' ').toLowerCase()
    return terms.every(term => searchable.includes(term))
  }).map(account => {
    const date = Date.parse((sort === 'connected-desc' ? account.createdAt : account.lastActiveAt) || '')
    return { account, value: sort.startsWith('consistency') ? accountConsistency(tracker.get(account.id), year).rate : Number.isFinite(date) ? date : null }
  })
  rows.sort((left, right) => {
    // Unknown activity and accounts without eligible videos always stay at the bottom.
    if (left.value === null && right.value !== null) return 1
    if (right.value === null && left.value !== null) return -1
    const difference = (left.value ?? 0) - (right.value ?? 0)
    if (difference) return sort.endsWith('asc') ? difference : -difference
    return (left.account.handle || left.account.displayName || left.account.creatorName).localeCompare(right.account.handle || right.account.displayName || right.account.creatorName) || left.account.id.localeCompare(right.account.id)
  })
  return rows.map(row => row.account)
}

export function lastActiveLabel(value: string | null | undefined, now = Date.now()) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

export function activityDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'No recorded portal visit'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' PT'
}

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
