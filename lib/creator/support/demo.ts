import type { CreatorSubmission } from '@/components/creator/types'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '../campaign-launch'
import { sprintReviewItems } from '../sprints'
import { conversionWindow, supportVideoAnalytics } from './video-analytics'
import { supportAnalyticsWindow } from './analytics'
import type { SupportDataSource, SupportCampaign } from './contracts'

const date = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
const base: CreatorSubmission = {
  id: 'sample-post-1', title: 'Your next level starts here', caption: 'Your next level starts with understanding your features.', platform: 'tiktok', status: 'approved', socialAccountId: null, formatId: null, sprintId: 'sample-campaign', approvedAmountCents: 2500, requirementsConfirmedAt: null, postUrl: null, videoUrl: null, videoContentType: null, videoSizeBytes: null, analyticsScreenshotUrl: null, analyticsContentType: null, analyticsSizeBytes: null, viewCountThreshold: 125000, usAudiencePercent: null, adminViewCountThreshold: 125000, adminUsAudiencePercent: 35, reviewNote: null, reviewChecklist: null, createdAt: '',
}
export function createDemoDataSource(): SupportDataSource {
  const terms = launchCampaignTerms(LAUNCH_CAMPAIGNS[0])
  const formatId = terms.formats[0].id
  const checks = sprintReviewItems(terms, formatId, true).map(item => ({ id: item.id, met: true, note: null }))
  const submissions: CreatorSubmission[] = [
    { ...base, formatId, sprintTerms: terms, usAudiencePercent: 23, adminUsAudiencePercent: 22.5, approvedAmountCents: 4550, reviewChecklist: checks, reviewNote: 'The required face introduction, mock report, and voice-over were present.', createdAt: date(2), updatedAt: date(1) },
    { ...base, formatId, sprintTerms: terms, adminUsAudiencePercent: null, usAudiencePercent: 30, id: 'sample-post-2', title: 'The glow-up checklist', caption: 'The glow-up checklist I wish I had sooner.', status: 'in_review', platform: 'instagram', approvedAmountCents: null, adminViewCountThreshold: null, viewCountThreshold: 64000, createdAt: date(1), updatedAt: date(0) },
    { ...base, formatId, sprintTerms: terms, reviewChecklist: checks, usAudiencePercent: 33, adminUsAudiencePercent: 32, id: 'sample-post-3', title: 'A little perspective', caption: 'A little perspective. A new kind of confidence.', status: 'paid', approvedAmountCents: 12000, adminViewCountThreshold: 330000, viewCountThreshold: 330000, createdAt: date(5), updatedAt: date(3) },
    { ...base, formatId, sprintTerms: terms, id: 'sample-post-4', title: 'My face scan breakdown', caption: 'My face scan breakdown — what changed?', status: 'rejected', approvedAmountCents: null, viewCountThreshold: 14000, adminViewCountThreshold: 12000, usAudiencePercent: 18, adminUsAudiencePercent: 8, reviewNote: 'The verified audience is below the campaign minimum. A feature-analysis voice-over was also missing.', reviewChecklist: [...checks.map(c => c.id === 'element-3' ? { ...c, met: false, note: 'No voice-over explaining a specific feature was present.' } : c), { id: 'audience-tier-d-minimum', met: false, note: 'Verified Tier 1 audience: 8%; this campaign requires at least 15%.' }], createdAt: date(3), updatedAt: date(2) },
  ]
  const sampleDaily = Array.from({ length: 90 }, (_, i) => {
    const linkPresses = Math.round(55 + i * 2.3 + Math.sin(i * 1.3) * 32)
    const conversions = Math.round(linkPresses * (0.045 + i / 5000))
    return { day: date(89 - i).slice(0, 10), linkPresses, downloads: Math.round(linkPresses * 0.28), conversions, revenue: Math.round(conversions * 9.99 * 100) / 100 }
  })
  const campaign: SupportCampaign = { id: 'sample-campaign', name: LAUNCH_CAMPAIGNS[0].name, description: 'An illustrative campaign for this local demo. Open the live campaigns page for actual terms.', startsAt: date(20), endsAt: date(-20), status: 'published', terms }
  return {
    async submissions({ id, status, limit = 5 }) {
      const rows = submissions.filter(row => (!id || row.id === id) && (!status || row.status === status))
      return { submissions: rows.slice(0, limit), total: rows.length }
    },
    async history(submissionId) {
      const s = submissions.find(s => s.id === submissionId)
      if (!s) return []
      return [{ id: `sample-review:${s.id}`, type: s.status === 'paid' ? 'approved' : s.status, note: s.reviewNote, createdAt: s.updatedAt ?? s.createdAt, snapshot: { submittedViews: s.viewCountThreshold, submittedAudiencePercent: s.usAudiencePercent, verifiedViews: s.adminViewCountThreshold, verifiedAudiencePercent: s.adminUsAudiencePercent, approvedAmountCents: s.approvedAmountCents ?? null, campaignId: campaign.id, campaignName: campaign.name } }]
    },
    async overview() {
      const counts = { pending: 0, in_review: 1, approved: 1, paid: 1, rejected: 1 }
      return { counts, groups: [
        { key: 'review', title: 'In review', total: 1, submissions: submissions.filter(s => s.status === 'in_review') },
        { key: 'approved-paid', title: 'Approved & paid', total: 2, submissions: submissions.filter(s => ['approved', 'paid'].includes(s.status)) },
        { key: 'rejected', title: 'Rejected', total: 1, submissions: submissions.filter(s => s.status === 'rejected') },
      ] }
    },
    async analytics(days) { return supportAnalyticsWindow({ daily: sampleDaily }, days) },
    async videoAnalytics(query) {
      const window = conversionWindow(query)
      const { daily, totals } = supportAnalyticsWindow({ daily: sampleDaily }, window.days, new Date(Date.parse(window.end) - 1))
      const posted = [date(2), date(0), date(5), date(3)]
      const weights = [0.5, 0.3, 0.15, 0.05]
      const series = submissions.map(() => [] as typeof daily)
      const unassigned = { linkPresses: 0, downloads: 0, conversions: 0, revenueCents: 0 }
      for (const row of daily) {
        const eligible = posted.map((p,i) => p.slice(0,10) <= row.day ? i : -1).filter(i => i >= 0)
        if (!eligible.length) { unassigned.linkPresses += row.linkPresses; unassigned.downloads += row.downloads; unassigned.conversions += row.conversions; unassigned.revenueCents += Math.round(row.revenue*100); continue }
        const weight = eligible.reduce((n,i) => n+weights[i],0)
        const rest = { linkPresses: row.linkPresses, downloads: row.downloads, conversions: row.conversions, revenueCents: Math.round(row.revenue*100) }
        for (const [index,i] of eligible.entries()) {
          const share = (key: keyof typeof rest) => { const amount = index === eligible.length-1 ? rest[key] : Math.floor((key === 'revenueCents' ? Math.round(row.revenue*100) : row[key])*weights[i]/weight); rest[key] -= amount; return amount }
          series[i].push({ day:row.day, linkPresses:share('linkPresses'),downloads:share('downloads'),conversions:share('conversions'),revenue:share('revenueCents')/100 })
        }
      }
      const videos = submissions.map((s,i) => {
        const metrics = series[i].reduce((n,r) => ({linkPresses:n.linkPresses+r.linkPresses,downloads:n.downloads+r.downloads,conversions:n.conversions+r.conversions,revenueCents:n.revenueCents+Math.round(r.revenue*100)}),{linkPresses:0,downloads:0,conversions:0,revenueCents:0})
        const direct = Object.fromEntries(Object.entries(metrics).map(([key,value]) => [key,Math.floor(value*0.8)])) as typeof metrics
        const estimated = Object.fromEntries(Object.entries(metrics).map(([key,value]) => [key,value-direct[key as keyof typeof metrics]])) as typeof metrics
        return {...metrics,id:s.id,title:s.title,platform:s.platform,postUrl:s.postUrl,postedAt:posted[i],submittedAt:s.createdAt,attributionExpiresAt:null,paidAmountCents:0,direct,estimated,daily:series[i]}
      })
      return supportVideoAnalytics({daily,totals,unassigned,videos,bonusesAvailable:false},window,query)
    },
    async campaigns(id) { return !id || id === campaign.id ? [campaign] : [] },
    async payments(submissionId) {
      const all = [{ id: 'sample-payment', submissionId: 'sample-post-3', amountCents: 12000, currency: 'USD', status: 'paid' as const, paidAt: date(3) }]
      const payments = all.filter(p => !submissionId || p.submissionId === submissionId)
      return { payments, total: payments.length, ...(submissionId ? { summary: { paidContentCents: payments.reduce((n, p) => n + p.amountCents, 0), scheduledContentCents: 0, paidBonusCents: 0, recordedBonusCents: submissionId === 'sample-post-1' ? 1000 : 0, nonUsdPayments: 0 } } : {}) }
    },
    async bonuses() { return { payments: [{ id: 'sample-bonus', amountCents: 1000, currency: 'USD', status: 'pending', bonusKey: 'audience:sample-post-1:1', bonusNote: 'Sample audience bonus', bonusSprintId: campaign.id }], total: 1 } },
    async referrals() { return { inviteUrl: null, invited: 4, earnedCents: 1250, paidCents: 750, outstandingCents: 500 } },
  }
}
