import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import useSWR from 'swr'
import { Check, Copy, Link2, Loader2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api/client'
import { sprintMoney } from '@/lib/creator/sprints'
import type { CreatorReferralReport } from '@/lib/creator/creator-referral-policy'

function InviteLink({ report }: { report: CreatorReferralReport }) {
  const [copied, setCopied] = useState(false)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])
  async function copy() {
    try { await navigator.clipboard.writeText(report.inviteUrl); setCopied(true); toast.success('Creator invite link copied') }
    catch { toast.error('Could not copy. Select and copy your link below.') }
  }
  return <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 p-3">
    <Link2 className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
    <span className="min-w-0 flex-1 select-all break-all text-xs leading-5 text-zinc-600" aria-label="Your personal creator invite link">{report.inviteUrl}</span>
    <motion.button type="button" aria-label="Copy creator invite link" onClick={() => void copy()} whileHover={reduced ? undefined : { scale: .94 }} whileTap={reduced ? undefined : { scale: .88 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }} className="relative grid size-10 shrink-0 place-items-center rounded-full bg-zinc-950 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a8ef]">
      <AnimatePresence initial={false} mode="sync">
        <motion.span key={copied ? 'copied' : 'copy'} className="absolute grid place-items-center" initial={{ opacity: 0, scale: reduced ? 1 : .75, rotate: reduced ? 0 : -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: reduced ? 1 : .75, rotate: reduced ? 0 : 12 }} transition={{ duration: reduced ? 0 : .18, ease: [.23, 1, .32, 1] }} aria-hidden="true">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</motion.span>
      </AnimatePresence>
    </motion.button>
  </div>
}

function ReferralReportState({ loading, error, retry }: { loading: boolean; error: unknown; retry: () => void }) {
  if (loading) return <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="size-4 animate-spin" />Loading creator referrals</p>
  return error ? <p role="alert" className="mt-5 text-xs text-zinc-500">Could not load creator referrals. <button type="button" onClick={retry} className="underline underline-offset-4">Try again</button></p> : null
}

export function InviteCreators() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const reduced = useReducedMotion()
  const transition = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 340, damping: 32 }
  const { data, error, isLoading, mutate } = useSWR<CreatorReferralReport>(open ? '/api/creator/referrals' : null, apiGet)
  return <Dialog.Root open={open} onOpenChange={setOpen}><LayoutGroup id={id}>
    <Dialog.Trigger asChild>
      <motion.button layoutId={reduced ? undefined : 'invite-panel'} transition={transition} style={{ borderRadius: 999 }} className="inline-flex min-h-9 items-center gap-1.5 bg-[#00a8ef] px-3 text-[11px] font-medium normal-case tracking-normal text-white transition-colors hover:bg-[#0099db] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00a8ef]">
        <Users className="size-3.5" aria-hidden="true" /><motion.span layoutId={reduced ? undefined : 'invite-label'}>Invite Creators</motion.span>
      </motion.button>
    </Dialog.Trigger>
    <Dialog.Portal forceMount><AnimatePresence>{open ? <>
      <Dialog.Overlay asChild forceMount><motion.div className="fixed inset-0 z-50 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .15 }} /></Dialog.Overlay>
      <Dialog.Content asChild forceMount>
        <motion.section data-creator-controls layoutId={reduced ? undefined : 'invite-panel'} transition={transition} style={{ borderRadius: 28 }} className="fixed left-[max(16px,calc(50vw-220px))] top-[max(16px,calc(50dvh-250px))] z-50 max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] overflow-y-auto border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl outline-none sm:p-8">
          <Dialog.Title asChild><motion.h2 layoutId={reduced ? undefined : 'invite-label'} className="text-sm font-medium">Invite Creators</motion.h2></Dialog.Title>
          <Dialog.Close aria-label="Close creator referrals" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="size-4" /></Dialog.Close>
          <p className="mt-8 text-6xl font-semibold tracking-tighter text-[#00a8ef]">5% <span className="text-lg font-medium tracking-normal text-zinc-900">extra for you.</span></p>
          <Dialog.Description className="mt-3 text-sm leading-6 text-zinc-500">Invite a new creator. Earn 5% of their normal post payouts on their first five approved videos. They keep their full earnings.</Dialog.Description>
          <ol className="mt-6 space-y-3 text-[13px] leading-5">
            <li><span className="mr-2 text-zinc-400">01</span>Share your personal invite link before they join.</li>
            <li><span className="mr-2 text-zinc-400">02</span>They join, submit videos, and get approved.</li>
            <li><span className="mr-2 text-zinc-400">03</span>Your bonus is added automatically after they’re paid.</li>
          </ol>
          {data ? <InviteLink report={data} /> : <ReferralReportState loading={isLoading} error={error} retry={() => void mutate()} />}
          <p className="mt-4 text-[11px] leading-5 text-zinc-400">New creators only. The first invite link is remembered for 30 days on that browser. Bonuses are excluded from the 5%; rereviews don’t count as extra videos.</p>
        </motion.section>
      </Dialog.Content>
    </> : null}</AnimatePresence></Dialog.Portal>
  </LayoutGroup></Dialog.Root>
}

export function CreatorReferralsSection() {
  const { data, error, isLoading, mutate } = useSWR<CreatorReferralReport>('/api/creator/referrals', apiGet)
  return <section aria-label="Creator referrals" className="mt-10 border-t border-zinc-200 pt-8">
    <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Creator referrals</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Earn 5% of normal payouts on each invited creator’s first five approved videos.</p></div><InviteCreators /></div>
    <ReferralReportState loading={isLoading} error={error} retry={() => void mutate()} />
    {data ? <>
      <dl className="my-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[['Creators invited', String(data.invited)], ['Referral bonuses', sprintMoney(data.earnedCents)], ['Paid to you', sprintMoney(data.paidCents)], ['Outstanding', sprintMoney(data.outstandingCents)]].map(([label, value]) => <div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-2 text-2xl font-medium tabular-nums tracking-tight">{value}</dd></div>)}
      </dl>
      {data.referrals.length ? <ul className="divide-y divide-zinc-100">{data.referrals.map(referral => <li key={referral.id} className="flex items-center gap-3 py-4"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{referral.name}</span><span className="mt-1 block text-xs text-zinc-500">{referral.approvedVideos}/5 videos approved{referral.status === 'on_hold' ? ' · Eligibility under review' : ''}</span></span><span className="text-sm font-medium tabular-nums">{sprintMoney(referral.earnedCents)}</span></li>)}</ul> : <p className="text-sm leading-6 text-zinc-500">Your invited creators and their referral bonuses will appear here.</p>}
    </> : null}
  </section>
}
