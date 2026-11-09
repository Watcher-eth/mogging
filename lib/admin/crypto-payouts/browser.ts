import type { Transaction } from '@solana/web3.js'
import { payoutNetworks, usdcUnits, type PayoutChain } from './shared'
import type { prepareCryptoBatch } from './queue'

type Batch = Awaited<ReturnType<typeof prepareCryptoBatch>>
type EvmWallet = { request(input: { method: string; params?: unknown[] }): Promise<unknown> }
type SolanaWallet = {
  connect(): Promise<{ publicKey: { toBase58(): string } }>
  signAllTransactions?(transactions: Transaction[]): Promise<Transaction[]>
  signTransaction?(transaction: Transaction): Promise<Transaction>
}
type WalletWindow = Window & { ethereum?: EvmWallet; phantom?: { solana?: SolanaWallet }; solana?: SolanaWallet }

function evmWallet() {
  const wallet = (window as WalletWindow).ethereum
  if (!wallet) throw Error('Open this page in a browser with an EVM wallet.')
  return wallet
}

const evmChainId = (chain: 'base' | 'ethereum') => `0x${payoutNetworks[chain].chainId.toString(16)}`

export async function connectPayoutWallet(chain: PayoutChain, sender: string) {
  if (chain === 'solana') {
    const injected = window as WalletWindow
    const wallet = injected.phantom?.solana ?? injected.solana
    if (!wallet?.signAllTransactions && !wallet?.signTransaction) throw Error('Open this page in a browser with a Solana wallet.')
    if ((await wallet.connect()).publicKey.toBase58() !== sender) throw Error('Select the configured Solana treasury account in your wallet.')
    return { chain, wallet }
  }

  const wallet = evmWallet()
  const accounts = await wallet.request({ method: 'eth_requestAccounts' }) as string[]
  if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== sender.toLowerCase()) throw Error('Select the configured treasury account in your wallet.')
  const chainId = evmChainId(chain)
  if (await wallet.request({ method: 'eth_chainId' }) !== chainId) {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  }
  const capabilities = await wallet.request({ method: 'wallet_getCapabilities', params: [sender, [chainId]] }) as Record<string, { atomic?: { status?: string } }>
  if (!['ready', 'supported'].includes(capabilities?.[chainId]?.atomic?.status || '')) {
    throw Error('Select an EVM wallet and account that support atomic batch payments.')
  }
  return { chain, wallet }
}

export async function signSolanaBatch(batch: Batch, wallet: SolanaWallet) {
  if (batch.proof.chain !== 'solana') throw Error('Expected a Solana batch.')
  const { Transaction } = await import('@solana/web3.js')
  const transactions = batch.proof.transfers.map(transfer => Transaction.from(Uint8Array.from(atob(transfer.unsigned), character => character.charCodeAt(0))))
  const signed = transactions.length === 1 && wallet.signTransaction
    ? [await wallet.signTransaction(transactions[0])]
    : await wallet.signAllTransactions?.(transactions)
  if (!signed) throw Error('This Solana wallet does not support approving multiple transactions together.')
  return signed.map(transaction => btoa(String.fromCharCode(...transaction.serialize())))
}

export async function sendEvmBatch(batch: Batch, wallet: EvmWallet) {
  if (batch.chain === 'solana' || batch.proof.chain !== batch.chain || !batch.proof.marker) throw Error('Expected a prepared EVM batch with a tracking reference.')
  const { encodeFunctionData, erc20Abi } = await import('viem')
  const { chain, sender, outputs, id } = batch
  const transfers = [...outputs, { destination: batch.proof.marker, amountCents: 0 }]
  const result = await wallet.request({ method: 'wallet_sendCalls', params: [{
    version: '2.0.0', id, from: sender, chainId: evmChainId(chain), atomicRequired: true,
    calls: transfers.map(output => ({
      to: payoutNetworks[chain].token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [output.destination as `0x${string}`, usdcUnits(output.amountCents)] }),
    })),
  }] }) as { id?: string }
  if (result?.id !== id) throw Error('The wallet returned a different batch ID. Recover the transaction hashes from its activity before sending again.')
}

export async function findEvmHashes(id: string, chain: 'base' | 'ethereum') {
  const result = await evmWallet().request({ method: 'wallet_getCallsStatus', params: [id] }) as {
    id?: string; chainId?: string; atomic?: boolean; status?: number; receipts?: Array<{ transactionHash?: string }>
  }
  if (result?.status === 100) return []
  if (result?.id !== id || result.chainId !== evmChainId(chain) || result.atomic !== true || result.status !== 200) {
    throw Error('The wallet has not reported a successful atomic batch. Check its activity before sending again.')
  }
  return [...new Set((result.receipts || []).flatMap(receipt => receipt.transactionHash ? [receipt.transactionHash] : []))]
}
