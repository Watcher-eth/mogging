import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { Clock3, ArrowRight, Loader2, Wallet } from 'lucide-react'
import useSWR from 'swr'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { StudioTabs, StudioTabContent } from '@/components/creator/studio-tabs'
import { PayoutInformation } from '@/components/creator/payout-information-form'
import type { CreatorDashboard } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import {
  creatorMoneySummary,
  creatorUnpaidCents,
  hasCreatorPayoutMethod,
} from '@/lib/creator/money'
import { sprintMoney, sprintViews } from '@/lib/creator/sprints'
import { cn } from '@/lib/utils'
const tabs = [
  { value: 'wallet', label: 'Wallet' },
  { value: 'cashouts', label: 'Cashouts' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'methods', label: 'Payout methods' },
]
export default function MoneyPage() {
  return (
    <CreatorShell>
      <MoneyContent />
    </CreatorShell>
  )
}
function MoneyContent() {
  const router = useRouter()
  const { data: session } = useSession()
  const { data, isLoading, error, mutate } = useSWR<CreatorDashboard>(
    '/api/creator',
    apiGet,
  )
  const tab = tabs.some((item) => item.value === router.query.tab)
    ? String(router.query.tab)
    : 'wallet'
  const change = (value: string) => {
    void router.replace(
      {
        pathname: '/creator/money',
        query: value === 'wallet' ? {} : { tab: value },
      },
      undefined,
      { shallow: true },
    )
  }
  if (isLoading) return <Loader2 className="mx-auto my-16 animate-spin" />
  if (!data || error)
    return (
      <p role="alert">
        Could not load Money.{' '}
        <button className="text-[#00A8EF]" onClick={() => void mutate()}>
          Try again
        </button>
      </p>
    )
  const { cashouts, earnings, balanceCents, totalPaidCents, pendingReview } =
    creatorMoneySummary(data.submissions, data.payments)
  const ready = hasCreatorPayoutMethod(data.profile)
  return (
    <>
      <CreatorHeader
        eyebrow="Earnings & payments"
        title="Money"
        description="Your reviewed earnings, completed cashouts and payout methods."
        titleAccessory={
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00A8EF] px-3 py-1.5 text-xs font-medium text-white">
            <Clock3 className="size-3.5" />
            3–5 Days
          </span>
        }
      />
      <StudioTabs value={tab} onChange={change} items={tabs}>
        <StudioTabContent value="wallet">
          <section className="creator-surface overflow-hidden">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-zinc-500">
                Reviewed balance
              </p>
              <p
                aria-label={
                  ready
                    ? `Balance ${sprintMoney(balanceCents)}`
                    : 'Select a payout method to view your balance'
                }
                className={cn(
                  'mt-2 text-5xl font-semibold tracking-[-0.05em] tabular-nums sm:text-6xl',
                  !ready && 'select-none blur-md',
                )}
                aria-hidden={!ready}
              >
                {sprintMoney(balanceCents)}
              </p>
              {!ready ? (
                <button
                  onClick={() => change('methods')}
                  className="mt-5 flex items-center gap-2 text-sm font-medium text-[#00A8EF]"
                >
                  Connect a payout method
                  <ArrowRight className="size-4" />
                </button>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  Payout method saved. Eligible payments typically take 3–5 days to process after approval.
                </p>
              )}
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                <span className="text-zinc-500">
                  {earnings.length} reviewed posts awaiting payment
                </span>
                <span className="text-zinc-500">
                  {pendingReview} posts in review
                </span>
                <button
                  className="ml-auto text-[#00A8EF]"
                  onClick={() => change('earnings')}
                >
                  View breakdown →
                </button>
              </div>
            </div>
            <div className="border-t border-zinc-100 p-6 sm:p-8">
              <div className="mb-4 flex justify-between text-sm">
                <h2 className="font-semibold">Cashout history</h2>
                <span className="text-zinc-500">
                  {sprintMoney(totalPaidCents)} total paid
                </span>
              </div>
              {cashouts.length ? (
                cashouts.slice(0, 5).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex justify-between gap-3 border-t border-zinc-100 py-3 text-sm"
                  >
                    <span className="text-zinc-500">
                      {data.submissions.find(
                        (item) => item.id === payment.submissionId,
                      )?.title || 'Creator payout'}
                    </span>
                    <strong>{sprintMoney(payment.amountCents)}</strong>
                  </div>
                ))
              ) : (
                <p className="rounded-xl bg-[#f5f6f7] p-4 text-sm text-zinc-500">
                  No payout history yet.
                </p>
              )}
            </div>
          </section>
        </StudioTabContent>
        <StudioTabContent value="cashouts">
          {cashouts.length ? (
            <div className="grid gap-3">
              {cashouts.map((payment) => {
                const submission = data.submissions.find(
                  (item) => item.id === payment.submissionId,
                )
                return (
                  <article
                    key={payment.id}
                    className="creator-surface flex flex-wrap items-center gap-4 p-5"
                  >
                    <Wallet className="size-8 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">
                        {submission?.title || 'Creator payout'}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        {payment.paymentOption === 'paypal'
                          ? 'PayPal'
                          : 'Crypto'}
                        {payment.paidAt
                          ? ` · ${new Date(payment.paidAt).toLocaleDateString()}`
                          : ''}
                      </p>
                      {submission?.postUrl ? (
                        <a
                          href={submission.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-[#00A8EF]"
                        >
                          View video ↗
                        </a>
                      ) : null}
                    </div>
                    <strong className="text-lg tabular-nums">
                      {sprintMoney(payment.amountCents)}
                    </strong>
                    <span className="rounded-lg bg-[#29CE53] px-3 py-1 text-xs text-white">
                      Sent
                    </span>
                  </article>
                )
              })}
            </div>
          ) : (
            <Empty
              title="No cashouts yet"
              description="Completed payments for your approved videos will appear here."
            />
          )}
        </StudioTabContent>
        <StudioTabContent value="earnings">
          {earnings.length ? (
            <div className="grid gap-3">
              {earnings.map((submission) => {
                const payment = data.payments.find(
                  (item) => item.submissionId === submission.id && item.status !== 'paid' && item.status !== 'cancelled',
                )
                return (
                  <article key={submission.id} className="creator-surface p-5">
                    <div className="flex justify-between gap-4">
                      <div>
                        <h2 className="font-semibold">{submission.title}</h2>
                        <p className="mt-1 text-xs text-zinc-500">
                          {submission.platform} ·{' '}
                          {sprintViews(submission.adminViewCountThreshold || 0)}{' '}
                          verified views
                        </p>
                      </div>
                      <strong className="text-lg tabular-nums">
                        {sprintMoney(creatorUnpaidCents(submission, data.payments))}
                      </strong>
                    </div>
                    <div className="mt-4 flex justify-between border-t border-zinc-100 pt-4 text-xs">
                      <span className="rounded-lg bg-[#f5f6f7] px-3 py-1 text-zinc-600">
                        {payment
                          ? payment.status === 'processing'
                            ? 'Processing'
                            : payment.status === 'failed'
                              ? 'Payment failed · team reviewing'
                              : payment.status === 'cancelled'
                                ? 'Payment cancelled · contact support'
                                : 'Payment scheduled'
                          : 'Approved · awaiting payment'}
                      </span>
                      {submission.postUrl ? (
                        <a
                          href={submission.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#00A8EF]"
                        >
                          View video ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <Empty
              title="No reviewed earnings yet"
              description="Eligible, approved videos will appear here until their payments are sent."
            />
          )}
        </StudioTabContent>
        <StudioTabContent value="methods">
          <PayoutInformation
            email={session?.user?.email || ''}
            onSaved={async () => {
              await mutate()
              change('wallet')
            }}
          />
        </StudioTabContent>
      </StudioTabs>
    </>
  )
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="creator-surface grid min-h-56 place-items-center p-8 text-center">
      <div>
        <Wallet className="mx-auto mb-4 size-9" />
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
        <Link
          href="/creator/sprints"
          className="mt-5 inline-block text-sm text-[#00A8EF]"
        >
          Explore campaigns →
        </Link>
      </div>
    </div>
  )
}
