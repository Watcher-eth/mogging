import { CREATOR_TIER_ONE_COUNTRIES } from './audience'
import { sprintPayoutCents, type SprintTerms } from './sprints'

export type AudienceCountry = { code: string; name: string; percent: number; precision: number; frameIds: string[] }
export type AudienceMetrics = {
  averageWatchTimeSeconds: number | null
  dropOffTimeSeconds?: number | null
  totalViewers: number | null
  totalViews: number | null
  totalViewsExact?: boolean
  age: { range: string; percent: number }[]
}
export type AudienceMetric = keyof AudienceMetrics
export type AudienceCheck = {
  version: 1
  basis?: 'displayed_countries'
  storageKey: string
  status: 'queued' | 'processing' | 'verified' | 'needs_review'
  checkedAt?: string
  startedAt?: string
  submittedAt?: string
  context?: { creatorProfileId: string; socialAccountId: string | null; campaignId: string | null; platform: string; postUrl: string | null }
  reason?: string
  diagnostics?: { stage: 'video' | 'classification' | 'extraction' | 'verification'; errorCode?: string;
    scope?: string; issues?: string[]; frames?: { id: string; seconds: number; category: string; confidence: number }[];
    secondReading?: { scope: string; completeVisibleList: boolean; countries: { code: string; percent: number }[]; issues: string[] } }
  costUsd?: number
  countries?: AudienceCountry[]
  otherPercent?: number | null
  percent?: number
  minimumPercent?: number
  maximumPercent?: number
  evidenceSeconds?: number[]
  verification?: { scope: number | null; coverage?: number | null; countries: Record<string, number | null>; secondReadingMatched?: boolean; correctedReadingConfirmed?: boolean }
  metrics?: AudienceMetrics
  metricsVerified?: Partial<Record<AudienceMetric, boolean>>
  metricsConfidence?: Partial<Record<AudienceMetric, number | null>>
  metricsEvidenceSeconds?: number[]
  review?: { source: 'automatic' | 'manual'; percent: number; views?: number; viewsSource?: 'automatic' | 'manual'; reviewerId: string; reviewedAt: string }
}

export const queuedAudienceCheck = (storageKey: string): AudienceCheck => ({ version: 1, storageKey, status: 'queued', submittedAt: new Date().toISOString() })

export function verifiedRecordingViews(check: AudienceCheck | null | undefined, storageKey: string | null | undefined) {
  const views = check?.metrics?.totalViews
  return storageKey && check?.storageKey === storageKey && check.metricsVerified?.totalViews && check.metricsVerified.totalViewsExact && check.metrics?.totalViewsExact
    && typeof views === 'number' && Number.isSafeInteger(views) && views >= 0 && views <= 2_000_000_000 ? views : null
}
const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '')
const tierOne = new Set(CREATOR_TIER_ONE_COUNTRIES.map(normalize))

export function audienceCountryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return null
  return names.of(code) ?? null
}

export function stableAudiencePayout(terms: SprintTerms, minimum: number, maximum: number) {
  return minimum >= 0 && maximum <= 100 && minimum <= maximum
    && terms.milestones.every(m => sprintPayoutCents(terms, m.views, minimum) === sprintPayoutCents(terms, m.views, maximum))
    // The audience bonus has a separate 45% threshold, independent of content rates.
    && (minimum >= 45) === (maximum >= 45)
}

export function assessAudience(countries: AudienceCountry[], terms: SprintTerms) {
  const seen = new Set<string>()
  let visible = 0, percent = 0, tierError = 0, nonTier = 0, nonTierError = 0
  for (const country of countries) {
    const name = audienceCountryName(country.code)
    if (!name || normalize(name) !== normalize(country.name) || seen.has(country.code)
      || !Number.isFinite(country.percent) || country.percent < 0 || country.percent > 100
      || ![0, 1, 2].includes(country.precision)) throw new Error('Invalid or conflicting country readings')
    seen.add(country.code)
    visible += country.percent
    const error = 0.5 * 10 ** -country.precision
    if (tierOne.has(normalize(name))) { percent += country.percent; tierError += error }
    else { nonTier += country.percent; nonTierError += error }
  }
  if (!countries.length || visible > 100 + tierError + nonTierError + 0.001) throw new Error('The country list could not be read consistently')
  const round = (value: number) => Math.round(value * 1000) / 1000
  const minimumPercent = round(Math.max(0, percent - tierError))
  const maximumPercent = round(Math.min(100, 100 - nonTier + nonTierError))
  return { percent: round(percent), minimumPercent, maximumPercent,
    stable: stableAudiencePayout(terms, minimumPercent, maximumPercent) }
}

export function audienceListTotalConsistent(countries: ReadonlyArray<Pick<AudienceCountry, 'percent' | 'precision'>>, otherPercent: number | null | undefined) {
  if (otherPercent == null) return true
  if (!Number.isFinite(otherPercent) || otherPercent < 0 || otherPercent > 100) return false
  const total = countries.reduce((sum, country) => sum + country.percent, otherPercent)
  const rounding = countries.reduce((sum, country) => sum + 0.5 * 10 ** -country.precision, 0.5)
  return Math.abs(total - 100) <= rounding + 0.001
}

export function audienceReviewError(check: AudienceCheck | null | undefined, storageKey: string | null | undefined,
  evidenceKey: string | null | undefined, percent: number | null, manual: boolean, terms: SprintTerms) {
  if (!storageKey || evidenceKey !== storageKey) return 'The analytics recording changed. Refresh this submission before saving.'
  if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) return 'Enter the Tier 1 audience percentage after checking the recording.'
  if (manual) return null
  const error = 'Audience needs manual review. Check the recording and confirm the audience in Earnings.'
  if (check?.storageKey !== storageKey || check.status !== 'verified' || check.percent !== percent) return error
  if (check.basis === 'displayed_countries') {
    try { return assessAudience(check.countries ?? [], terms).percent === percent
      && audienceListTotalConsistent(check.countries ?? [], check.otherPercent) ? null : error }
    catch { return error }
  }
  return check.minimumPercent !== undefined && check.maximumPercent !== undefined
    && stableAudiencePayout(terms, check.minimumPercent, check.maximumPercent) ? null : error
}
