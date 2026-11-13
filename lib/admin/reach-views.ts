export const MAX_REACH_VIEW_COUNT = 2_000_000_000

export type ReachViewCounts = {
  reach: number | null
  views: number | null
  source: 'ocr' | 'manual' | 'creator_submitted_views'
  approximate?: boolean
  unverified?: boolean
}

export type ManualReachViewCounts = {
  reach: number
  views: number
  storageKey: string | null
}

export function isReachViewCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_REACH_VIEW_COUNT
}

export function reachViewPercent(reach: number | null | undefined, views: number | null | undefined) {
  if (!isReachViewCount(reach) || !isReachViewCount(views) || views === 0 || reach > views) return null
  return (reach * 100) / views
}

export function withCreatorSubmittedViews(counts: ReachViewCounts | null | undefined, submittedViews: number | null | undefined) {
  if (counts?.source !== 'ocr' || reachViewPercent(counts.reach, counts.views) !== null
    || !isReachViewCount(submittedViews) || reachViewPercent(counts.reach, submittedViews) === null) return counts

  return { ...counts, views: submittedViews, source: 'creator_submitted_views', approximate: true } satisfies ReachViewCounts
}

export function reachViewCategory(percent: number) {
  if (percent >= 90) return 'pureReach'
  if (percent >= 65 && percent <= 85) return 'sweetSpot'
  if (percent < 50) return 'heavyLooping'
  return null
}
