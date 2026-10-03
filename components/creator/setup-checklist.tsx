import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react'
import { Check, ChevronRight, ChevronUp, X } from 'lucide-react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import type { CreatorDashboard } from './types'

export function CreatorSetupChecklist() {
  const [expanded, setExpanded] = useState(false)
  const reduceMotion = useReducedMotion()
  const motionId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasExpanded = useRef(false)
  useEffect(() => {
    if (expanded) closeRef.current?.focus({ preventScroll: true })
    else if (wasExpanded.current)
      triggerRef.current?.focus({ preventScroll: true })
    wasExpanded.current = expanded
  }, [expanded])
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 32 }
  const { data } = useSWR<CreatorDashboard>('/api/creator', apiGet, {
    refreshInterval: 30_000,
  })
  if (!data) return null

  const profile = data.profile
  const tasks = [
    {
      title: 'Connect a social account',
      description: 'Add the TikTok or Instagram account you publish from.',
      href: '/creator/accounts',
      complete: data.socialAccounts.length > 0,
    },
    {
      title: 'Add payout information',
      description: 'Choose PayPal or crypto for your earnings.',
      href: '/creator/money?tab=methods',
      complete: Boolean(
        profile &&
        (profile.paymentOption === 'paypal'
          ? profile.paypalEmail
          : profile.cryptoNetwork && profile.cryptoWalletAddress),
      ),
    },
    {
      title: 'Submit your first video',
      description:
        'Choose a campaign and submit your post with analytics evidence.',
      href: '/creator/submit',
      complete: data.submissions.length > 0,
    },
  ]
  const completed = tasks.filter((task) => task.complete).length
  if (completed === tasks.length) return null
  const progress = completed / tasks.length

  return (
    <aside
      aria-label="Creator setup"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setExpanded(false)
      }}
      className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] right-4 z-40 sm:bottom-6 sm:right-6"
    >
      <LayoutGroup id={motionId}>
        <motion.div
          layout={!reduceMotion}
          initial={false}
          transition={transition}
          style={{ borderRadius: expanded ? 20 : 24 }}
          className="relative border border-[#eceef0] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.10)]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {expanded ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.14 }}
              >
                <section
                  id="creator-setup-checklist"
                  className="max-h-[calc(100dvh-32px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <motion.h2
                      layoutId="setup-label"
                      layout="position"
                      transition={transition}
                      className="text-sm font-semibold"
                    >
                      Get started
                    </motion.h2>
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      ref={closeRef}
                      aria-label="Collapse setup checklist"
                      className="-mr-2 grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {completed} of {tasks.length} complete
                  </p>
                  <div
                    role="progressbar"
                    aria-label="Setup progress"
                    aria-valuemin={0}
                    aria-valuemax={tasks.length}
                    aria-valuenow={completed}
                    className="mt-4 h-1 overflow-hidden rounded-full bg-[#eceef0]"
                  >
                    <div
                      className="h-full origin-left rounded-full bg-[#00A8EF] transition-transform duration-300 motion-reduce:transition-none"
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  </div>
                  <ul className="mt-3">
                    {tasks.map((task) => (
                      <li key={task.href}>
                        <Link
                          href={task.href}
                          onClick={() => setExpanded(false)}
                          className="group -mx-2 flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-[#f7f8f9]"
                        >
                          <span
                            className={cn(
                              'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                              task.complete
                                ? 'bg-[#00A8EF] text-white'
                                : 'border-2 border-[#e8ebee]',
                            )}
                          >
                            {task.complete ? (
                              <Check className="size-3" aria-hidden="true" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block text-sm font-medium',
                                task.complete && 'text-zinc-400 line-through',
                              )}
                            >
                              {task.title}
                              <span className="sr-only">
                                {task.complete ? ', complete' : ', incomplete'}
                              </span>
                            </span>
                            {!task.complete ? (
                              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                                {task.description}
                              </span>
                            ) : null}
                          </span>
                          {!task.complete ? (
                            <ChevronRight className="mt-1 size-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#00A8EF]" />
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.12 }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  ref={triggerRef}
                  aria-expanded={expanded}
                  aria-controls="creator-setup-checklist"
                  className="flex min-h-11 items-center gap-2.5 rounded-[24px] px-4 py-2.5 text-sm font-medium hover:bg-[#f7f8f9]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5 -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="#eceef0"
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="#00A8EF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      pathLength="1"
                      strokeDasharray={`${progress} 1`}
                    />
                  </svg>
                  <motion.span
                    layoutId="setup-label"
                    layout="position"
                    transition={transition}
                  >
                    Get started
                  </motion.span>
                  <span className="-ml-1">
                    · {completed}/{tasks.length}
                  </span>
                  <ChevronUp className="size-3.5 text-zinc-400" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </aside>
  )
}
