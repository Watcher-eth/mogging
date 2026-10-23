import { creatorPostPlatform } from './validation'

type PostingAccount = { id: string; platform: 'tiktok' | 'instagram'; handle: string | null }

// Standard Instagram links and shortened share links do not identify an author.
export function detectPostingAccount<T extends PostingAccount>(value: string, accounts: T[], selectedId = '') {
  const platform = creatorPostPlatform(value.trim())
  const candidates = accounts.filter(account => account.platform === platform)
  const path = platform ? new URL(value.trim()).pathname : ''
  const handle = (platform === 'tiktok'
    ? path.match(/^\/@([\w.]+)\/(?:video|photo)\//)?.[1]
    : path.match(/^\/([\w.]+)\/(?:reel|reels|p)\//)?.[1])?.toLowerCase()
  const author = handle === 'share' ? undefined : handle
  const account = author
    ? candidates.find(item => item.handle?.replace(/^@/, '').toLowerCase() === author)
    : candidates.find(item => item.id === selectedId) || (candidates.length === 1 ? candidates[0] : undefined)
  return { platform, handle: author, account, candidates }
}
