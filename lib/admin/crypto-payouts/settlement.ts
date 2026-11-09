import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { creatorEarnedCents, remainingCreatorPaymentCents } from '@/lib/creator/money'
import { refreshCreatorBonuses } from '@/lib/creator/bonus-service'
import { refreshCreatorReferralBonuses } from '@/lib/creator/creator-referrals'
import { assertPayoutNetwork, assertSolanaPayoutBlockhash, checkedPayoutRpc, evmOutcomes, scanEvmBatch, signedSolanaProof, solanaOutcomes } from './chains'
import { activeBatch, batches, hashes, payments, profiles, publicBatch, requests, submissions } from './queue'
import type { CryptoBatchProof } from './shared'

type Batch = typeof batches.$inferSelect
type Outcome = { status: 'paid' | 'failed'; hash?: string }

function readBatch(id: string) {
  return db.query.creatorCryptoPayoutBatches.findFirst({ where: eq(batches.id, id) })
}

export async function submitSolana(id: string, adminUserId: string, signed: string[]) {
  const batch = await readBatch(id)
  if (!batch || batch.adminUserId !== adminUserId || batch.proof.chain !== 'solana') throw new ApiError(404, 'Solana batch not found')
  if (batch.status !== 'prepared') return publicBatch(batch)
  const prepared = batch.proof
  const proof = signedSolanaProof(prepared, signed)
  await checkedPayoutRpc(() => assertSolanaPayoutBlockhash(prepared))
  const [saved] = await db.update(batches).set({ proof, status: 'submitted', updatedAt: new Date() })
    .where(and(eq(batches.id, id), eq(batches.status, 'prepared'))).returning()
  if (!saved) throw new ApiError(409, 'The batch changed while the wallet was signing')
  // Only the server broadcasts, after the exact signed bytes are saved.
  return reconcileCryptoBatch(id)
}

export async function beginEvm(id: string, adminUserId: string) {
  const [batch] = await db.update(batches).set({ status: 'submitted', updatedAt: new Date() })
    .where(and(eq(batches.id, id), eq(batches.adminUserId, adminUserId), eq(batches.status, 'prepared'), ne(batches.chain, 'solana'))).returning()
  if (!batch) throw new ApiError(409, 'This batch cannot be sent again')
  return publicBatch(batch)
}

export async function attachEvmHashes(id: string, values: string[]) {
  const batch = await readBatch(id)
  if (!batch || batch.proof.chain === 'solana' || batch.status !== 'submitted') throw new ApiError(409, 'This batch is not awaiting EVM receipts')
  const normalized = [...new Set(values.map(hash => hash.toLowerCase()))]
  await updateSubmittedProof(batch, { ...batch.proof, hashes: normalized })
  return reconcileCryptoBatch(id)
}

async function updateSubmittedProof(batch: Batch, proof: CryptoBatchProof) {
  const [saved] = await db.update(batches).set({ proof, updatedAt: new Date() })
    .where(and(eq(batches.id, batch.id), eq(batches.status, 'submitted'), sql`${batches.proof} = ${JSON.stringify(batch.proof)}::jsonb`)).returning()
  return saved
}

export async function cancelPreparedBatch(id: string) {
  const batch = await readBatch(id)
  if (!batch || batch.status !== 'prepared') throw new ApiError(409, 'A submitted batch needs on-chain verification')
  return applyOutcomes(batch, batch.outputs.map(() => ({ status: 'failed' })))
}

export async function reconcileCryptoBatch(id: string) {
  const batch = await readBatch(id)
  if (!batch) throw new ApiError(404, 'Payout batch not found')
  if (batch.status !== 'submitted') return publicBatch(batch)
  await checkedPayoutRpc(() => assertPayoutNetwork(batch.chain))

  const proof = batch.proof
  if (proof.chain === 'solana') {
    const verified = await checkedPayoutRpc(() => solanaOutcomes(proof.transfers))
    if (!verified.size) return publicBatch(batch)
    const outcomes: (Outcome | undefined)[] = Array(batch.outputs.length).fill(undefined)
    const transfers = proof.transfers.map(transfer => {
      const outcome = transfer.hash ? verified.get(transfer.hash) : undefined
      if (!outcome) return transfer
      for (const index of transfer.outputIndexes) outcomes[index] = { status: outcome, hash: transfer.hash }
      return { ...transfer, outcome }
    })
    return applyOutcomes(batch, outcomes, { ...proof, transfers })
  }

  const scanned = await checkedPayoutRpc(() => scanEvmBatch(proof, batch.sender))
  const current = scanned === proof ? batch : await updateSubmittedProof(batch, scanned)
  if (!current) return publicBatch((await readBatch(id)) ?? batch)
  const verified = await checkedPayoutRpc(() => evmOutcomes(scanned, batch.sender, batch.outputs))
  if (!verified) return publicBatch(current)
  return applyOutcomes(current, verified.map(hash => ({ status: 'paid', hash })), { ...scanned, outputHashes: verified })
}

async function applyOutcomes(batch: Batch, outcomes: (Outcome | undefined)[], proof: CryptoBatchProof = batch.proof) {
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(batches).where(eq(batches.id, batch.id)).for('update')
    if (!current) throw new ApiError(404, 'Payout batch not found')
    if (current.status !== batch.status || JSON.stringify(current.proof) !== JSON.stringify(batch.proof)) return { batch: current, creatorIds: [] }

    const records = await tx.select().from(payments).where(eq(payments.cryptoBatchId, batch.id))
    const creatorIds = [...new Set(records.map(payment => payment.creatorProfileId))]
    const requestIds = [...new Set(records.flatMap(payment => payment.payoutRequestId ? [payment.payoutRequestId] : []))]
    const postIds = [...new Set(records.flatMap(payment => payment.submissionId ? [payment.submissionId] : []))]
    if (creatorIds.length) await tx.select({ id: profiles.id }).from(profiles).where(inArray(profiles.id, creatorIds)).orderBy(asc(profiles.id)).for('update')
    if (requestIds.length) await tx.select({ id: requests.id }).from(requests).where(inArray(requests.id, requestIds)).orderBy(asc(requests.id)).for('update')
    const posts = postIds.length ? await tx.select().from(submissions).where(inArray(submissions.id, postIds)).orderBy(asc(submissions.id)).for('update') : []
    await tx.execute(sql`select set_config('mogging.crypto_payout_write', ${batch.id}, true)`)
    const now = new Date()
    const paidIds = new Set<string>()
    const refs = [...new Set(outcomes.flatMap(outcome => outcome?.status === 'paid' && outcome.hash ? [outcome.hash] : []))].sort()
    for (const hash of refs) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-crypto-ref:${hash}`}, 0))`)

    for (const [index, outcome] of outcomes.entries()) {
      if (!outcome) continue
      const ids = batch.outputs[index].paymentIds
      if (outcome.status === 'paid') {
        if (!outcome.hash) throw new ApiError(409, 'Missing finalized transaction hash')
        for (const id of ids) paidIds.add(id)
      }
      const updated = await tx.update(payments).set(outcome.status === 'paid'
        ? { status: 'paid', paidAt: now, providerReference: outcome.hash!, updatedAt: now }
        : { status: 'pending', cryptoBatchId: null, updatedAt: now })
        .where(and(inArray(payments.id, ids), eq(payments.cryptoBatchId, batch.id), eq(payments.status, 'processing'))).returning({ id: payments.id })
      if (updated.length !== ids.length) throw new ApiError(409, 'The payout records changed during reconciliation')
    }

    for (const hash of refs) {
      const [used] = await tx.insert(hashes).values({ chain: batch.chain, hash, batchId: batch.id }).onConflictDoNothing().returning()
      if (!used) {
        const owner = await tx.query.creatorCryptoPayoutHashes.findFirst({ where: and(eq(hashes.chain, batch.chain), eq(hashes.hash, hash)) })
        if (owner?.batchId !== batch.id) throw new ApiError(409, 'This transaction hash was already used for another payout batch')
      }
      const [manual] = await tx.select({ id: payments.id }).from(payments).where(and(
        sql`crypto_batch_id is distinct from ${batch.id}`,
        batch.chain === 'solana' ? eq(payments.providerReference, hash) : sql`lower(${payments.providerReference}) = ${hash}`,
      )).limit(1)
      if (manual) throw new ApiError(409, 'This transaction hash already exists in the payment ledger')
    }

    const affected = records.filter(payment => paidIds.has(payment.id))
    for (const requestId of new Set(affected.flatMap(payment => payment.payoutRequestId ? [payment.payoutRequestId] : []))) {
      await tx.update(requests).set({ status: 'paid', paidAt: now }).where(and(eq(requests.id, requestId), eq(requests.status, 'pending'),
        sql`not exists (select 1 from creator_payments p where p.payout_request_id = ${requestId} and p.status not in ('paid', 'cancelled'))`))
    }
    for (const post of posts) {
      if (post.status !== 'approved' || !affected.some(payment => payment.submissionId === post.id)) continue
      const ledger = await tx.query.creatorPayments.findMany({ where: eq(payments.submissionId, post.id) })
      if (remainingCreatorPaymentCents(creatorEarnedCents(post), ledger, false) === 0) {
        await tx.update(submissions).set({ status: 'paid', updatedAt: now }).where(eq(submissions.id, post.id))
      }
    }

    const progress = proof.chain === 'solana' && batch.status === 'submitted' ? proof.transfers.map(transfer => transfer.outcome) : outcomes.map(outcome => outcome?.status)
    const status = progress.includes(undefined) ? 'submitted'
      : progress.every(outcome => outcome === 'paid') ? 'paid'
      : progress.every(outcome => outcome === 'failed') ? 'failed' : 'partial'
    const [saved] = await tx.update(batches).set({ status, proof, updatedAt: now }).where(eq(batches.id, batch.id)).returning()
    return { batch: saved, creatorIds: [...new Set(affected.map(payment => payment.creatorProfileId))] }
  })

  for (const creatorId of result.creatorIds) {
    const refresh = await Promise.allSettled([refreshCreatorBonuses(creatorId), refreshCreatorReferralBonuses(creatorId)])
    if (refresh.some(item => item.status === 'rejected')) console.error('Creator payout bonus refresh failed', { creatorId })
  }
  return publicBatch(result.batch)
}

export async function reconcileOpenCryptoPayouts() {
  const open = await db.select({ id: batches.id }).from(batches).where(and(activeBatch, eq(batches.status, 'submitted'))).orderBy(asc(batches.updatedAt)).limit(3)
  const results = await Promise.allSettled(open.map(({ id }) => reconcileCryptoBatch(id)))
  return { checked: open.length, errors: results.filter(result => result.status === 'rejected').length }
}
