export const payoutChains = ['solana', 'base', 'ethereum'] as const
export type PayoutChain = typeof payoutChains[number]

export const payoutNetworks = {
  solana: { label: 'Solana', token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', explorer: 'https://solscan.io/tx/' },
  base: { label: 'Base', chainId: 8453, token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', explorer: 'https://basescan.org/tx/' },
  ethereum: { label: 'Ethereum', chainId: 1, token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', explorer: 'https://etherscan.io/tx/' },
} as const

export function payoutChain(network: string | null | undefined): PayoutChain | undefined {
  switch (network?.trim().toLowerCase()) {
    case 'usdc on solana': return 'solana'
    case 'base':
    case 'usdc on base': return 'base'
    case 'ethereum':
    case 'usdc on ethereum': return 'ethereum'
  }
}

export const usdcUnits = (cents: number) => BigInt(cents) * BigInt(10_000)

export type PayoutOutput = {
  destination: string
  amountCents: number
  paymentIds: string[]
  creators?: { id: string; name: string }[]
}
export type SolanaTransfer = { unsigned: string; lastValidBlockHeight: number; outputIndexes: number[]; raw?: string; hash?: string; outcome?: 'paid' | 'failed' }
export type EvmBatchProof = {
  chain: 'base' | 'ethereum'
  startBlock: string
  marker?: `0x${string}`
  searchedThrough?: string
  markerHash?: string
  hashes?: string[]
  outputHashes?: string[]
}
export type CryptoBatchProof =
  | { chain: 'solana'; transfers: SolanaTransfer[] }
  | EvmBatchProof
export type CryptoBatchStatus = 'prepared' | 'submitted' | 'paid' | 'failed' | 'partial'
