import type { CreatorSubmission } from '@/components/creator/types'
import { sprintPayoutCents, sprintReviewItems, sprintMoney, sprintViews, type SprintTerms } from '../sprints'
import { getCreatorSubmissionReviewItems, AUDIENCE_MINIMUM_REJECTION } from '../submission-review'
import { launchCampaign } from '../campaign-launch'
import type { SupportCampaign, SupportDataSource, SupportOverview, SupportPaymentSummary, SupportReviewEvent } from './contracts'

export type CampaignRule = { id: string; label: string; detail: string }
export type CampaignContext = {
  campaign: SupportCampaign
  termsSource: 'submission snapshot' | 'current published campaign'
  formatId: string | null
  rules: CampaignRule[]
  focusRuleIds: string[]
  audiencePercent: number | null
  verifiedViews: number | null
}
export type SubmissionEvidence = {
  submission: CreatorSubmission
  context: CampaignContext | null
  history: SupportReviewEvent[]
  review: { items: Array<CampaignRule & { met: boolean; note: string | null }>; note: string | null; hasRecordedReason: boolean }
  earnings: {
    verifiedViews: number | null; verifiedAudiencePercent: number | null
    calculatedContentCents: number | null; recordedApprovedCents: number | null
    reachedViews: number | null; nextViews: number | null; nextContentCents: number | null
    ledger: SupportPaymentSummary | null; unpaidContentCents: number | null
    calculationMatchesRecorded: boolean | null
  }
}
export function campaignContext(campaign: SupportCampaign, options: { snapshot?: boolean; formatId?: string | null; focus?: string[]; audiencePercent?: number | null; verifiedViews?: number | null } = {}): CampaignContext {
  const formats = options.formatId ? campaign.terms.formats.filter(f => f.id === options.formatId) : campaign.terms.formats.filter(f => f.active)
  const rules: CampaignRule[] = [{ id: 'audience-minimum', label: `At least ${campaign.terms.minimumTier1Percent}% verified Tier 1 audience`, detail: 'Views and verified audience jointly determine the content payout.' }]
  const seen = new Set<string>()
  for (const format of formats) {
    for (const rule of sprintReviewItems(campaign.terms, format.id, Boolean(options.snapshot))) {
      // Keep all applicable source rules stable; historical reviews retain saved rule IDs.
      const key = `${format.id}:${rule.id}`
      if (!seen.has(key)) { rules.push({ ...rule, id: key }); seen.add(key) }
    }
  }
  return { campaign, termsSource: options.snapshot ? 'submission snapshot' : 'current published campaign', formatId: options.formatId ?? null, rules, focusRuleIds: (options.focus ?? []).filter(id => rules.some(rule => rule.id === id)), audiencePercent: options.audiencePercent ?? null, verifiedViews: options.verifiedViews ?? null }
}
export function overviewText(overview: SupportOverview) {
  const { counts } = overview
  const names = (key: string) => overview.groups.find(g => g.key === key)?.submissions.slice(0, 2).map(s => `“${s.title}”`).join(' and ')
  return [
    `In review: ${counts.pending + counts.in_review ? `You have ${counts.pending} pending and ${counts.in_review} in review.${names('review') ? ` Recent posts include ${names('review')}.` : ''} These posts are awaiting a review decision; any prior payments remain separate.` : 'You have no submissions waiting for review.'}`,
    `Approved & paid: ${counts.approved} approved and ${counts.paid} paid.${names('approved-paid') ? ` Recent posts include ${names('approved-paid')}.` : ''} An approved amount and a completed payment are separate; open a post for its earnings breakdown.`,
    `Rejected: ${counts.rejected ? `You have ${counts.rejected} rejected submission${counts.rejected === 1 ? '' : 's'}.${names('rejected') ? ` Recent posts include ${names('rejected')}.` : ''} Open a post to see the recorded reasons, verified views, audience, and applicable campaign rules.` : 'You have no rejected submissions.'}`,
  ].join('\n\n')
}
export async function readSubmissionEvidence(source: SupportDataSource, id: string): Promise<SubmissionEvidence | null> {
  const { submissions } = await source.submissions({ id, limit: 1 })
  const submission = submissions[0]
  if (!submission) return null
  const [campaigns, payments, history] = await Promise.all([submission.sprintId ? source.campaigns(submission.sprintId) : Promise.resolve([]), source.payments(submission.id), source.history(submission.id)])
  const current = campaigns[0]
  // The creator's own saved snapshot remains readable when a campaign has ended or been unpublished.
  const campaign: SupportCampaign | null = submission.sprintTerms && submission.sprintId ? { id: submission.sprintId, name: current?.name ?? launchCampaign(submission.sprintTerms)?.name ?? 'Submitted campaign', description: current?.description ?? '', startsAt: current?.startsAt ?? submission.createdAt, endsAt: current?.endsAt ?? submission.createdAt, status: current?.status ?? 'ended', terms: submission.sprintTerms } : current ?? null
  const terms = campaign?.terms
  const formatId = submission.formatId ?? (terms?.formats.length === 1 ? terms.formats[0].id : null)
  const labels = terms ? formatId ? sprintReviewItems(terms, formatId, true) : [] : getCreatorSubmissionReviewItems(submission.formatId)
  // Only saved checklist entries are evidence. A missing entry is unknown, never an automatic failure.
  const items = (submission.reviewChecklist ?? []).map(saved => {
    const label = saved.id === AUDIENCE_MINIMUM_REJECTION.id ? { id: saved.id, label: `Tier 1 audience minimum${terms ? ` (${terms.minimumTier1Percent}%)` : ''}`, detail: 'Recorded audience review.' } : labels.find(item => item.id === saved.id)
    return { ...saved, label: label?.label ?? 'Recorded review item', detail: label?.detail ?? 'No matching rule label was saved. Use the recorded reviewer note.' }
  })
  const verifiedViews = submission.adminViewCountThreshold
  const verifiedAudiencePercent = submission.adminUsAudiencePercent
  const calculatedContentCents = terms && verifiedViews !== null && verifiedAudiencePercent !== null ? sprintPayoutCents(terms, verifiedViews, verifiedAudiencePercent) : null
  const reached = terms && verifiedViews !== null ? terms.milestones.findLast(m => verifiedViews >= m.views) : null
  const next = terms && verifiedViews !== null ? terms.milestones.find(m => verifiedViews < m.views) : null
  const failed = items.filter(i => !i.met)
  const context = campaign ? campaignContext(campaign, { snapshot: Boolean(submission.sprintTerms), formatId, audiencePercent: verifiedAudiencePercent, verifiedViews, focus: failed.map(i => i.id === AUDIENCE_MINIMUM_REJECTION.id ? 'audience-minimum' : `${formatId}:${i.id}`) }) : null
  if (context && verifiedAudiencePercent !== null && verifiedAudiencePercent < campaign!.terms.minimumTier1Percent && !context.focusRuleIds.includes('audience-minimum')) context.focusRuleIds.push('audience-minimum')
  return {
    submission, context, history, review: { items, note: submission.reviewNote, hasRecordedReason: Boolean(submission.reviewNote || failed.length) },
    earnings: { verifiedViews, verifiedAudiencePercent, calculatedContentCents, recordedApprovedCents: submission.approvedAmountCents ?? null, reachedViews: reached?.views ?? null, nextViews: next?.views ?? null, nextContentCents: terms && next && verifiedAudiencePercent !== null ? sprintPayoutCents(terms, next.views, verifiedAudiencePercent) : null, ledger: payments.summary ?? null, unpaidContentCents: payments.summary && submission.approvedAmountCents != null ? Math.max(0, submission.approvedAmountCents - payments.summary.paidContentCents) : null, calculationMatchesRecorded: calculatedContentCents !== null && submission.approvedAmountCents != null ? calculatedContentCents === submission.approvedAmountCents : null },
  }
}
export function evidenceSummary(detail: SubmissionEvidence) {
  const { submission: s, earnings, review, context } = detail
  return { id: s.id, title: s.title, status: s.status, recentDecisions: detail.history.slice(0, 3), lastApprovedReview: detail.history.find(event => event.type === 'approved') ?? null, pendingRereview: Boolean(s.reviewRequestedAt), submittedViews: s.viewCountThreshold, submittedAudiencePercent: s.usAudiencePercent, earnings, review: { note: review.note, hasRecordedReason: review.hasRecordedReason, failedItems: review.items.filter(i => !i.met).map(i => ({ id: i.id, label: i.label, note: i.note })), recordedMetCount: review.items.filter(i => i.met).length, recordedCheckCount: review.items.length, metExamples: review.items.filter(i => i.met).slice(0, 4).map(i => i.label) }, campaign: context ? { id: context.campaign.id, name: context.campaign.name, termsSource: context.termsSource, minimumAudiencePercent: context.campaign.terms.minimumTier1Percent, milestones: context.campaign.terms.milestones, relevantRules: context.rules.filter(r => context.focusRuleIds.includes(r.id)) } : null, nextStep: review.items.some(i => !i.met && /^(element|restriction)-/.test(i.id)) ? 'Analytics rereview does not replace published creative. A missing voice-over or prohibited creative may require a newly edited and published post, submitted as a new submission. Ask the team in the existing submission thread if unsure.' : 'Use the recorded review and existing portal flows. Updated analytics do not guarantee approval or additional earnings.', caution: 'The saved moderator decision is authoritative. Prior approved earnings and paid transfers survive a rejected rereview; do not imply they are forfeited. Use lastApprovedReview for historical approval metrics; do not invent its date or motives if missing. During pending rereview, verified values reflect the last completed review, not the new submitted analytics. A tier calculation explains qualification, not an unrecorded reviewer motive. Do not invent a reason for differences between approved and recomputed amounts. Milestones are total amounts, not additive; ledger totals cover USD only.' }
}
export function evidenceText(detail: SubmissionEvidence) {
  const { submission: s, review, earnings: e } = detail
  const reason = review.items.filter(i => !i.met).map(i => `${i.label}${i.note ? `: ${i.note}` : ''}`).join('; ')
  return `${s.title} — ${s.status.replace('_', ' ')}.\n\n${s.status === 'rejected' ? review.hasRecordedReason ? `Recorded review: ${review.note || reason}` : 'No rejection reason was attached. The metrics below can show qualification, but they do not establish the reviewer’s reason.' : review.items.some(i => i.met) ? `The saved checklist records ${review.items.filter(i => i.met).length} requirements met.${review.note ? ` ${review.note}` : ''}` : 'No detailed approval checklist was attached; the recorded status remains authoritative.'}\n\n${e.verifiedViews !== null ? `${sprintViews(e.verifiedViews)} verified views` : 'Views have not been verified'}; ${e.verifiedAudiencePercent !== null ? `${e.verifiedAudiencePercent}% verified Tier 1 audience` : 'audience has not been verified'}. ${e.recordedApprovedCents !== null ? `Recorded content earnings: ${sprintMoney(e.recordedApprovedCents)}.` : 'No approved content amount is recorded.'}${e.calculatedContentCents !== null ? ` The applicable campaign tier calculates ${sprintMoney(e.calculatedContentCents)} as a total content amount, not an additional payment.` : ''}${e.calculationMatchesRecorded === false ? ' That differs from the recorded amount; the records do not establish why.' : ''}`
}
export function registeredExamples(campaign: SupportCampaign) { return launchCampaign(campaign.terms) ?? null }
export function compactCampaignTerms(terms: SprintTerms) { return { minimumTier1Percent: terms.minimumTier1Percent, maximumTier1Percent: terms.maximumTier1Percent, milestones: terms.milestones, formats: terms.formats.map(f => ({ id: f.id, name: f.name })) } }

export function focusCampaignRules(context: CampaignContext, query: string, ids: string[] = []) {
  const validIds = ids.filter(id => context.rules.some(rule => rule.id === id))
  if (validIds.length) return { ...context, focusRuleIds: validIds }
  const words = [...new Set(query.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['campaign','rules','specific','show','what','this','that','with','from'].includes(w)))]
  const scored = context.rules.map(rule => ({ id: rule.id, score: words.reduce((sum, word) => sum + (rule.label.toLowerCase().includes(word) ? 3 : 0) + (rule.detail.toLowerCase().includes(word) ? 1 : 0), 0) }))
  const maximum = Math.max(0, ...scored.map(r => r.score))
  return { ...context, focusRuleIds: maximum ? scored.filter(r => r.score >= maximum * .75).slice(0, 4).map(r => r.id) : [] }
}
