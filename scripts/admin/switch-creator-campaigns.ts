import { isDeepStrictEqual } from 'node:util'
import { chmod } from 'node:fs/promises'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '../../lib/db'
import { campaignCommittedCents, campaignPaidCents } from '../../lib/creator/campaign-accounting'

const OLD = '8592a794-9b27-455a-8121-393e39c85ba2'
const GENERAL = '04c8b9c8-3b59-4109-978a-57523a13f703'
const FEATURE = '61781970-10e9-45c1-a848-442212d58bf6'
const DETAILED = 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'
const apply = process.argv.includes('--apply')
const backupPath = process.argv.find(arg => arg.startsWith('--backup='))?.slice(9)
if (apply && !backupPath) throw new Error('An absolute private --backup= path is required')

try {
 const result = await db.transaction(async tx => {
  // Block concurrent reviews, payments and submissions for this short handover.
  await tx.execute(sql`lock table creator_sprints, creator_submissions, creator_payments, creator_campaign_transfers in share row exclusive mode`)
  const campaigns = await tx.query.creatorSprints.findMany()
  const old = campaigns.find(row => row.id === OLD)
  const next = [GENERAL, FEATURE, DETAILED].map(id => campaigns.find(row => row.id === id))
  if (!old || next.some(row => !row || row.status === 'draft' || row.terms.formats.filter(f => f.active).length !== 1)) throw new Error('Campaigns are missing or have unexpected formats')
  if (old.status === 'ended') return { alreadyApplied: true }
  if (old.status !== 'published') throw new Error('Old campaign is not published')
  const posts = await tx.query.creatorSubmissions.findMany({ where: and(eq(schema.creatorSubmissions.sprintId, OLD), inArray(schema.creatorSubmissions.status, ['pending', 'in_review']), eq(schema.creatorSubmissions.isDraft, false)) })
  const profiles = await tx.query.creatorProfiles.findMany({ where: inArray(schema.creatorProfiles.id, [...new Set(posts.map(post => post.creatorProfileId))]) })
  const names = new Map(profiles.map(profile => [profile.id, profile.displayName.trim().toLowerCase()]))
  const featureNames = new Set(['ascendic international', 'zukai method', 'zukai methode'])
  const movements = posts.map(post => {
   const target = next.find(campaign => campaign!.id === (featureNames.has(names.get(post.creatorProfileId) || '') ? FEATURE : GENERAL))!
   return { submissionId: post.id, creator: names.get(post.creatorProfileId), target: target.id, name: target.name, preservedCents: post.approvedAmountCents ?? 0 }
  })
  if (!movements.some(row => row.creator === 'ascendic international') || !movements.some(row => row.creator?.startsWith('zukai method'))) throw new Error('Expected exception creators were not found')
  const [before] = await tx.execute<{ cents: number }>(sql`select ${campaignCommittedCents(OLD)} as cents`)
  const topUp = old.budgetCents - before.cents
  if (topUp < 0 || topUp > 500) throw new Error(`Unexpected closing balance: ${topUp} cents`)
  const approved = await tx.query.creatorSubmissions.findMany({ where: and(eq(schema.creatorSubmissions.sprintId, OLD), eq(schema.creatorSubmissions.status, 'approved')), orderBy: sql`updated_at desc` })
  const paymentsBefore = await tx.query.creatorPayments.findMany()
  const adjustment = approved.find(post => !paymentsBefore.some(payment => payment.submissionId === post.id && ['pending', 'processing'].includes(payment.status)))
  if (topUp && !adjustment) throw new Error('No approved post can receive the closing adjustment')
  const now = new Date()
  const report = { applied: apply, closedCampaign: OLD, closingAdjustmentCents: topUp, adjustmentSubmissionId: topUp ? adjustment?.id : null, activatedAt: now.toISOString(), endsAt: new Date(now.getTime() + 30 * 86400000).toISOString(), movements }
  if (!apply) return report
  await Bun.write(backupPath!, JSON.stringify({ at: now, campaigns, submissions: [...posts, ...(adjustment ? [adjustment] : [])], payments: paymentsBefore }, null, 2))
  await chmod(backupPath!, 0o600)
  if (topUp && adjustment) await tx.update(schema.creatorSubmissions).set({ approvedAmountCents: (adjustment.approvedAmountCents ?? 0) + topUp, reviewNote: [adjustment.reviewNote, `Manual campaign closing adjustment: +$${(topUp / 100).toFixed(2)} to complete the $3,000 budget.`].filter(Boolean).join('\n'), updatedAt: now }).where(eq(schema.creatorSubmissions.id, adjustment.id))
  for (const campaign of next) await tx.update(schema.creatorSprints).set({ status: 'published', startsAt: now, endsAt: new Date(report.endsAt), updatedAt: now }).where(eq(schema.creatorSprints.id, campaign!.id))
  for (const movement of movements) {
   const target = next.find(campaign => campaign!.id === movement.target)!
   await tx.execute(sql`insert into creator_campaign_transfers (submission_id,from_sprint_id,to_sprint_id,amount_cents,reason) values (${movement.submissionId},${OLD},${target.id},${movement.preservedCents},'Owner-authorized campaign handover; preserve prior earnings and payments')`)
   await tx.update(schema.creatorSubmissions).set({ sprintId: target.id, sprintTerms: target.terms, formatId: target.terms.formats.find(format => format.active)!.id, reviewChecklist: null, exclusivityConfirmed: false, bonusPlacement: null, updatedAt: now }).where(eq(schema.creatorSubmissions.id, movement.submissionId))
  }
  await tx.update(schema.creatorSprints).set({ status: 'ended', endsAt: now, updatedAt: now }).where(eq(schema.creatorSprints.id, OLD))
  if (!isDeepStrictEqual(paymentsBefore, await tx.query.creatorPayments.findMany())) throw new Error('Payment ledger changed')
  const totals = []
  for (const id of [OLD,GENERAL,FEATURE,DETAILED]) {
   const [total] = await tx.execute<{ committed: number; paid: number }>(sql`select ${campaignCommittedCents(id)} as committed, ${campaignPaidCents(id)} as paid`)
   if (id === OLD && total.committed !== old.budgetCents) throw new Error('Original budget did not close exactly')
   if (id !== OLD && total.committed !== 0) throw new Error('Historical earnings consumed a new campaign budget')
   totals.push({ id, ...total })
  }
  return { ...report, totals, paymentsUnchanged: true }
 })
 console.log(JSON.stringify(result, null, 2))
} finally { await db.$client.end() }
