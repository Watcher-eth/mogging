import type { AdminDashboard } from '@/components/admin/creator-types'
import { creatorEarnedCents } from '@/lib/creator/money'

export const PERFORMANCE_TIME_ZONE = 'America/Los_Angeles'
// Experimental campaigns are excluded from this performance report, not deleted.
export const PERFORMANCE_EXCLUDED_CREATOR_IDS = [
  'd6073111-cfa8-48bb-b9db-98fc0de28381', // matheo.psl
  '106184ef-136c-4768-ad5e-fd8a01b3d571', // bejapsl
  '4e0596a2-39b3-41ee-9734-077eff30899d', // Valerie
] as const
const excludedCreators = new Set<string>(PERFORMANCE_EXCLUDED_CREATOR_IDS)
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: PERFORMANCE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
export function performanceDay(date: string | Date) {
  const value = new Date(date)
  return Number.isFinite(value.getTime()) ? dayFormatter.format(value) : null
}
function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
type Totals = { posts: number; approvedPosts: number; reportedViews: number; reviewedViews: number; costViews: number; earnedCents: number; paidCents: number; unpaidCents: number }
const emptyTotals = (): Totals => ({ posts: 0, approvedPosts: 0, reportedViews: 0, reviewedViews: 0, costViews: 0, earnedCents: 0, paidCents: 0, unpaidCents: 0 })
function add(total: Totals, item: Totals) {
  for (const key of ['posts', 'approvedPosts', 'reportedViews', 'reviewedViews', 'costViews', 'earnedCents', 'paidCents', 'unpaidCents'] as const) total[key] += item[key]
}
export function viewCpm(cents: number, views: number) { return views > 0 ? cents / 100 / views * 1000 : null }
function postPlatform(platform: string) {
  const value = platform.trim().toLowerCase()
  return value.startsWith('instagram') ? 'instagram' : value.startsWith('tiktok') ? 'tiktok' : value
}

export function buildCreatorPerformance(data: Pick<AdminDashboard, 'submissions' | 'payments' | 'creators'>, options: { days: number | null; platform: string; now?: Date }) {
  const today = performanceDay(options.now || new Date())!
  const allSubmissions = data.submissions.filter(s => !excludedCreators.has(s.creatorProfileId) && (options.platform === 'all' || postPlatform(s.platform) === options.platform))
  const selectedIds = new Set(allSubmissions.map(s => s.id))
  const bySubmission = new Map<string, number>()
  const cashByDay = new Map<string, number>()
  let excludedPayments = 0
  let undatedPayments = 0
  for (const payment of data.payments) {
    if (excludedCreators.has(payment.creatorProfileId)) continue
    if (payment.status !== 'paid') continue
    if (payment.currency.toUpperCase() !== 'USD' || !payment.submissionId) { excludedPayments++; continue }
    if (!selectedIds.has(payment.submissionId)) continue
    bySubmission.set(payment.submissionId, (bySubmission.get(payment.submissionId) || 0) + payment.amountCents)
    const day = payment.paidAt && performanceDay(payment.paidAt)
    if (day) cashByDay.set(day, (cashByDay.get(day) || 0) + payment.amountCents)
    else undatedPayments++
  }
  const posts = allSubmissions.map(s => {
    const paidCents = bySubmission.get(s.id) || 0
    const earnedCents = Math.max(Math.round(creatorEarnedCents(s)), paidCents)
    const reviewedViews = Math.max(0, s.adminViewCountThreshold || 0)
    const approved = s.status === 'approved' || s.status === 'paid' || earnedCents > 0
    return { id: s.id, creatorId: s.creatorProfileId, creatorName: s.creatorName, platform: postPlatform(s.platform), day: performanceDay(s.createdAt),
      posts: 1, approvedPosts: Number(approved), reportedViews: Math.max(0, s.viewCountThreshold || 0, reviewedViews), reviewedViews,
      costViews: approved ? reviewedViews : 0, earnedCents, paidCents, unpaidCents: Math.max(0, earnedCents - paidCents) }
  })
  const firstDay = [...posts.flatMap(p => p.day ? [p.day] : []), ...cashByDay.keys()].sort()[0] || today
  const start = options.days ? shiftDay(today, 1 - options.days) : firstDay
  const days = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1)
  const previousStart = shiftDay(start, -days)
  const daily = new Map(Array.from({ length: days }, (_, i) => {
    const day = shiftDay(start, i)
    const bucket = { ...emptyTotals(), day, tiktokViews: 0, instagramViews: 0, cashPaidCents: cashByDay.get(day) || 0 }
    return [day, bucket] as const
  }))
  const total = emptyTotals(), previous = emptyTotals(), allTime = emptyTotals()
  const creators = new Map<string, Totals & { id: string; name: string; tiktokViews: number; instagramViews: number }>()
  const creatorNames = new Map(data.creators.map(c => [c.id, c.displayName]))
  const platforms = new Map<string, Totals & { platform: string }>()
  for (const post of posts) {
    const creator = creators.get(post.creatorId) || { ...emptyTotals(), id: post.creatorId, name: creatorNames.get(post.creatorId) || post.creatorName, tiktokViews: 0, instagramViews: 0 }
    add(creator, post)
    if (post.platform === 'tiktok') creator.tiktokViews += post.reportedViews
    if (post.platform === 'instagram') creator.instagramViews += post.reportedViews
    creators.set(post.creatorId, creator)
    add(allTime, post)
    if (!post.day || post.day < start || post.day > today) {
      if (post.day && post.day >= previousStart && post.day < start) add(previous, post)
      continue
    }
    add(total, post)
    const bucket = daily.get(post.day)!
    add(bucket, post)
    if (post.platform === 'tiktok') bucket.tiktokViews += post.reportedViews
    if (post.platform === 'instagram') bucket.instagramViews += post.reportedViews
    const platform = platforms.get(post.platform) || { ...emptyTotals(), platform: post.platform }
    add(platform, post)
    platforms.set(post.platform, platform)
  }
  return { start, today, days, total, previous, allTime, excludedPayments, undatedPayments,
    cashPaidCents: [...daily.values()].reduce((sum, row) => sum + row.cashPaidCents, 0),
    daily: [...daily.values()].map(row => ({ ...row, earned: row.earnedCents / 100, cashPaid: row.cashPaidCents / 100, cpm: viewCpm(row.earnedCents, row.costViews) })),
    creators: [...creators.values()].sort((a, b) => b.reportedViews - a.reportedViews),
    platforms: [...platforms.values()].sort((a, b) => b.reportedViews - a.reportedViews) }
}
