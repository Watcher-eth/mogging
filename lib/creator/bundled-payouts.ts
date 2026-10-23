import { refreshCreatorBonuses } from './bonus-service'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { normalizePaymentReceipt, paymentReceiptSchema } from '@/lib/admin/payment-receipt'
import { creatorBundlePlan, creatorEarnedCents, hasCreatorPayoutMethod, remainingCreatorPaymentCents } from './money'

export const payoutPreferenceSchema = z.object({ bundledPayouts: z.boolean() })
export const payoutRequestSchema = z.object({ expectedAmountCents: z.number().int().positive() })
export const settlePayoutRequestSchema = payoutRequestSchema.extend({
  id: z.string().min(1),
  providerReference: z.string().trim().max(180).optional(),
  receiptImage: paymentReceiptSchema,
})

export async function setBundledPayouts(userId: string, enabled: boolean) {
  return db.transaction(async tx => {
    const [profile] = await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.userId, userId)).for('update')
    if (!profile) throw new ApiError(404, 'Creator profile not found')
    const pending = await tx.query.creatorPayoutRequests.findFirst({ where: and(eq(schema.creatorPayoutRequests.creatorProfileId, profile.id), eq(schema.creatorPayoutRequests.status, 'pending')) })
    if (pending && !enabled) throw new ApiError(409, 'Your bundle is already requested. Change this setting after it is paid.')
    const [updated] = await tx.update(schema.creatorProfiles).set({ bundledPayouts: enabled, updatedAt: new Date() }).where(eq(schema.creatorProfiles.id, profile.id)).returning()
    return { bundledPayouts: updated.bundledPayouts }
  })
}

export async function requestBundledPayout(userId: string, expectedAmountCents: number) {
  return db.transaction(async tx => {
    const [profile] = await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.userId, userId)).for('update')
    if (!profile?.bundledPayouts) throw new ApiError(409, 'Enable bundled payouts first')
    const existing = await tx.query.creatorPayoutRequests.findFirst({ where: and(eq(schema.creatorPayoutRequests.creatorProfileId, profile.id), eq(schema.creatorPayoutRequests.status, 'pending')) })
    if (existing) return existing
    if (profile.authStatus !== 'verified' || !hasCreatorPayoutMethod(profile)) throw new ApiError(409, 'An approved payout method is required')
    // Same submission locks as individual payouts: concurrent reviews and manual
    // payments cannot change a balance while we reserve the bundle.
    const submissions = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.creatorProfileId, profile.id)).orderBy(asc(schema.creatorSubmissions.id)).for('update')
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.creatorProfileId, profile.id) })
    if (payments.some(payment => ['paid', 'pending', 'processing'].includes(payment.status) && payment.currency !== 'USD')) throw new ApiError(409, 'Contact the team to review your payout currency')
    const plan = creatorBundlePlan(submissions, payments)
    if (!plan.amountCents) throw new ApiError(409, 'No earnings are available to request. Payments already processing or requested are excluded.')
    if (plan.amountCents !== expectedAmountCents) throw new ApiError(409, 'Your balance changed. Refresh Money and request the updated amount.')
    for (const line of plan.lines) {
      const records = payments.filter(payment => payment.submissionId === line.submissionId)
      const paid = records.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountCents, 0)
      const reserved = records.filter(payment => payment.status === 'pending' || payment.status === 'processing').reduce((sum, payment) => sum + payment.amountCents, 0)
      if (line.submissionId && reserved > Math.max(0, line.earnedCents - paid)) throw new ApiError(409, 'Contact the team to review an existing scheduled payment')
      if (records.some(payment => line.pendingIds.includes(payment.id) && payment.paymentOption !== profile.paymentOption)) throw new ApiError(409, 'Contact the team to review an existing payment method')
    }
    const [request] = await tx.insert(schema.creatorPayoutRequests).values({
      creatorProfileId: profile.id, amountCents: plan.amountCents,
      paymentOption: profile.paymentOption,
      destination: (profile.paymentOption === 'paypal' ? profile.paypalEmail : profile.cryptoWalletAddress)!,
      network: profile.paymentOption === 'crypto' ? profile.cryptoNetwork : null,
    }).returning()
    for (const line of plan.lines) {
      if (line.pendingIds.length) await tx.update(schema.creatorPayments).set({ payoutRequestId: request.id, updatedAt: new Date() }).where(inArray(schema.creatorPayments.id, line.pendingIds))
      if (line.newCents) await tx.insert(schema.creatorPayments).values({ creatorProfileId: profile.id, submissionId: line.submissionId, amountCents: line.newCents, status: 'pending', paymentOption: profile.paymentOption, payoutRequestId: request.id })
    }
    return request
  })
}

export async function settleBundledPayout(input: z.infer<typeof settlePayoutRequestSchema>) {
  const receipt = await normalizePaymentReceipt(input.receiptImage)
  return db.transaction(async tx => {
    const found = await tx.query.creatorPayoutRequests.findFirst({ where: eq(schema.creatorPayoutRequests.id, input.id) })
    if (!found) throw new ApiError(404, 'Payout request not found')
    await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, found.creatorProfileId)).for('update')
    const [request] = await tx.select().from(schema.creatorPayoutRequests).where(eq(schema.creatorPayoutRequests.id, input.id)).for('update')
    if (request.amountCents !== input.expectedAmountCents) throw new ApiError(409, 'The payout amount changed. Refresh before recording payment.')
    if (request.status === 'paid') return request
    if (receipt && request.paymentOption !== 'paypal') throw new ApiError(400, 'Image receipts are for PayPal payments')
    const submissions = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.creatorProfileId, request.creatorProfileId)).orderBy(asc(schema.creatorSubmissions.id)).for('update')
    const payments = await tx.select().from(schema.creatorPayments).where(eq(schema.creatorPayments.payoutRequestId, request.id)).for('update')
    if (!payments.length || payments.some(payment => !['pending', 'processing'].includes(payment.status) || payment.currency !== 'USD') || payments.reduce((sum, payment) => sum + payment.amountCents, 0) !== request.amountCents) throw new ApiError(409, 'This bundle needs review before recording payment')
    const now = new Date()
    await tx.update(schema.creatorPayments).set({ status: 'paid', paidAt: now, updatedAt: now, providerReference: input.providerReference || null }).where(eq(schema.creatorPayments.payoutRequestId, request.id))
    if (receipt) await tx.insert(schema.creatorPaymentReceipts).values(payments.map(payment => ({ paymentId: payment.id, image: receipt }))).onConflictDoUpdate({ target: schema.creatorPaymentReceipts.paymentId, set: { image: receipt } })
    const allPayments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.creatorProfileId, request.creatorProfileId) })
    const affected = new Set(payments.map(payment => payment.submissionId))
    for (const submission of submissions) {
      if (affected.has(submission.id) && submission.status === 'approved' && remainingCreatorPaymentCents(creatorEarnedCents(submission), allPayments.filter(payment => payment.submissionId === submission.id), false) === 0) {
        await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: now }).where(eq(schema.creatorSubmissions.id, submission.id))
      }
    }
    const [settled] = await tx.update(schema.creatorPayoutRequests).set({ status: 'paid', paidAt: now }).where(eq(schema.creatorPayoutRequests.id, request.id)).returning()
    return settled
  }).then(async request => { await refreshCreatorBonuses(request.creatorProfileId); return request })
}
