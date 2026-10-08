import { CreatorEssentials } from '@/components/creator/creator-essentials'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowRight, Plus } from 'lucide-react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import type { CreatorDashboard } from '@/components/creator/types'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { Button } from '@/components/ui/button'
const SubmissionDialog = dynamic(
  () =>
    import('@/components/creator/submission-dialog').then(
      (module) => module.SubmissionDialog,
    ),
  { ssr: false },
)
export default function SubmitPage() {
  return (
    <CreatorShell>
      <SubmitContent />
    </CreatorShell>
  )
}
function SubmitContent() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data, error, isLoading, mutate } = useSWR<CreatorDashboard>(
    '/api/creator',
    apiGet,
    { refreshInterval: 30_000 },
  )
  return (
    <>
      <CreatorHeader
        eyebrow="Creator videos"
        title="Submit a video"
        description="Choose a campaign, follow its brief and submit your published post with analytics evidence."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            New submission
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="text-sm text-zinc-500">
          Could not load submissions.{' '}
          <button
            type="button"
            className="text-[#00A8EF]"
            onClick={() => void mutate()}
          >
            Try again
          </button>
        </p>
      ) : data?.submissions.length ? (
        <ul className="grid gap-3" aria-label="Your submissions">
          {data.submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href="/creator/submissions"
                className="creator-surface group flex items-center gap-4 p-5"
              >
                <CreatorIcon
                  name="video-submissions"
                  className="size-8 text-zinc-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {submission.title}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {submission.platform} ·{' '}
                    {new Date(submission.createdAt).toLocaleDateString(
                      'en-US',
                      { month: 'short', day: 'numeric' },
                    )}
                  </span>
                </span>
                <span className="rounded-[12px] bg-[#f5f6f7] px-3 py-1 text-xs font-medium capitalize text-zinc-600">
                  {submission.status.replace('_', ' ')}
                </span>
                <ArrowRight className="size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00A8EF]" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div
          aria-label={isLoading ? 'Loading submissions' : 'No submissions yet'}
        >
          <p className="sr-only">
            {isLoading
              ? 'Loading submissions.'
              : 'Your submissions will appear here after you submit your first video.'}
          </p>
          <div className="grid gap-3" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="creator-surface flex items-center gap-4 p-5"
              >
                <div
                  className="size-11 shrink-0 animate-pulse rounded-xl bg-[#eef0f2] motion-reduce:animate-none"
                  style={{ animationDelay: `${row * 180}ms` }}
                />
                <div className="flex-1 space-y-3">
                  <div
                    className="h-3 w-2/5 animate-pulse rounded-full bg-[#eef0f2] motion-reduce:animate-none"
                    style={{ animationDelay: `${row * 180}ms` }}
                  />
                  <div
                    className="h-2.5 w-1/4 animate-pulse rounded-full bg-[#f5f6f7] motion-reduce:animate-none"
                    style={{ animationDelay: `${row * 180}ms` }}
                  />
                </div>
                <div
                  className="h-6 w-16 animate-pulse rounded-full bg-[#f5f6f7] motion-reduce:animate-none"
                  style={{ animationDelay: `${row * 180}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 flex justify-center">
        <Button asChild variant="outline" className="rounded-[24px] px-5">
          <Link href="/creator/sprints">
            Explore campaigns
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="mt-8"><CreatorEssentials /></div>
      {open ? (
        <SubmissionDialog
          open
          onOpenChange={setOpen}
          initialSprintId={
            typeof router.query.sprint === 'string'
              ? router.query.sprint
              : undefined
          }
          onSubmitted={async () => {
            await router.push('/creator/submissions')
          }}
        />
      ) : null}
    </>
  )
}
