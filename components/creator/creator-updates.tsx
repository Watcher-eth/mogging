import Link from 'next/link'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { ArrowUpRight, Check, RotateCcw, Upload, X } from 'lucide-react'
import type { CreatorDashboard, CreatorSubmission } from './types'
import { SubmissionPostPreview, useSubmissionPostPreview } from './submission-post-preview'
import { creatorActivity, creatorUpdateAge, creatorUpdateLabels, type CreatorUpdateType } from '@/lib/creator/updates'

import styles from './creator-updates.module.css'

const currentLabels: Partial<Record<CreatorUpdateType, string>> = { in_review: 'Post in review', approved: 'Post approved', rejected: 'Post needs changes' }

export function CreatorUpdates({ data }: { data: CreatorDashboard }) {
  const updates = creatorActivity(data.updates || [], data.submissions, data.payments).slice(0, 8)
  return (
    <section aria-label="Updates" className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Updates</h2>
        {updates.length ? <Link href="/creator/submissions" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[#008bc6]">View submissions<ArrowUpRight className="size-3.5" /></Link> : null}
      </div>
      <CampaignAnnouncement />
      {updates.length ? <ul className="mt-3 divide-y divide-zinc-100">
        {updates.map(update => {
          const posts = (update.submissionIds || [update.submissionId]).flatMap(id => data.submissions.find(post => post.id === id) || [])
          return <li key={update.id}>
            <Link href={`/creator/submissions?submission=${encodeURIComponent(update.submissionId)}`} className={styles.row}>
              <span className={styles.stack} aria-hidden="true">
                {posts.slice(0, 3).reverse().map((post, index, stack) => <UpdatePostPreview key={post.id} post={post} type={update.type} offset={stack.length - index - 1} />)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-5 text-zinc-900" title={posts.map(post => post.caption || post.title).join(', ') || update.title}>{posts.length > 1 && update.type === 'submitted' ? `${posts.length} posts submitted` : update.snapshot ? currentLabels[update.type] : creatorUpdateLabels[update.type]}: <span className="font-normal text-zinc-600">{posts.map(post => post.caption || post.title).join(', ') || update.title}</span></span>
                {posts.length > 1 ? <span className="mt-1 block text-xs text-zinc-500">{posts.length} posts {update.type === 'paid' ? 'in this payout' : 'submitted together'}</span> : null}
                {update.note ? <span className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-zinc-600">{update.note}</span> : null}
              </span>
              {update.snapshot ? <span className="shrink-0 pt-0.5 text-right text-[10px] font-medium text-zinc-400">Current status</span> : <time dateTime={update.createdAt} title={new Date(update.createdAt).toLocaleString()} className="shrink-0 pt-0.5 text-right text-[11px] leading-5 text-zinc-400">{creatorUpdateAge(update.createdAt)}</time>}
            </Link>
          </li>
        })}
      </ul> : <p className="mt-3 text-sm leading-6 text-zinc-500">Your reviews, approvals, and payouts will appear here after you submit a post.</p>}
    </section>
  )
}


function UpdatePostPreview({ post, offset, type }: { post: CreatorSubmission; offset: number; type: CreatorUpdateType }) {
  const { ref, preview } = useSubmissionPostPreview<HTMLSpanElement>(post)
  const ratio = preview?.width && preview?.height ? preview.width / preview.height : 9 / 16
  return <span ref={ref} className={styles.card} style={{ '--index': offset } as CSSProperties}>
    <SubmissionPostPreview preview={preview} videoUrl={post.videoUrl} platform={post.platform} showPlatform={false} className="rounded-lg" style={{ width: Math.min(64 * ratio, 60), aspectRatio: ratio }} />
    {offset === 0 ? <UpdateStatus type={type} /> : null}
  </span>
}

function UpdateStatus({ type }: { type: CreatorUpdateType }) {
  const Icon = type === 'rereview_requested' ? RotateCcw : type === 'approved' || type === 'paid' ? Check : type === 'rejected' ? X : Upload
  const color = type === 'rereview_requested' ? 'bg-emerald-500' : type === 'approved' || type === 'paid' ? 'bg-[#00a8ef]' : type === 'rejected' ? 'bg-red-500' : 'bg-zinc-500'
  return <span className={`absolute -bottom-1 -right-2 grid size-5 place-items-center rounded-full text-white ring-2 ring-white ${color}`}><Icon className="size-3" strokeWidth={2.5} /></span>
}


function CampaignAnnouncement() {
  return <Link href="/creator/sprints" className={`${styles.row} ${styles.announcement}`}>
    <span className={styles.art} aria-hidden="true">
      <Image src="/creator-guide/live-activity-portrait.png" alt="" width={48} height={64} />
      {[0, 1, 2].map(index => <span key={index} className={styles.coin}>$</span>)}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-semibold leading-5 text-zinc-900">3 new campaigns and bonuses are live</span>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">Find your format. Create your next post. Earn more.</span>
    </span>
    <time dateTime="2026-10-23T19:00:00Z" title="October 23, 2026" className="shrink-0 text-right text-[11px] leading-5 text-zinc-400">{creatorUpdateAge('2026-10-23T19:00:00Z')}</time>
  </Link>
}
