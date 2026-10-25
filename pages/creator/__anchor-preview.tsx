import { useRouter } from 'next/router'
import { CreatorAnchorTile } from '@/components/creator/creator-anchor-tile'
import { CreatorHeader } from '@/components/creator/creator-shell'
import type { CreatorSocialAccount } from '@/components/creator/types'

export default function AnchorPreview() {
  const { query } = useRouter()
  const account = {
    id: 'anchor-preview', platform: query.platform === 'instagram' ? 'instagram' : 'tiktok', handle: 'youraccount',
    followers: { source: 'manual', count: Number(query.followers || 5000), checkedAt: '2026-10-24T20:00:00Z' },
    tiktokAnchorJoinedAt: query.joined ? '2026-10-24T20:00:00Z' : null,
  } as CreatorSocialAccount
  return <main className="creator-portal min-h-screen bg-white px-5 py-10 sm:px-12"><div className="mx-auto max-w-4xl"><CreatorHeader eyebrow="Overview" title="Good to see you, Alex" description="Your next step, reviews, and earnings." /><CreatorAnchorTile accounts={[account]} onAccountSaved={async () => undefined} /><p className="text-xs text-zinc-400">Private design preview · example account</p></div></main>
}
export function getServerSideProps() {
  return process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} }
}
