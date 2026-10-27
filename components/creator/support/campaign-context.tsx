import { CampaignRequirementList } from '@/components/creator/campaign-requirement-list'
import { useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignMilestoneStrip } from '@/components/creator/campaign-milestones'
import { campaignAudienceBands } from '@/lib/creator/sprint-defaults'
import { sprintMoney, sprintViews } from '@/lib/creator/sprints'
import type { CampaignContext, SubmissionEvidence } from '@/lib/creator/support/evidence'
import { SubmissionReviewFeedback } from '@/components/creator/submission-review-feedback'
import styles from './support-chat.module.css'

export function SupportCampaignContext({ context, view, onCampaign }: { context: CampaignContext; view: 'rules' | 'milestones' | 'all'; onCampaign: (id: string) => void }) {
  const [allStrong, setAllStrong] = useState(false)
  const bands = campaignAudienceBands(context.campaign.terms)
  const [selectedAudience, setSelectedAudience] = useState(context.audiencePercent ?? context.campaign.terms.maximumTier1Percent)
  const [audienceEdited, setAudienceEdited] = useState(false)
  return <section className={styles.campaignContext} aria-label={`${context.campaign.name} campaign details`}>
    <header><div><p className={styles.eyebrow}>{context.termsSource === 'submission snapshot' ? 'Saved submission terms' : 'Current campaign terms'}</p><h3>{context.campaign.name}</h3></div><button onClick={() => onCampaign(context.campaign.id)} type="button" aria-label={`Open ${context.campaign.name}`}><ArrowUpRight size={15} /></button></header>
    {view !== 'rules' ? <section aria-label="Payout milestones" className={styles.milestoneContext}>
      <div><h4>Your views, rewarded.</h4><label>Tier 1 audience<select aria-label="Illustrate milestone payouts at an audience percentage" value={selectedAudience} onChange={e => { setSelectedAudience(Number(e.target.value)); setAudienceEdited(true) }}>{[...new Set([...(context.audiencePercent != null ? [context.audiencePercent] : []), ...bands.map(b => b.minimumPercent), context.campaign.terms.maximumTier1Percent])].sort((a,b) => a-b).map(value => <option key={value} value={value}>{value}%</option>)}</select></label></div>
      <CampaignMilestoneStrip terms={context.campaign.terms} audiencePercent={selectedAudience} views={context.verifiedViews} />
      <p>{!audienceEdited && context.audiencePercent != null && context.termsSource === 'submission snapshot' ? `At your recorded ${context.audiencePercent}% Tier 1 audience.` : `Illustration at ${selectedAudience}% Tier 1 audience.`} Milestones are total content amounts, not amounts added together. Changing this illustration does not change your review or earnings.</p>
    </section> : null}
    {view !== 'milestones' ? <section aria-label="All campaign rules" className={styles.ruleContext}>
      <div className={styles.ruleHeading}><h4>Campaign rules · {context.rules.length}</h4>{context.focusRuleIds.length ? <button type="button" onClick={() => setAllStrong(v => !v)}>{allStrong ? 'Focus relevant rules' : 'Show all at full contrast'}</button> : null}</div>
      {context.focusRuleIds.length ? <p>The highlighted rules relate to this answer. All other rules remain available below.</p> : null}
      <CampaignRequirementList items={context.rules.map(rule => ({ id: rule.id, title: rule.label, detail: rule.detail && !['Sprint restriction', 'Sprint requirement', 'Campaign rule'].includes(rule.detail) ? rule.detail : undefined }))} focusIds={allStrong ? [] : context.focusRuleIds} compact />
    </section> : null}
  </section>
}
export function SupportSubmissionEvidence({ detail, onCampaign, onExplain }: { detail: SubmissionEvidence; onCampaign: (id: string) => void; onExplain: (message: string) => void }) {
  const { submission: s, earnings: e } = detail
  const lastApproval = detail.history.find(event => event.type === 'approved' && event.snapshot)
  return <section className={styles.evidence} aria-label={`Decision and earnings for ${s.title}`}>
    <header><span>{s.status === 'rejected' ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}</span><div><p className={styles.eyebrow}>Recorded submission evidence</p><h3>{s.title}</h3></div></header>
    {s.reviewRequestedAt ? <p className={styles.caption}>A rereview is pending. Verified values below reflect the last completed review; newly submitted analytics may differ.</p> : null}
    <dl className={styles.evidenceNumbers}>
      <div><dt>Submitted views</dt><dd>{s.viewCountThreshold == null ? 'Not recorded' : sprintViews(s.viewCountThreshold)}</dd></div>
      <div><dt>Verified views</dt><dd>{e.verifiedViews == null ? 'Not verified' : sprintViews(e.verifiedViews)}</dd></div>
      <div><dt>Submitted Tier 1</dt><dd>{s.usAudiencePercent == null ? 'Not recorded' : `${s.usAudiencePercent}%`}</dd></div>
      <div><dt>Verified Tier 1</dt><dd>{e.verifiedAudiencePercent == null ? 'Not verified' : `${e.verifiedAudiencePercent}%`}</dd></div>
      <div><dt>Recorded content earnings</dt><dd>{e.recordedApprovedCents == null ? 'Not recorded' : sprintMoney(e.recordedApprovedCents)}</dd></div>
      <div><dt>Campaign calculation</dt><dd>{e.calculatedContentCents == null ? 'Insufficient evidence' : sprintMoney(e.calculatedContentCents)}</dd></div>
      {e.ledger ? <><div><dt>Content paid · USD</dt><dd>{sprintMoney(e.ledger.paidContentCents)}</dd></div><div><dt>Content not yet paid · USD</dt><dd>{e.unpaidContentCents == null ? 'Not recorded' : sprintMoney(e.unpaidContentCents)}</dd></div><div><dt>Recorded bonuses · USD</dt><dd>{sprintMoney(e.ledger.recordedBonusCents)}</dd></div><div><dt>Bonuses paid · USD</dt><dd>{sprintMoney(e.ledger.paidBonusCents)}</dd></div></> : null}
    </dl>
    {lastApproval?.snapshot ? <div className={styles.approvalSnapshot}><p className={styles.eyebrow}>Last recorded approval · {new Date(lastApproval.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p><p>{lastApproval.snapshot.verifiedViews == null ? 'Views not saved' : `${sprintViews(lastApproval.snapshot.verifiedViews)} verified views`} · {lastApproval.snapshot.verifiedAudiencePercent == null ? 'Audience not saved' : `${lastApproval.snapshot.verifiedAudiencePercent}% Tier 1`} · {lastApproval.snapshot.approvedAmountCents == null ? 'Amount not saved' : `${sprintMoney(lastApproval.snapshot.approvedAmountCents)} recorded content amount`}</p></div> : null}
    {e.calculationMatchesRecorded === false ? <p className={styles.evidenceCaution}>The recorded amount differs from the tier calculation. The available records do not establish why; the approved amount is authoritative.</p> : null}
    {e.ledger?.nonUsdPayments ? <p className={styles.evidenceCaution}>Non-USD payments exist. The USD totals above do not include them.</p> : null}
    {detail.review.items.length || detail.review.note ? <SubmissionReviewFeedback status={s.status} items={detail.review.items} note={detail.review.note} /> : <p className={styles.caption}>{s.status === 'rejected' ? 'No reviewer reason was attached. Qualification metrics alone cannot establish the reason for rejection.' : 'No detailed checklist was attached to this decision.'}</p>}
    {detail.context ? <SupportCampaignContext context={detail.context} view="all" onCampaign={onCampaign} /> : null}
    <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className="rounded-full text-xs" onClick={() => onExplain(`Show video examples from the campaign for my submission ${s.id}`)}>See campaign examples<ArrowUpRight size={13} /></Button>{e.nextViews != null && e.nextContentCents != null ? <Button variant="outline" className="rounded-full text-xs" onClick={() => onExplain(`Explain the next milestone and rereview for my submission ${s.id}`)}>Next: {sprintViews(e.nextViews)} views{e.nextContentCents > 0 ? ` · ${sprintMoney(e.nextContentCents)} total` : ' · audience minimum still applies'}</Button> : null}</div>
  </section>
}
