import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { expect, test } from 'bun:test'
import { reviewAudienceBonuses, submissionBonusPayments, campaignBonusPayments, bonusPaymentTotal, bonusPaymentStatus, bonusTargetPayments, type BonusPayment } from './bonus-payments'
import { creatorBundlePlan, creatorMoneySummary } from './money'
const base: BonusPayment = { id:'award', bonusSprintId:'campaign', bonusKey:'audience:post:1000', bonusNote:'Audience excellence',amountCents:1000,currency:'USD',status:'pending' }

test('post bonus ownership matches the exact post; cancelled and foreign currency awards are excluded', () => {
 const rows = [base,{...base,id:'other-post',bonusKey:'audience:post2:1000'},{...base,id:'other-campaign',bonusSprintId:'old',bonusKey:'audience:post2:1000'},{...base,id:'cancelled',status:'cancelled' as const},{...base,id:'currency',currency:'EUR'},{...base,id:'campaign-level',bonusKey:'million:1500'}]
 expect(submissionBonusPayments({id:'post',sprintId:'campaign'},rows)).toEqual([base])
})
test('incremental conversion and paid awards count exactly once in earned totals', () => {
 const rows=[base,{...base,id:'conversion1',bonusKey:'conversion:post:200',amountCents:200,status:'paid' as const},{...base,id:'conversion2',bonusKey:'conversion:post:450',amountCents:250}]
 expect(bonusPaymentTotal(submissionBonusPayments({id:'post',sprintId:'campaign'},rows))).toBe(1450)
 expect(bonusPaymentStatus(rows[1])).toBe('Paid')
 expect(bonusPaymentStatus({...base,payoutRequestId:'bundle'})).toBe('Included in payout')
})
test('campaign-wide rewards are shown separately rather than duplicated on every post', () => {
 const award={...base,bonusKey:'million:1500',amountCents:1500}
 expect(campaignBonusPayments([base,award])).toEqual([award])
 expect(submissionBonusPayments({id:'post',sprintId:'campaign'},[award])).toEqual([])
})
test('automatic bonus rows enter balance and payout totals once without increasing base approved earnings', () => {
 const submission={id:'post',sprintId:'campaign',approvedAmountCents:1500,status:'approved'} as never
 const bonus={...base,submissionId:null,paymentOption:'paypal',paidAt:null} as never
 expect(creatorMoneySummary([submission],[bonus]).balanceCents).toBe(2500)
 expect(creatorBundlePlan([submission],[bonus]).amountCents).toBe(2500)
})


const reviewPost = { id: 'new-post', creatorProfileId: 'creator', sprintId: 'campaign', sprintTerms: launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.name === 'General Looksmaxxing Content')!), status: 'pending', approvedAmountCents: 3000, adminViewCountThreshold: 100000, adminUsAudiencePercent: 62 }
const ownedAward = { ...base, creatorProfileId: 'creator' }

test('pending review shows the $10 audience bonus from current verified metrics before a ledger award exists', () => {
 expect(reviewAudienceBonuses(reviewPost, [ownedAward])).toEqual([{ subject: 'audience:new-post', cents: 1000, label: 'Audience excellence' }])
 expect(reviewAudienceBonuses({ ...reviewPost, adminUsAudiencePercent: 44.9 }, [])).toEqual([])
 expect(reviewAudienceBonuses({ ...reviewPost, adminViewCountThreshold: 99999 }, [])).toEqual([])
 expect(reviewAudienceBonuses({ ...reviewPost, adminUsAudiencePercent: 45 }, [])).toHaveLength(1)
 expect(reviewAudienceBonuses({ ...reviewPost, status: 'rejected' }, [])).toEqual([])
 expect(reviewAudienceBonuses({ ...reviewPost, approvedAmountCents: 0 }, [])).toEqual([])
 expect(reviewAudienceBonuses({ ...reviewPost, sprintTerms: null }, [])).toEqual([])
})

test('review preview respects lifetime claim limits, campaign budget, and prior paid or cancelled awards', () => {
 const alreadyAwarded = { ...ownedAward, bonusKey: 'audience:new-post:1000' }
 for (const status of ['pending', 'paid', 'cancelled'] as const) expect(reviewAudienceBonuses(reviewPost, [{ ...alreadyAwarded, status }])).toEqual([])
 const five = Array.from({length: 5}, (_, index) => ({...ownedAward, id: String(index), bonusKey: `audience:other-${index}:1000`, bonusSprintId: 'other-campaign'}))
 expect(reviewAudienceBonuses(reviewPost, five)).toEqual([])
 expect(reviewAudienceBonuses(reviewPost, five.map(payment => ({...payment,creatorProfileId:'other-creator'})))).toHaveLength(1)
 expect(reviewAudienceBonuses(reviewPost, [{...ownedAward, bonusKey:'conversion:other:49900',amountCents:49900}])).toEqual([])
})

test('campaign transfers retain existing post awards without a second award or changing the original budget', () => {
 const prior = { ...ownedAward, bonusSprintId: 'old-campaign', bonusKey: 'audience:new-post:1000' }
 expect(submissionBonusPayments(reviewPost, [prior])).toEqual([prior])
 expect(reviewAudienceBonuses(reviewPost, [prior])).toEqual([])
 expect(bonusTargetPayments([prior], 'audience:new-post', 'campaign')).toEqual([prior])
 expect(bonusTargetPayments([{ ...prior, bonusKey: 'million:1500' }], 'million', 'campaign')).toEqual([])
 for (const status of ['paid', 'cancelled'] as const) expect(reviewAudienceBonuses(reviewPost, [{ ...prior, status }])).toEqual([])
})
