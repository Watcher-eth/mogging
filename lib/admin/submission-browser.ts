import type { AdminSubmission, SubmissionStatus } from '@/components/admin/creator-types'
import { submissionReviewQueueId, submissionReviewQueueLabels } from './creator-overview'

export const submissionStatuses: { value: 'all' | SubmissionStatus; label: string }[] = [
  { value: 'all', label: 'All submissions' }, { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In review' }, { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }, { value: 'paid', label: 'Paid' },
]
export type SubmissionFilters = {
  query: string
  status: 'all' | SubmissionStatus
  campaign: string
  category: string
  platform: string
  attention: 'all' | 'rereviews' | 'unread' | 'audience'
  from: string
  to: string
  sort: 'newest' | 'oldest' | 'views' | 'creator'
  group: 'none' | 'campaign' | 'category' | 'status' | 'creator'
}
export const defaultSubmissionFilters: SubmissionFilters = {
  query: '', status: 'all', campaign: 'all', category: 'all', platform: 'all',
  attention: 'all', from: '', to: '', sort: 'newest', group: 'none',
}
export function submissionCampaignKey(item: AdminSubmission) {
  return item.sprintId || (item.sprintName ? `name:${item.sprintName}` : 'unassigned')
}
export function submissionCampaignLabel(item: AdminSubmission) {
  return item.sprintName || (item.sprintId ? 'Campaign unavailable' : 'No campaign assigned')
}
export function submissionViews(item: AdminSubmission) {
  return item.adminViewCountThreshold ?? item.viewCountThreshold
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function calendarDay(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function filterSubmissions(items: AdminSubmission[], filters: SubmissionFilters) {
  const words = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  const result = items.filter(item => {
    if (filters.status !== 'all' && item.status !== filters.status) return false
    if (filters.campaign !== 'all' && submissionCampaignKey(item) !== filters.campaign) return false
    if (filters.category !== 'all' && submissionReviewQueueId(item) !== filters.category) return false
    if (filters.platform !== 'all' && item.platform !== filters.platform) return false
    if (filters.attention === 'rereviews' && !item.reviewRequestedAt) return false
    if (filters.attention === 'unread' && !(item.unreadMessages && item.unreadMessages > 0)) return false
    if (filters.attention === 'audience' && !(item.audienceCheck?.status === 'needs_review' && !item.audienceCheck.review)) return false
    if (filters.from || filters.to) {
      const day = calendarDay(item.createdAt)
      if (!day || (filters.from && day < filters.from) || (filters.to && day > filters.to)) return false
    }
    if (!words.length) return true
    const format = item.sprintTerms?.formats.find(format => format.id === item.formatId)
    const text = normalize([
      item.creatorName, item.creatorEmail, item.socialHandle ? `@${item.socialHandle.replace(/^@/, '')}` : '', item.title, item.caption, item.sprintName,
      item.postUrl, item.id, item.platform, item.status, item.status.replaceAll('_', ' '), item.formatId, format?.name, submissionReviewQueueLabels[submissionReviewQueueId(item)],
    ].filter(Boolean).join(' '))
    return words.every(word => text.includes(word))
  })
  return result.sort((a, b) => {
    if (filters.sort === 'views') {
      const difference = (submissionViews(b) ?? -1) - (submissionViews(a) ?? -1)
      if (difference) return difference
    }
    if (filters.sort === 'creator') {
      const difference = a.creatorName.localeCompare(b.creatorName)
      if (difference) return difference
    }
    const aTime = Date.parse(a.createdAt), bTime = Date.parse(b.createdAt)
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
      if (Number.isFinite(aTime)) return -1
      if (Number.isFinite(bTime)) return 1
      return a.id.localeCompare(b.id)
    }
    return (filters.sort === 'oldest' ? aTime - bTime : bTime - aTime) || a.id.localeCompare(b.id)
  })
}
export function groupSubmissions(items: AdminSubmission[], group: SubmissionFilters['group']) {
  const groups = new Map<string, { id: string; label: string; items: AdminSubmission[] }>()
  for (const item of items) {
    const category = submissionReviewQueueId(item)
    const id = group === 'campaign' ? submissionCampaignKey(item) : group === 'category' ? category
      : group === 'status' ? item.status : group === 'creator' ? item.creatorProfileId : 'all'
    const label = group === 'campaign' ? submissionCampaignLabel(item) : group === 'category' ? submissionReviewQueueLabels[category]
      : group === 'status' ? submissionStatuses.find(status => status.value === item.status)!.label
        : group === 'creator' ? item.creatorName : 'All submissions'
    if (!groups.has(id)) groups.set(id, { id, label, items: [] })
    groups.get(id)!.items.push(item)
  }
  return [...groups.values()]
}
