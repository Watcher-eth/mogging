import { afterAll, beforeAll, expect, test } from 'bun:test'
import { ComputeBudgetProgram, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js'
import { encodeEventTopics, erc20Abi, toHex, type Address } from 'viem'
import { eq } from 'drizzle-orm'
import bs58 from 'bs58'
import { payoutNetworks, usdcUnits, type PayoutChain } from './shared'

const testUrl = process.env.TEST_CREATOR_CRYPTO_DATABASE_URL
let database: typeof import('@/lib/db')
let queue: typeof import('./queue')
let settlement: typeof import('./settlement')
const signer = Keypair.generate()
const blockhash = Keypair.generate().publicKey.toBase58()
const evmSender = '0x1000000000000000000000000000000000000001'
const evmRecipient = '0x2000000000000000000000000000000000000002'
const evmHash = `0x${'3'.repeat(64)}` as const
const evmBlockHash = `0x${'4'.repeat(64)}` as const
const signatures = new Set<string>()
const failedSignatures = new Set<string>()
const pendingSignatures = new Set<string>()
let solanaFinalized = false
let blockHeight = 100
let evmFinalized = false
let evmRecipientMatches = false
let evmMarker: Address | undefined
let evmHasMarker = true
let rpc: ReturnType<typeof Bun.serve> | undefined

beforeAll(async () => {
  if (!testUrl) return
  const url = new URL(testUrl)
  if (url.hostname !== '127.0.0.1' || url.port !== '55449' || url.pathname !== '/creator_crypto_test') throw Error('Use the isolated crypto payout test database.')
  process.env.DATABASE_URL = testUrl
  rpc = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      const { id, method, params } = await request.json() as { id: number; method: string; params: string[] }
      const receiptHash = new URL(request.url).pathname === '/ethereum' ? `0x${'5'.repeat(64)}` : evmHash
      const tokenLog = {
        address: payoutNetworks[new URL(request.url).pathname === '/ethereum' ? 'ethereum' : 'base'].token, blockHash: evmBlockHash, blockNumber: '0x65', transactionHash: receiptHash,
        logIndex: '0x0', transactionIndex: '0x0', removed: false,
        topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: {
          from: evmSender, to: (evmRecipientMatches ? evmRecipient : evmSender) as Address,
        } }),
        data: toHex(usdcUnits(1800), { size: 32 }),
      }
      const markerLog = evmMarker && {
        ...tokenLog, logIndex: '0x1', data: toHex(0, { size: 32 }),
        topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: evmSender, to: evmMarker } }),
      }
      let result: unknown
      switch (method) {
        case 'getGenesisHash': result = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'; break
        case 'getTokenAccountBalance': result = { context: { slot: 10 }, value: { amount: '200000000', decimals: 6, uiAmount: 200 } }; break
        case 'getLatestBlockhash': result = { context: { slot: 10 }, value: { blockhash, lastValidBlockHeight: 200 } }; break
        case 'getSignatureStatuses': result = { context: { slot: 12 }, value: (params[0] as unknown as string[]).map(hash =>
          solanaFinalized && signatures.has(hash) && !pendingSignatures.has(hash) ? { slot: 12, err: failedSignatures.has(hash) ? { InstructionError: [0, 'InvalidArgument'] } : null, confirmations: null, confirmationStatus: 'finalized' } : null) }; break
        case 'getBlockHeight': result = blockHeight; break
        case 'sendTransaction': {
          const tx = Transaction.from(Buffer.from(params[0], 'base64'))
          result = bs58.encode(tx.signature!)
          signatures.add(result as string)
          break
        }
        case 'eth_chainId': result = new URL(request.url).pathname === '/ethereum' ? '0x1' : '0x2105'; break
        case 'eth_call': result = toHex(100_000_000, { size: 32 }); break
        case 'eth_blockNumber': result = '0x64'; break
        case 'eth_getBlockByNumber': result = { number: evmFinalized ? '0x66' : '0x64', hash: evmBlockHash }; break
        case 'eth_getTransactionReceipt': result = params[0] === receiptHash ? { transactionHash: receiptHash, transactionIndex: '0x0', blockHash: evmBlockHash, blockNumber: '0x65',
          from: evmSender, to: payoutNetworks.base.token, status: '0x1', logs: markerLog && evmHasMarker ? [tokenLog, markerLog] : [tokenLog], cumulativeGasUsed: '0x10', gasUsed: '0x10' } : null; break
        case 'eth_getLogs': result = markerLog && evmHasMarker ? [markerLog] : []; break
        default: return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: method } })
      }
      return Response.json({ jsonrpc: '2.0', id, result })
    },
  })
  process.env.CREATOR_PAYOUT_SOLANA_WALLET = signer.publicKey.toBase58()
  process.env.CREATOR_PAYOUT_SOLANA_RPC_URL = rpc.url.toString()
  process.env.CREATOR_PAYOUT_BASE_WALLET = evmSender
  process.env.CREATOR_PAYOUT_BASE_RPC_URL = rpc.url.toString()
  process.env.CREATOR_PAYOUT_ETHEREUM_WALLET = evmSender
  process.env.CREATOR_PAYOUT_ETHEREUM_RPC_URL = new URL('/ethereum', rpc.url).toString()
  database = await import('@/lib/db')
  queue = await import('./queue')
  settlement = await import('./settlement')
})
afterAll(async () => { rpc?.stop(true); if (database) await database.db.$client.end() })

async function creator(network: string, wallet: string, bundledPayouts = false) {
  const { db, schema } = database
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({ id, email: `${id}@crypto-test.local` })
  const [profile] = await db.insert(schema.creatorProfiles).values({
    userId: id, displayName: 'Test creator', authStatus: 'verified', paymentOption: 'crypto',
    cryptoNetwork: network, cryptoWalletAddress: wallet, bundledPayouts,
  }).returning()
  return profile
}

async function prepare(chain: PayoutChain) {
  const network = (await queue.payoutQueue()).find(item => item.chain === chain)!
  return queue.prepareCryptoBatch(chain, network.preview!, 'fixture-admin')
}

test.skipIf(!testUrl)('Solana reserves approved earnings and requested bundles, verifies signed bytes, and settles only finalized transfers', async () => {
  const { db, schema } = database
  const destination = Keypair.generate().publicKey.toBase58()
  const owner = await creator('USDC on Solana', destination)
  const bundled = await creator('USDC on Solana', destination, true)
  const [post] = await db.insert(schema.creatorSubmissions).values({
    creatorProfileId: owner.id, title: 'Approved post', platform: 'tiktok', status: 'approved', approvedAmountCents: 900,
  }).returning()
  const [request] = await db.insert(schema.creatorPayoutRequests).values({
    creatorProfileId: bundled.id, amountCents: 600, paymentOption: 'crypto', destination, network: 'USDC on Solana',
  }).returning()
  await db.insert(schema.creatorPayments).values([
    { creatorProfileId: bundled.id, amountCents: 600, paymentOption: 'crypto', payoutRequestId: request.id },
    { creatorProfileId: bundled.id, amountCents: 400, paymentOption: 'crypto' },
    { creatorProfileId: owner.id, amountCents: 300, paymentOption: 'paypal' },
  ])
  const batch = await prepare('solana')
  expect(batch.outputs).toEqual([{ destination, amountCents: 1500 }])
  expect(batch).toMatchObject({ creatorCount: 2, paidCreatorCount: 0, recipientCount: 1 })
  if (batch.proof.chain !== 'solana') throw Error('Expected a Solana proof.')
  const [claimed] = await db.select().from(schema.creatorPayments).where(eq(schema.creatorPayments.submissionId, post.id))
  await expect(db.update(schema.creatorPayments).set({ status: 'paid' }).where(eq(schema.creatorPayments.id, claimed.id)).execute()).rejects.toThrow()
  const unsigned = Buffer.from(batch.proof.transfers[0].unsigned, 'base64')
  const changed = Transaction.from(unsigned)
  changed.add(new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) }))
  changed.sign(signer)
  await expect(settlement.submitSolana(batch.id, 'fixture-admin', [changed.serialize().toString('base64')])).rejects.toMatchObject({ status: 400 })
  expect(signatures.size).toBe(0)
  const tx = Transaction.from(unsigned)
  // Phantom can add a priority fee at signing time if the app leaves the budget unset.
  if (!tx.instructions.some(instruction => instruction.programId.equals(ComputeBudgetProgram.programId))) {
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }))
  }
  tx.sign(signer)
  const signed = [tx.serialize().toString('base64')]
  blockHeight = 200
  await expect(settlement.submitSolana(batch.id, 'fixture-admin', signed)).rejects.toMatchObject({ status: 409 })
  expect(signatures.size).toBe(0)
  blockHeight = 100
  const submitted = await settlement.submitSolana(batch.id, 'fixture-admin', signed)
  expect(submitted.status).toBe('submitted')
  await expect(settlement.cancelPreparedBatch(batch.id)).rejects.toMatchObject({ status: 409 })
  solanaFinalized = true
  const results = await Promise.all([settlement.reconcileCryptoBatch(batch.id), settlement.reconcileCryptoBatch(batch.id)])
  expect(results.every(result => result.status === 'paid')).toBe(true)
  expect(await queue.readCryptoBatch(batch.id)).toMatchObject({ paidCreatorCount: 2, paidWalletCount: 1, recipients: [{ outcome: 'paid', hash: submitted.hashes[0] }] })
  const ledger = await db.select().from(schema.creatorPayments)
  expect(ledger.filter(payment => payment.status === 'paid').map(payment => payment.providerReference)).toEqual([submitted.hashes[0], submitted.hashes[0]])
  expect(ledger.filter(payment => payment.status === 'pending').map(payment => payment.amountCents).sort()).toEqual([300, 400])
  expect((await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, post.id) }))?.status).toBe('paid')
  expect((await db.query.creatorPayoutRequests.findFirst({ where: eq(schema.creatorPayoutRequests.id, request.id) }))?.status).toBe('paid')
})

test.skipIf(!testUrl)('A split Solana batch releases only the finalized failed transaction', async () => {
  const { db, schema } = database
  const owners = await Promise.all(Array.from({ length: 14 }, () => creator('USDC on Solana', Keypair.generate().publicKey.toBase58())))
  await db.insert(schema.creatorPayments).values(owners.map(owner => ({ creatorProfileId: owner.id, amountCents: 800, paymentOption: 'crypto' as const })))
  const cancelled = await prepare('solana')
  expect((await settlement.cancelPreparedBatch(cancelled.id)).status).toBe('failed')
  const batch = await prepare('solana')
  if (batch.proof.chain !== 'solana') throw Error('Expected a Solana proof.')
  expect(batch.proof.transfers).toHaveLength(2)
  const [firstCount, secondCount] = batch.proof.transfers.map(transfer => transfer.outputIndexes.length)
  expect(firstCount).toBeGreaterThan(5)
  expect(firstCount + secondCount).toBe(owners.length)
  const signed = batch.proof.transfers.map(transfer => {
    const tx = Transaction.from(Buffer.from(transfer.unsigned, 'base64'))
    tx.sign(signer)
    return tx.serialize().toString('base64')
  })
  solanaFinalized = false
  const submitted = await settlement.submitSolana(batch.id, 'fixture-admin', signed)
  expect(submitted.status).toBe('submitted')
  failedSignatures.add(submitted.hashes[1])
  pendingSignatures.add(submitted.hashes[1])
  solanaFinalized = true
  expect(await settlement.reconcileCryptoBatch(batch.id)).toMatchObject({ status: 'submitted', paidCreatorCount: firstCount, creatorCount: owners.length })
  pendingSignatures.clear()
  expect(await settlement.reconcileCryptoBatch(batch.id)).toMatchObject({ status: 'partial', paidCreatorCount: firstCount, creatorCount: owners.length })
  const retry = (await queue.payoutQueue()).find(item => item.chain === 'solana')!
  expect(retry.recipients).toHaveLength(secondCount)
  expect(retry.recipients[0].amountCents).toBe(800)
  const remainder = await prepare('solana')
  await settlement.cancelPreparedBatch(remainder.id)
})

test.skipIf(!testUrl)('Base requires finality and exact USDC logs before a hash can settle the ledger', async () => {
  const { db, schema } = database
  const owner = await creator('BASE', evmRecipient)
  const [payment] = await db.insert(schema.creatorPayments).values({ creatorProfileId: owner.id, amountCents: 1800, paymentOption: 'crypto' }).returning()
  const batch = await prepare('base')
  if (batch.proof.chain !== 'base') throw Error('Expected a Base proof.')
  evmMarker = batch.proof.marker
  await settlement.beginEvm(batch.id, 'fixture-admin')
  await expect(settlement.cancelPreparedBatch(batch.id)).rejects.toMatchObject({ status: 409 })
  await expect(settlement.beginEvm(batch.id, 'fixture-admin')).rejects.toMatchObject({ status: 409 })
  expect((await settlement.attachEvmHashes(batch.id, [evmHash])).status).toBe('submitted')
  evmFinalized = true
  evmHasMarker = false
  await expect(settlement.reconcileCryptoBatch(batch.id)).rejects.toMatchObject({ status: 409 })
  expect((await queue.readCryptoBatch(batch.id)).paidCreatorCount).toBe(0)
  evmHasMarker = true
  await expect(settlement.reconcileCryptoBatch(batch.id)).rejects.toMatchObject({ status: 409 })
  expect((await db.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, payment.id) }))?.status).toBe('processing')
  evmRecipientMatches = true
  expect((await settlement.reconcileCryptoBatch(batch.id)).status).toBe('paid')
  expect(await db.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, payment.id) })).toMatchObject({ status: 'paid', providerReference: evmHash })
  await expect(db.insert(schema.creatorPayments).values({
    creatorProfileId: owner.id, amountCents: 1800, paymentOption: 'crypto', status: 'paid', providerReference: evmHash,
  }).execute()).rejects.toThrow()
})


test.skipIf(!testUrl)('Ethereum finds the finalized native USDC batch after the signing browser leaves without providing a receipt', async () => {
  const { db, schema } = database
  const owner = await creator('Ethereum', evmRecipient)
  const [payment] = await db.insert(schema.creatorPayments).values({ creatorProfileId: owner.id, amountCents: 1800, paymentOption: 'crypto' }).returning()
  const batch = await prepare('ethereum')
  if (batch.proof.chain !== 'ethereum') throw Error('Expected an Ethereum proof.')
  evmMarker = batch.proof.marker
  await settlement.beginEvm(batch.id, 'fixture-admin')
  const hash = `0x${'5'.repeat(64)}`
  await settlement.reconcileOpenCryptoPayouts()
  expect(await queue.readCryptoBatch(batch.id)).toMatchObject({ status: 'paid', paidCreatorCount: 1, hashes: [hash], recipients: [{ outcome: 'paid', hash }] })
  expect(await db.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, payment.id) })).toMatchObject({ status: 'paid', providerReference: hash })
})
