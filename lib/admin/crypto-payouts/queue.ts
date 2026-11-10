import { createHash, randomBytes } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { canReceiveCreatorPayout, creatorContentBalances } from '@/lib/creator/money'
import { assertCreatorReferralPaymentsEligible } from '@/lib/creator/creator-referrals'
import { checkedPayoutRpc, payoutAddress, prepareChainProof, treasury } from './chains'
import { payoutChain, payoutChains, type PayoutChain, type PayoutOutput } from './shared'

export const { creatorCryptoPayoutBatches: batches, creatorCryptoPayoutHashes: hashes, creatorPayments: payments, creatorPayoutRequests: requests, creatorProfiles: profiles, creatorSubmissions: submissions } = schema
export const activeBatch = inArray(batches.status, ['prepared', 'submitted'])
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Payment = typeof payments.$inferSelect
type PlanLine = { destination: string; creatorProfileId: string; name: string; amountCents: number; paymentId?: string; submissionId?: string }

async function cryptoPlan(tx: Transaction | typeof db, chain: PayoutChain, lock = false): Promise<PlanLine[]> {
  const cryptoProfiles = tx.select().from(profiles).where(or(eq(profiles.paymentOption, 'crypto'), sql`exists (
    select 1 from creator_payout_requests r where r.creator_profile_id = ${profiles.id} and r.status = 'pending' and r.payment_option = 'crypto'
  )`)).orderBy(asc(profiles.id))
  const owners = await (lock ? cryptoProfiles.for('update') : cryptoProfiles)
  if (!owners.length) return []

  const ids = owners.map(owner => owner.id)
  const pending = tx.select().from(requests).where(and(inArray(requests.creatorProfileId, ids), eq(requests.status, 'pending'), eq(requests.paymentOption, 'crypto'))).orderBy(asc(requests.id))
  const bundles = await (lock ? pending.for('update') : pending)
  const creatorSubmissions = tx.select().from(submissions).where(and(inArray(submissions.creatorProfileId, ids), eq(submissions.isDraft, false))).orderBy(asc(submissions.id))
  const posts = await (lock ? creatorSubmissions.for('update') : creatorSubmissions)
  const creatorPayments = tx.select().from(payments).where(inArray(payments.creatorProfileId, ids)).orderBy(asc(payments.id))
  const ledger = await (lock ? creatorPayments.for('update') : creatorPayments)
  const lines: PlanLine[] = []
  const sender = treasury(chain)?.address
  const spendable = (payment: Payment) => payment.status === 'pending' && !payment.providerReference && !payment.cryptoBatchId &&
    payment.paymentOption === 'crypto' && payment.currency === 'USD' && payment.amountCents > 0

  for (const owner of owners) {
    if (owner.authStatus === 'suspended') continue
    const records = ledger.filter(payment => payment.creatorProfileId === owner.id)
    const ownerPosts = posts.filter(post => post.creatorProfileId === owner.id && !post.isDraft)
    const { unpaid } = creatorContentBalances(ownerPosts, records)
    const creator = { creatorProfileId: owner.id, name: owner.displayName }
    for (const request of bundles.filter(bundle => bundle.creatorProfileId === owner.id && payoutChain(bundle.network) === chain)) {
      const destination = payoutAddress(chain, request.destination)
      const included = records.filter(payment => payment.payoutRequestId === request.id && payment.status !== 'cancelled')
      if (!destination || destination === sender || !included.length || !included.every(spendable) ||
        included.reduce((sum, payment) => sum + payment.amountCents, 0) !== request.amountCents) continue
      for (const payment of included) lines.push({ ...creator, destination, amountCents: payment.amountCents, paymentId: payment.id })
    }
    if (owner.bundledPayouts || owner.paymentOption !== 'crypto' || payoutChain(owner.cryptoNetwork) !== chain || !canReceiveCreatorPayout(owner)) continue
    const destination = payoutAddress(chain, owner.cryptoWalletAddress || '')
    if (!destination || destination === sender) continue

    for (const payment of records) {
      if (spendable(payment) && !payment.payoutRequestId && !payment.submissionId) lines.push({ ...creator, destination, amountCents: payment.amountCents, paymentId: payment.id })
    }
    for (const post of ownerPosts.filter(post => post.status === 'approved' || post.status === 'paid')) {
      const related = records.filter(payment => payment.submissionId === post.id)
      if (related.some(payment => payment.status === 'processing' || (payment.status !== 'cancelled' && payment.currency !== 'USD'))) continue
      const scheduled = related.filter(payment => payment.status === 'pending')
      if (scheduled.some(payment => !spendable(payment) || payment.payoutRequestId)) continue
      const due = unpaid.get(post.id) ?? 0
      const scheduledCents = scheduled.reduce((total, payment) => total + payment.amountCents, 0)
      if (scheduledCents > due) continue
      for (const payment of scheduled) lines.push({ ...creator, destination, amountCents: payment.amountCents, paymentId: payment.id })
      if (due > scheduledCents && (post.sprintId || related.length === 0)) {
        lines.push({ ...creator, destination, amountCents: due - scheduledCents, submissionId: post.id })
      }
    }
  }
  return lines
}

const fingerprint = (lines: PlanLine[], sender: string) => createHash('sha256').update(JSON.stringify({ lines, sender })).digest('hex')

function groupOutputs(lines: PlanLine[]): PayoutOutput[] {
  const outputs = new Map<string, PayoutOutput & { creators: NonNullable<PayoutOutput['creators']> }>()
  for (const line of lines) {
    const output = outputs.get(line.destination) ?? { destination: line.destination, amountCents: 0, paymentIds: [], creators: [] }
    output.amountCents += line.amountCents
    if (line.paymentId) output.paymentIds.push(line.paymentId)
    if (!output.creators.some(creator => creator.id === line.creatorProfileId)) output.creators.push({ id: line.creatorProfileId, name: line.name })
    outputs.set(line.destination, output)
  }
  return [...outputs.values()]
}

export function publicBatch(batch: typeof batches.$inferSelect) {
  const { id, chain, sender, status, proof, outputs } = batch
  const transfers = proof.chain === 'solana' ? proof.transfers : []
  const transferByOutput = new Map(transfers.flatMap(transfer => transfer.outputIndexes.map(index => [index, transfer] as const)))
  const creatorsPaid = new Map<string, boolean>()
  const recipients = outputs.map((output, index) => {
    const transfer = transferByOutput.get(index)
    const outcome = transfer?.outcome ?? (status === 'paid' || status === 'failed' ? status : undefined)
    for (const creator of output.creators ?? []) {
      creatorsPaid.set(creator.id, (creatorsPaid.get(creator.id) ?? true) && outcome === 'paid')
    }
    return {
      destination: output.destination,
      amountCents: output.amountCents,
      names: output.creators?.map(creator => creator.name) ?? [],
      outcome,
      hash: proof.chain === 'solana' ? transfer?.hash
        : proof.outputHashes?.[index] ?? (status === 'paid' && proof.hashes?.length === 1 ? proof.hashes[0] : undefined),
    }
  })
  const hasCreators = outputs.every(output => output.creators?.length)
  return {
    id, chain, sender, status, amountCents: outputs.reduce((total, output) => total + output.amountCents, 0),
    recipientCount: outputs.length,
    paidWalletCount: recipients.filter(recipient => recipient.outcome === 'paid').length,
    creatorCount: hasCreators ? creatorsPaid.size : null,
    paidCreatorCount: hasCreators ? [...creatorsPaid.values()].filter(Boolean).length : null,
    recipients,
    hashes: proof.chain === 'solana' ? proof.transfers.flatMap(transfer => transfer.hash ? [transfer.hash] : [])
      : [...new Set(proof.outputHashes ?? [...(proof.markerHash ? [proof.markerHash] : []), ...(proof.hashes ?? [])])],
  }
}

export async function readCryptoBatch(id: string) {
  const batch = await db.query.creatorCryptoPayoutBatches.findFirst({ where: eq(batches.id, id) })
  if (!batch) throw new ApiError(404, 'Payout batch not found')
  return publicBatch(batch)
}

export async function payoutQueue() {
  const latest = await db.selectDistinctOn([batches.chain]).from(batches)
    .orderBy(batches.chain, desc(activeBatch), desc(batches.createdAt), desc(batches.id))
  return Promise.all(payoutChains.map(async chain => {
    const config = treasury(chain)
    const recent = latest.find(item => item.chain === chain)
    const batch = recent ? publicBatch(recent) : null
    const active = batch?.status === 'prepared' || batch?.status === 'submitted' ? batch : null
    const plan = config && !active ? await cryptoPlan(db, chain) : []
    const destinations = new Map<string, { destination: string; amountCents: number; names: string[] }>()
    for (const line of plan) {
      const output = destinations.get(line.destination) ?? { destination: line.destination, amountCents: 0, names: [] }
      output.amountCents += line.amountCents
      if (!output.names.includes(line.name)) output.names.push(line.name)
      destinations.set(line.destination, output)
    }
    return { chain, sender: config?.address ?? null, preview: config ? fingerprint(plan, config.address) : null,
      recipients: [...destinations.values()], active, latest: batch }
  }))
}

export async function prepareCryptoBatch(chain: PayoutChain, preview: string, adminUserId: string) {
  const config = treasury(chain)
  if (!config) throw new ApiError(503, 'Configure the treasury wallet for this network first')
  const plan = await cryptoPlan(db, chain)
  if (!plan.length || fingerprint(plan, config.address) !== preview) throw new ApiError(409, 'The payout list changed. Refresh and review it again.')
  const outputs = groupOutputs(plan)
  if (outputs.length > 200) throw new ApiError(409, 'This network has more than 200 recipients. Split the queue before sending.')
  const id = `0x${randomBytes(32).toString('hex')}`
  const proof = await checkedPayoutRpc(() => prepareChainProof(chain, id, config.address, outputs))

  const batch = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-crypto-payout:${chain}`}, 0))`)
    const existing = await tx.query.creatorCryptoPayoutBatches.findFirst({ where: and(eq(batches.chain, chain), activeBatch) })
    if (existing) throw new ApiError(409, 'A batch is already active for this network')
    const lockedPlan = await cryptoPlan(tx, chain, true)
    if (fingerprint(lockedPlan, config.address) !== preview) throw new ApiError(409, 'The payout list changed. Refresh and review it again.')
    const pendingIds = lockedPlan.flatMap(line => line.paymentId ? [line.paymentId] : [])
    const pending = pendingIds.length ? await tx.select().from(payments).where(inArray(payments.id, pendingIds)) : []
    await assertCreatorReferralPaymentsEligible(tx, pending)
    await tx.insert(batches).values({ id, chain, sender: config.address, adminUserId, status: 'prepared', outputs: [], proof })
    const reserved = await Promise.all(lockedPlan.map(async line => {
      if (line.paymentId) {
        const [claimed] = await tx.update(payments).set({ status: 'processing', cryptoBatchId: id, updatedAt: new Date() })
          .where(and(eq(payments.id, line.paymentId), eq(payments.status, 'pending'), isNull(payments.cryptoBatchId))).returning({ id: payments.id })
        if (!claimed) throw new ApiError(409, 'A payment was already claimed')
        return line
      }
      const [created] = await tx.insert(payments).values({
        creatorProfileId: line.creatorProfileId, submissionId: line.submissionId, amountCents: line.amountCents,
        status: 'processing', paymentOption: 'crypto', cryptoBatchId: id,
      }).returning({ id: payments.id })
      return { ...line, paymentId: created.id }
    }))
    const [saved] = await tx.update(batches).set({ outputs: groupOutputs(reserved) }).where(eq(batches.id, id)).returning()
    return saved
  })
  return { ...publicBatch(batch), proof, outputs: outputs.map(({ destination, amountCents }) => ({ destination, amountCents })) }
}
