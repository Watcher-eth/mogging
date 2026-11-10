import { isDeepStrictEqual } from 'node:util'
import { ComputeBudgetInstruction, ComputeBudgetProgram, Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import bs58 from 'bs58'
import { createPublicClient, getAddress, http, isAddress, parseAbiItem, parseEventLogs, erc20Abi, type Hash } from 'viem'
import { base, mainnet } from 'viem/chains'
import { ApiError } from '@/lib/api/http'
import { payoutNetworks, usdcUnits, type CryptoBatchProof, type EvmBatchProof, type PayoutChain, type PayoutOutput } from './shared'

const solanaMainnet = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
const lighthouseProgram = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95')
// Lighthouse account-info and token-account assertions (single and multi).
const lighthousePayoutAssertions = new Set([5, 6, 9, 10])
const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const publicPayoutRpc = {
  solana: 'https://solana-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  ethereum: 'https://ethereum-rpc.publicnode.com',
} satisfies Record<PayoutChain, string>

export function payoutAddress(chain: PayoutChain, value: string): string | null {
  try {
    if (chain !== 'solana') return isAddress(value) && !/^0x0{40}$/i.test(value) ? getAddress(value.toLowerCase()) : null
    const key = new PublicKey(value)
    return PublicKey.isOnCurve(key) && !key.equals(PublicKey.default) ? key.toBase58() : null
  } catch { return null }
}

export function treasury(chain: PayoutChain) {
  const address = payoutAddress(chain, process.env[`CREATOR_PAYOUT_${chain.toUpperCase()}_WALLET`] || '')
  return address ? { address } : null
}

function rpcUrl(chain: PayoutChain) {
  return process.env[`CREATOR_PAYOUT_${chain.toUpperCase()}_RPC_URL`] || publicPayoutRpc[chain]
}

function solanaConnection() {
  return new Connection(rpcUrl('solana'), {
    commitment: 'finalized',
    disableRetryOnRateLimit: true,
    fetch: Object.assign((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }), { preconnect: fetch.preconnect }),
  })
}

function evmClient(chain: 'base' | 'ethereum') {
  return createPublicClient({ chain: chain === 'base' ? base : mainnet, transport: http(rpcUrl(chain), { timeout: 8_000, retryCount: 0 }) })
}

export async function assertPayoutNetwork(chain: PayoutChain) {
  if (chain === 'solana' ? await solanaConnection().getGenesisHash() !== solanaMainnet
    : await evmClient(chain).getChainId() !== payoutNetworks[chain].chainId) {
    throw new ApiError(503, 'The configured payout RPC is on the wrong network')
  }
}

export async function prepareChainProof(chain: PayoutChain, id: string, sender: string, outputs: PayoutOutput[]): Promise<CryptoBatchProof> {
  await assertPayoutNetwork(chain)
  const total = outputs.reduce((sum, output) => sum + usdcUnits(output.amountCents), BigInt(0))
  if (chain !== 'solana') {
    const client = evmClient(chain)
    const [balance, block] = await Promise.all([
      client.readContract({ address: payoutNetworks[chain].token, abi: erc20Abi, functionName: 'balanceOf', args: [sender as `0x${string}`] }),
      client.getBlockNumber(),
    ])
    if (balance < total) throw new ApiError(409, 'The treasury does not have enough USDC for this batch')
    const marker = getAddress(`0x${id.slice(-40)}`)
    if (marker === sender || /^0x0{40}$/.test(marker) || outputs.some(output => output.destination === marker)) {
      throw new ApiError(409, 'Could not allocate a unique tracking reference. Review the batch again.')
    }
    return { chain, startBlock: String(block), marker }
  }

  const connection = solanaConnection()
  const mint = new PublicKey(payoutNetworks.solana.token)
  const payer = new PublicKey(sender)
  const source = getAssociatedTokenAddressSync(mint, payer)
  const [balance, { blockhash, lastValidBlockHeight }] = await Promise.all([
    connection.getTokenAccountBalance(source, 'confirmed').catch(() => null),
    connection.getLatestBlockhash('confirmed'),
  ])
  if (!balance || BigInt(balance.value.amount) < total) throw new ApiError(409, 'Check that the treasury has enough USDC in its associated token account')
  const transfers = []
  for (let offset = 0; offset < outputs.length;) {
    const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight })
    // Provide an explicit default priority fee for wallet approval.
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }))
    tx.add(new TransactionInstruction({ programId: memoProgram, keys: [], data: Buffer.from(`mogging:${id}:${offset}`) }))
    const outputIndexes = []
    let unsigned = ''
    for (let index = offset; index < outputs.length; index++) {
      const output = outputs[index]
      const owner = new PublicKey(output.destination)
      const destination = getAssociatedTokenAddressSync(mint, owner)
      tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, destination, owner, mint))
      tx.add(createTransferCheckedInstruction(source, mint, destination, payer, usdcUnits(output.amountCents), 6))
      try { unsigned = tx.serialize({ requireAllSignatures: false }).toString('base64') }
      catch (error) {
        if (unsigned && error instanceof Error && error.message.startsWith('Transaction too large:')) break
        throw error
      }
      outputIndexes.push(index)
    }
    transfers.push({ unsigned, lastValidBlockHeight, outputIndexes })
    offset += outputIndexes.length
  }
  return { chain, transfers }
}

function solanaMessageContents(transaction: Transaction) {
  const message = transaction.compileMessage()
  return {
    blockhash: message.recentBlockhash,
    payer: message.accountKeys[0]?.toBase58(),
    accountCount: message.accountKeys.length,
    accounts: new Map(message.accountKeys.map((key, index) => [
      key.toBase58(), [message.isAccountSigner(index), message.isAccountWritable(index)],
    ])),
    instructions: message.instructions.map(instruction => ({
      program: message.accountKeys[instruction.programIdIndex].toBase58(),
      accounts: instruction.accounts.map(index => message.accountKeys[index].toBase58()),
      data: instruction.data,
    })),
  }
}

export function signedSolanaProof(proof: Extract<CryptoBatchProof, { chain: 'solana' }>, signed: string[]): CryptoBatchProof {
  if (signed.length !== proof.transfers.length) throw new ApiError(400, 'The wallet did not sign every transaction')
  return { chain: 'solana', transfers: proof.transfers.map((transfer, index) => {
    let reason = 'The wallet returned an unreadable transaction.'
    try {
      const raw = Buffer.from(signed[index], 'base64')
      const tx = Transaction.from(raw)
      const original = Transaction.from(Buffer.from(transfer.unsigned, 'base64'))
      reason = 'The treasury signature could not be verified.'
      if (!tx.signature || !tx.serialize().equals(raw)) throw Error()
      reason = 'The wallet changed the blockhash or fee payer. Review a fresh batch.'
      if (tx.recentBlockhash !== original.recentBlockhash || !tx.feePayer?.equals(original.feePayer!)) throw Error()
      reason = 'The wallet changed an instruction or account in the reviewed payout.'
      // Phantom may set its approved network fee while signing. All payout instructions stay exact.
      const reviewed = new Transaction({ feePayer: original.feePayer, recentBlockhash: original.recentBlockhash })
      const originalAccounts = new Set(original.compileMessage().accountKeys.map(key => key.toBase58()))
      const payouts = original.instructions.filter(instruction => !instruction.programId.equals(ComputeBudgetProgram.programId))
      let payoutIndex = 0
      for (const instruction of tx.instructions) {
        if (instruction.programId.equals(ComputeBudgetProgram.programId)) {
          const kind = ComputeBudgetInstruction.decodeInstructionType(instruction)
          if (instruction.keys.length || !['SetComputeUnitPrice', 'SetComputeUnitLimit'].includes(kind)) throw Error()
          reviewed.add(instruction)
        } else if (instruction.programId.equals(lighthouseProgram)) {
          const [target] = instruction.keys
          if (instruction.keys.length !== 1 || !originalAccounts.has(target.pubkey.toBase58())
            || !lighthousePayoutAssertions.has(instruction.data[0])) throw Error()
          reviewed.add(new TransactionInstruction({
            programId: lighthouseProgram,
            keys: [{ pubkey: target.pubkey, isSigner: false, isWritable: false }],
            data: instruction.data,
          }))
        } else {
          if (!payouts[payoutIndex]) throw Error()
          reviewed.add(payouts[payoutIndex++])
        }
      }
      if (payoutIndex !== payouts.length || !isDeepStrictEqual(solanaMessageContents(tx), solanaMessageContents(reviewed))) throw Error()
      return { ...transfer, raw: raw.toString('base64'), hash: bs58.encode(tx.signature) }
    } catch { throw new ApiError(400, `A signed Solana transaction did not match the reviewed batch. ${reason}`) }
  }) }
}

export async function assertSolanaPayoutBlockhash(proof: Extract<CryptoBatchProof, { chain: 'solana' }>) {
  const height = await solanaConnection().getBlockHeight('confirmed')
  if (proof.transfers.some(transfer => height > transfer.lastValidBlockHeight - 4)) {
    throw new ApiError(409, 'The Solana approval expired before submission. Release the reservation and review a fresh batch.')
  }
}

export async function solanaOutcomes(transfers: Extract<CryptoBatchProof, { chain: 'solana' }>['transfers']) {
  const connection = solanaConnection()
  const pending = transfers.filter(transfer => !transfer.outcome && transfer.hash && transfer.raw)
  if (!pending.length) return new Map<string, 'paid' | 'failed'>()
  const hashes = pending.map(transfer => transfer.hash!)
  const { value: statuses } = await connection.getSignatureStatuses(hashes, { searchTransactionHistory: true })
  const height = await connection.getBlockHeight('finalized')
  const outcomes = new Map<string, 'paid' | 'failed'>()
  await Promise.all(pending.map(async (transfer, index) => {
    const status = statuses[index]
    if (status?.confirmationStatus === 'finalized') {
      outcomes.set(transfer.hash!, status.err ? 'failed' : 'paid')
    } else if (!status && height <= transfer.lastValidBlockHeight) {
      // Rebroadcasting the same signed bytes cannot execute a second transfer.
      await connection.sendRawTransaction(Buffer.from(transfer.raw!, 'base64'), { maxRetries: 0, preflightCommitment: 'confirmed' }).catch(() => undefined)
    } else if (!status && height > transfer.lastValidBlockHeight) {
      // Keep ambiguous expired signatures reserved. RPC history can be incomplete.
      const tx = await connection.getTransaction(transfer.hash!, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })
      if (tx?.meta) outcomes.set(transfer.hash!, tx.meta.err ? 'failed' : 'paid')
    }
  }))
  return outcomes
}

// The atomic wallet call adds a zero-value USDC transfer to a unique marker.
// A finalized log lets reconciliation locate the receipt without the signing browser.
export async function scanEvmBatch(proof: EvmBatchProof, sender: string) {
  if (!proof.marker || proof.markerHash) return proof
  const client = evmClient(proof.chain)
  const { number } = await client.getBlock({ blockTag: 'finalized' })
  const fromBlock = BigInt(proof.searchedThrough ?? proof.startBlock) + BigInt(1)
  if (number < fromBlock) return proof
  const limit = fromBlock + BigInt(499)
  const toBlock = number < limit ? number : limit
  const logs = await client.getLogs({
    address: payoutNetworks[proof.chain].token, event: transferEvent, strict: true,
    args: { from: sender as `0x${string}`, to: proof.marker }, fromBlock, toBlock,
  })
  const marker = proof.marker.toLowerCase()
  const markers = [...new Set(logs.flatMap(log => !log.removed && log.args.from.toLowerCase() === sender.toLowerCase() &&
    log.args.to.toLowerCase() === marker && log.args.value === BigInt(0) && log.transactionHash ? [log.transactionHash] : []))]
  if (markers.length > 1) throw new ApiError(409, 'Multiple finalized transactions contain this tracking reference')
  return { ...proof, searchedThrough: String(toBlock), ...(markers[0] ? { markerHash: markers[0] } : {}) }
}

export async function evmOutcomes(proof: EvmBatchProof, sender: string, outputs: PayoutOutput[]) {
  const hashes = proof.markerHash ? [proof.markerHash] : proof.hashes ?? []
  if (!hashes.length) return null
  const client = evmClient(proof.chain)
  const finalized = await client.getBlock({ blockTag: 'finalized' })
  const readReceipt = (hash: string) => client.getTransactionReceipt({ hash: hash as Hash }).then(receipt => {
    if (receipt.transactionHash !== hash) throw new ApiError(409, 'The network returned a different payout receipt')
    return receipt
  }).catch(error => {
    if (error.name === 'TransactionReceiptNotFoundError') return null
    throw error
  })
  const readTransfers = (receipt: NonNullable<Awaited<ReturnType<typeof readReceipt>>>) => parseEventLogs({
    abi: [transferEvent],
    logs: receipt.logs.filter(entry => entry.address.toLowerCase() === payoutNetworks[proof.chain].token.toLowerCase() && !entry.removed),
    strict: true,
  }).filter(entry => entry.args.from.toLowerCase() === sender.toLowerCase())
  const receipts = await Promise.all(hashes.map(readReceipt))
  if (receipts.some(receipt => !receipt || receipt.blockNumber > finalized.number)) return null
  const verified = receipts.filter(receipt => receipt !== null)
  if (verified.some(receipt => receipt.blockNumber <= BigInt(proof.startBlock))) throw new ApiError(409, 'A transaction predates this payout batch')
  const transfers = verified.flatMap(readTransfers)
  if (proof.marker) {
    const marker = proof.marker.toLowerCase()
    const index = transfers.findIndex(entry => entry.args.to.toLowerCase() === marker && entry.args.value === BigInt(0))
    if (verified.length !== 1 || index < 0) throw new ApiError(409, 'The finalized receipt does not contain the batch tracking reference')
    transfers.splice(index, 1)
  }
  if (verified.some(receipt => receipt.status !== 'success') || transfers.length !== outputs.length) {
    throw new ApiError(409, 'The finalized transactions do not match every reviewed USDC transfer')
  }
  return outputs.map(output => {
    const match = transfers.find(entry => entry.args.to.toLowerCase() === output.destination.toLowerCase() && entry.args.value === usdcUnits(output.amountCents))
    if (!match) throw new ApiError(409, 'A finalized USDC recipient or amount does not match the reviewed batch')
    if (!match.transactionHash) throw new ApiError(409, 'A finalized transfer is missing its transaction hash')
    return match.transactionHash
  })
}


// Provider errors can contain a credential-bearing RPC URL.
export async function checkedPayoutRpc<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) {
    if (error instanceof ApiError) throw error
    console.error('Creator payout RPC failed', error instanceof Error ? error.name : 'unknown')
    throw new ApiError(503, 'The payout network could not be reached. Try checking the batch again.')
  }
}
