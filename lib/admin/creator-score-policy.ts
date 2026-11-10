// Shared by admin UI and server. Never import admin persistence into creator routes.
export const CREATOR_SCORE_VERSION = '1.0'
export const CREATOR_SCORE_START = '2026-11-10T08:00:00.000Z'
export const CREATOR_WARNING_OPTIONS = [
  { id: 'audience_mismatch', label: 'Audience inconsistent with analytics report', points: 40 },
  { id: 'views_mismatch', label: 'Views inconsistent with analytics report', points: 40 },
  { id: 'wrong_campaign', label: 'Submitted to the wrong campaign', points: 20 },
  { id: 'below_audience', label: 'Verified audience below campaign threshold', points: 30 },
  { id: 'content_violation', label: 'Content does not meet campaign requirements', points: 25 },
  { id: 'duplicate_content', label: 'Duplicate or reused content', points: 50 },
  { id: 'missing_evidence', label: 'Missing or incomplete analytics evidence', points: 15 },
  { id: 'missing_bio_link', label: 'Confirmed missing Mogging link in bio (sets bio component to 0)', points: 0 },
  { id: 'confirmed_fraud', label: 'Confirmed fabricated analytics or purchased engagement', points: 200 },
  { id: 'other', label: 'Other concern / internal note', points: 0 },
] as const
export type CreatorWarningCategory = typeof CREATOR_WARNING_OPTIONS[number]['id']
export const creatorWarningOption = (category: string) => CREATOR_WARNING_OPTIONS.find(option => option.id === category)

export type ScoreComponent = { id: string; label: string; points: number; maximum: number; status: 'measured' | 'provisional' | 'unknown'; detail: string }
export type CreatorScore = {
  creatorId: string; name: string; total: number; gross: number; deductions: number; assessed: boolean
  confidence: 'provisional' | 'unassessed'; version: string; components: ScoreComponent[]
  metrics: { submissions: number; approvedPosts: number; verifiedViews: number; tier1Percent: number | null; recentPosts: number; committedUsd: number; belowThreshold: number; activeWarnings: number }
  penalties: { id: string; category: string; label: string; points: number; submissionId: string | null }[]
}
export type ScoreHistoryEntry = { id: string; score: CreatorScore; delta: number; reason: string; actor: string | null; createdAt: string }
export type CreatorScoreRanking = CreatorScore & { rank: number | null; updatedAt: string; delta: number }
export type CreatorScoreReport = { creators: CreatorScoreRanking[]; generatedAt: string; version: string }

export type ScorePost = { id: string; creatorId: string; campaignId: string | null; status: string; views: number | null; audience: number | null; postedAt: string; terms: { minimumTier1Percent?: number } | null; earnedCents: number; bioVerified: boolean; bioCheckedAt: string | null; accountId: string | null }
export type ScoreWarning = { id: string; creatorId: string; category: string; points: number; submissionId: string | null; resolved: boolean; createdAt?: string }
export type ScoreAccount = { id: string; creatorId: string; followers: { source?: string; count?: number; range?: string } | null }
export type ScoreInput = { creators: { id: string; name: string }[]; posts: ScorePost[]; warnings: ScoreWarning[]; accounts: ScoreAccount[]; payments: { creatorId: string; submissionId: string | null; cents: number; currency: string }[]; campaigns: { id: string; name: string }[] }

// Strategic campaign incentives. Financial components deliberately await attribution validation.
export function campaignScorePoints(name: string) {
  if (/detailed.*analysis/i.test(name)) return 100
  if (/feature.*comparison/i.test(name)) return 75
  return 40
}

function groupByCreator<T extends { creatorId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.creatorId)
    if (group) group.push(row)
    else groups.set(row.creatorId, [row])
  }
  return groups
}

export function calculateCreatorScores(input: ScoreInput, now = new Date()): CreatorScore[] {
  const campaigns = new Map(input.campaigns.map(campaign => [campaign.id, campaignScorePoints(campaign.name)]))
  const posts = groupByCreator(input.posts)
  const warnings = groupByCreator(input.warnings.filter(warning => !warning.resolved))
  const accounts = groupByCreator(input.accounts)
  const payments = groupByCreator(input.payments)
  const round = (value: number) => Math.round(value * 10) / 10
  return input.creators.map(creator => {
    const all = posts.get(creator.id) || []
    const verified = all.filter(post => ['approved', 'paid'].includes(post.status) && post.views !== null)
    const views = verified.reduce((sum, post) => sum + Math.max(0, post.views || 0), 0)
    const audiencePosts = verified.filter(post => post.audience !== null && (post.views || 0) > 0)
    const audienceViews = audiencePosts.reduce((sum, post) => sum + (post.views || 0), 0)
    const audience = audienceViews ? audiencePosts.reduce((sum, post) => sum + (post.views || 0) * post.audience!, 0) / audienceViews : null
    const recentPosts = verified.filter(post => { const age = now.getTime() - Date.parse(post.postedAt); return age >= 0 && age < 28 * 86400000 }).length
    const belowThreshold = all.filter(post => post.audience !== null && post.terms?.minimumTier1Percent !== undefined && post.audience < post.terms.minimumTier1Percent).length
    const campaignPoints = verified.reduce((sum, post) => sum + (campaigns.get(post.campaignId || '') || 40), 0) / Math.max(1, verified.length) * Math.min(1, verified.length / 3)
    const creatorPayments = (payments.get(creator.id) || []).filter(payment => payment.currency.toUpperCase() === 'USD')
    const paidByPost = new Map<string, number>()
    let unattached = 0
    for (const payment of creatorPayments) {
      if (payment.submissionId) paidByPost.set(payment.submissionId, (paidByPost.get(payment.submissionId) || 0) + payment.cents)
      else unattached += payment.cents
    }
    const committed = unattached + all.reduce((sum, post) => sum + Math.max(post.earnedCents, paidByPost.get(post.id) || 0), 0)
      + [...paidByPost].filter(([id]) => !all.some(post => post.id === id)).reduce((sum, [, cents]) => sum + cents, 0)
    // Only new, dated evidence counts. A default false boolean is not proof of a missing link.
    const creatorAccounts = accounts.get(creator.id) || []
    const active = warnings.get(creator.id) || []
    const bioStates = creatorAccounts.map(account => {
      const followers = account.followers
      const exempt = followers?.source !== 'self_reported' && typeof followers?.count === 'number' && followers.count < 1000
      if (exempt) return 50
      const confirmedMissing = active.some(warning => warning.category === 'missing_bio_link' && warning.createdAt && Date.parse(warning.createdAt) >= Date.parse(CREATOR_SCORE_START) && (warning.submissionId ? all.some(post => post.id === warning.submissionId && post.accountId === account.id) : false))
      if (confirmedMissing) return 0
      const checks = all.filter(post => post.accountId === account.id && post.bioCheckedAt && Date.parse(post.bioCheckedAt) >= Date.parse(CREATOR_SCORE_START) && Date.parse(post.bioCheckedAt) <= now.getTime())
        .sort((a, b) => Date.parse(b.bioCheckedAt!) - Date.parse(a.bioCheckedAt!))
      const latest = checks[0]
      // The existing scraper returns false both when absent and when blocked: false stays unknown.
      return !latest || now.getTime() - Date.parse(latest.bioCheckedAt!) > 7 * 86400000 ? null : latest.bioVerified ? 50 : null
    })
    const bioPoints = bioStates.length ? bioStates.reduce<number>((sum, value) => sum + (value ?? 25), 0) / bioStates.length : 25
    const penalties = active.map(warning => ({ id: warning.id, category: warning.category, label: creatorWarningOption(warning.category)?.label || 'Internal note', points: warning.points, submissionId: warning.submissionId }))
    const components: ScoreComponent[] = [
      { id: 'conversions', label: 'Paid conversions', points: 175, maximum: 350, status: 'provisional', detail: 'Neutral placeholder. Paid customer attribution is not validated; signups and checkouts are not payments.' },
      { id: 'economics', label: 'Profitability', points: 125, maximum: 250, status: 'provisional', detail: 'Neutral placeholder until revenue attribution is validated. Compensation includes committed payments and earned unpaid amounts.' },
      { id: 'audience', label: 'Audience quality', points: round(100 * Math.min(1, (audience || 0) / 40)), maximum: 100, status: audience === null ? 'unknown' : 'measured', detail: audience === null ? 'No approved, verified audience evidence yet.' : `${round(audience)}% Tier-1 audience, weighted by approved verified views. 40% earns full points.` },
      { id: 'campaigns', label: 'Campaign participation', points: round(campaignPoints), maximum: 100, status: verified.length ? 'measured' : 'unknown', detail: 'Approved-post average: General / legacy 40, Feature Comparison 75, Detailed Analysis 100. At least 3 approved posts for full participation credit. Strategic incentive; not proven conversion uplift.' },
      { id: 'views', label: 'Verified reach', points: round(75 * Math.min(1, Math.log1p(views) / Math.log1p(1000000))), maximum: 75, status: verified.length ? 'measured' : 'unknown', detail: `${views.toLocaleString('en-US')} approved verified views. Logarithmic scale; 1 million earns full points.` },
      { id: 'consistency', label: 'Posting consistency', points: round(75 * Math.min(1, recentPosts / 12)), maximum: 75, status: 'measured', detail: `${recentPosts} approved posts published in the past 28 days. 12 earns full points; drafts and rereview updates do not count.` },
      { id: 'bio', label: 'Link in bio', points: round(bioPoints), maximum: 50, status: bioStates.length && bioStates.every(value => value !== null) ? 'measured' : 'provisional', detail: 'Checks start November 10, 2026. Evidence expires after 7 days. Unknown = 25; verified or confirmed under-1,000 exemption = 50; confirmed missing = 0. No historical deductions.' },
    ]
    const gross = Math.round(components.reduce((sum, component) => sum + component.points, 0))
    const deductions = penalties.reduce((sum, penalty) => sum + penalty.points, 0)
    const total = Math.min(active.some(warning => warning.category === 'confirmed_fraud') ? 399 : 1000, Math.max(0, gross - deductions))
    return { creatorId: creator.id, name: creator.name, total, gross, deductions, assessed: all.length > 0, confidence: all.length ? 'provisional' : 'unassessed', version: CREATOR_SCORE_VERSION, components, metrics: { submissions: all.length, approvedPosts: verified.length, verifiedViews: views, tier1Percent: audience === null ? null : round(audience), recentPosts, committedUsd: round(committed / 100), belowThreshold, activeWarnings: active.length }, penalties }
  })
}
