import type { CreatorSubmission } from '@/components/creator/types'
import type { SupportArtifact, SupportDataSource, SupportOverview } from './contracts'
import type { SupportVideoAnalytics } from './video-analytics'

export function isGeneralVideoPerformanceQuestion(message: string) {
  return /\b(?:video|videos|post|posts|content|submission|submissions)\b/i.test(message) && (
    /\b(?:performance|perform(?:ed|ing)?|doing)\b/i.test(message)
    || /\bhow (?:well )?(?:did|do|does|is|are|has|have)\b[\s\S]*\b(?:do|done|did|doing|went|go|gone)\b/i.test(message)
  )
}
export function asksForViews(message: string) { return /\b(?:views?|view counts?)\b/i.test(message) }
export function asksForContentGuidance(message: string) {
  return /\b(?:requirements?|rules?|eligible|eligibility|qualif\w*|brief|allowed|prohibited|cta|hook|caption)\b|\b(?:how|help)\b.*\bsubmit\b|\b(?:why|explain)\b.*\b(?:rejected|rejection|decision)\b/i.test(message)
}
export type SubmissionViews = { id: string; title: string; views: number | null; basis: 'verified' | 'submitted'; status: CreatorSubmission['status'] }
export function recordedSubmissionViews(submissions: CreatorSubmission[]): SubmissionViews[] {
  return submissions.map<SubmissionViews>(s => ({ id: s.id, title: s.title, views: s.adminViewCountThreshold ?? s.viewCountThreshold, basis: s.adminViewCountThreshold != null ? 'verified' : 'submitted', status: s.status }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
}
export async function performanceSubmissions(source: SupportDataSource, report: SupportVideoAnalytics) {
  // A specific record is re-read through the same owner boundary, even if it is not recent.
  if (report.selection === 'video' || report.selection === 'posted') {
    const rows = (await Promise.all(report.videos.map(v => source.submissions({ id: v.id })))).flatMap(r => r.submissions)
    const groups: SupportOverview['groups'] = [
      { key: 'review', title: 'In review', submissions: rows.filter(s => s.status === 'pending' || s.status === 'in_review'), total: 0 },
      { key: 'approved-paid', title: 'Approved & paid', submissions: rows.filter(s => s.status === 'approved' || s.status === 'paid'), total: 0 },
      { key: 'rejected', title: 'Rejected', submissions: rows.filter(s => s.status === 'rejected'), total: 0 },
    ].map(g => ({ ...g, total: g.submissions.length })) as SupportOverview['groups']
    const artifact: Extract<SupportArtifact, { type: 'submissions' }> = { type: 'submissions', groups, submissions: rows, total: rows.length }
    return { artifact, scope: 'Matching videos', views: recordedSubmissionViews(rows), counts: Object.fromEntries(['pending', 'in_review', 'approved', 'paid', 'rejected'].map(status => [status, rows.filter(s => s.status === status).length])) }
  }
  const overview = await source.overview()
  const rows = overview.groups.flatMap(g => g.submissions)
  const artifact: Extract<SupportArtifact, { type: 'submissions' }> = { type: 'submissions', groups: overview.groups, submissions: rows, total: Object.values(overview.counts).reduce((sum, count) => sum + count, 0) }
  return { artifact, scope: 'Recent submissions · current status', views: recordedSubmissionViews(rows), counts: overview.counts }
}
