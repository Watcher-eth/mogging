import type { SubmissionHistorySnapshot } from '@/lib/creator/updates'

export type SubmissionHistoryEntry={
  id: string
  at: string
  title: string
  detail?: string|null
  views?: number|null
  audiencePercent?: number|null
  amountCents?: number|null
  currency?: string
  campaign?: string|null
  reference?: string|null
}
type Update={ id: string; type: string; createdAt: Date|string; note: string|null; historySnapshot?: SubmissionHistorySnapshot|null }
type Payment={ id: string; amountCents: number; currency: string; status: string; paidAt: Date|string|null; createdAt: Date|string; providerReference: string|null; bonusKey?: string|null; bonusNote?: string|null }
type Message={ id: string; body: string; createdAt: Date|string }
const date=(value: Date|string) => new Date(value).toISOString()
const labels: Record<string,string>={ submitted: 'First submitted',rereview_requested: 'Rereview requested',approved: 'Approved',rejected: 'Rejected',pending: 'Awaiting review',in_review: 'Review started',feedback: 'Review feedback' }

export function submissionHistory(post: { id: string; createdAt: Date|string; viewCountThreshold: number|null; usAudiencePercent: number|null; reviewRequestedAt?: Date|string|null },updates: Update[],messages: Message[],payments: Payment[]) {
  const fresh=messages.flatMap(message => {
    const match=/^Submitted fresh analytics for review: ([\d,]+) views · ([\d.]+)% Tier 1 audience\./.exec(message.body)
    if(!match) return []
    const previous=/\((\d+) views\)\.$/.exec(message.body)
    return [{ id: message.id,at: date(message.createdAt),views: Number(match[1].replaceAll(',','')),audiencePercent: Number(match[2]),previousViews: previous? Number(previous[1]):null }]
  }).sort((a,b) => a.at.localeCompare(b.at))
  const rereviews=updates.filter(u => u.type==='rereview_requested')
  const hasRereview=rereviews.length>0||fresh.length>0||Boolean(post.reviewRequestedAt)
  const entries: SubmissionHistoryEntry[]=updates.filter(u => u.type!=='paid').map(update => {
    const snapshot=update.historySnapshot
    const submitted=update.type==='submitted'||update.type==='rereview_requested'
    const recovered=update.type==='rereview_requested'? fresh.find(m => Math.abs(Date.parse(m.at)-new Date(update.createdAt).getTime())<2000):null
    return {      
id: `event:${update.id}`,at: date(update.createdAt),title: labels[update.type]||update.type,detail: update.note,
      views: snapshot? (submitted? snapshot.submittedViews:snapshot.verifiedViews):recovered?.views??(update.type==='submitted'? (hasRereview? fresh[0]?.previousViews:post.viewCountThreshold):null),
      audiencePercent: snapshot? (submitted? snapshot.submittedAudiencePercent:snapshot.verifiedAudiencePercent):recovered?.audiencePercent??(update.type==='submitted'&&!hasRereview? post.usAudiencePercent:null),
      amountCents: update.type==='approved'? snapshot?.approvedAmountCents:null,campaign: snapshot?.campaignName    
}
  })
  if(!updates.some(u => u.type==='submitted')) entries.push({ id: 'first-submitted',at: date(post.createdAt),title: 'First submitted',views: hasRereview? fresh[0]?.previousViews:post.viewCountThreshold,audiencePercent: hasRereview? null:post.usAudiencePercent })
  for(const message of fresh) if(!rereviews.some(u => Math.abs(new Date(u.createdAt).getTime()-Date.parse(message.at))<2000)) entries.push({ id: `analytics:${message.id}`,at: message.at,title: 'Rereview requested',views: message.views,audiencePercent: message.audiencePercent })
  if(post.reviewRequestedAt&&!entries.some(e => e.title==='Rereview requested'&&Math.abs(Date.parse(e.at)-new Date(post.reviewRequestedAt!).getTime())<2000)) entries.push({ id: 'current-rereview',at: date(post.reviewRequestedAt),title: 'Rereview requested',views: post.viewCountThreshold,audiencePercent: post.usAudiencePercent })
  for(const payment of payments) {
    const bonus=Boolean(payment.bonusKey)
    entries.push({ id: `payment:${payment.id}`,at: date(payment.status==='paid'&&payment.paidAt? payment.paidAt:payment.createdAt),title: payment.status==='paid'? (bonus? 'Bonus paid':'Paid'):bonus? (payment.status==='pending'? 'Bonus added':`Bonus ${payment.status}`):payment.status==='pending'? 'Payment scheduled':`Payment ${payment.status}`,amountCents: payment.amountCents,currency: payment.currency,reference: payment.providerReference,detail: bonus? payment.bonusNote:payment.status==='paid'? null:`Current payment status: ${payment.status}` })
  }
  return entries.sort((a,b) => Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id))
}
