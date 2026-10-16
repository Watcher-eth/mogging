import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Check, Info, Loader2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { CreatorDashboard } from './types'
import { apiPatch, apiPost } from '@/lib/api/client'
import { creatorBundlePlan, hasCreatorPayoutMethod } from '@/lib/creator/money'

export function BundledPayoutControls({ data, onSaved }: { data: CreatorDashboard; onSaved: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const enabled = Boolean(data.profile?.bundledPayouts)
  const request = data.payoutRequests?.find(item => item.status === 'pending')
  const { amountCents } = creatorBundlePlan(data.submissions, data.payments)
  const ready = hasCreatorPayoutMethod(data.profile) && data.profile?.authStatus === 'verified'

  async function act(action: 'preference' | 'request', checked?: boolean) {
    if (busy) return
    setBusy(true)
    try {
      if (action === 'preference') await apiPatch('/api/creator/payouts', { bundledPayouts: checked })
      else await apiPost('/api/creator/payouts', { expectedAmountCents: amountCents })
      await onSaved()
      toast.success(action === 'request' ? 'Payout requested. Our team will send one combined transfer.' : 'Payout preference saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your payout')
      await onSaved().catch(() => undefined)
    } finally { setBusy(false) }
  }

  if (!data.profile) return null
  return <section aria-label="Payout preference" className="mt-6 border-t border-zinc-100 pt-5">
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 px-4">
      <label className="flex min-h-16 flex-1 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={enabled} disabled={busy || Boolean(request)} onChange={event => void act('preference', event.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[7px] border-2 border-[#c7c7cc] bg-white text-transparent transition-colors peer-checked:border-[#00A8EF] peer-checked:bg-[#00A8EF] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#00A8EF] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"><Check className="size-4" strokeWidth={3} /></span>
        I want bundled payouts.
      </label>
      <BundledPayoutInfo />
    </div>
    {enabled ? <div className="mt-5">
      {request ? <p role="status" className="text-sm leading-6 text-zinc-500">Your request is with our team. New earnings go toward your next bundle.</p> : <>
        <Button className="h-12 w-full rounded-xl" onClick={() => void act('request')} disabled={busy || !ready || !amountCents}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}Pay me now</Button>
        <p className="mt-3 text-xs leading-5 text-zinc-500">{!ready ? 'Your payout method needs approval before you can request payment.' : amountCents ? 'One combined transfer. Usually paid within 3–5 days.' : 'Approved earnings will be available to request here.'}</p>
      </>}
    </div> : <p className="mt-3 text-xs leading-5 text-zinc-500">Payments are sent separately, usually within 3–5 days of approval.</p>}
  </section>
}

function BundledPayoutInfo() {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const id = useId()
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 340, damping: 32 }
  return <Dialog.Root open={open} onOpenChange={setOpen}><LayoutGroup id={id}>
    <Dialog.Trigger asChild><motion.button type="button" aria-label="About bundled payouts" layoutId={reduceMotion ? undefined : 'payout-info'} transition={transition} style={{ borderRadius: 999 }} className="grid size-11 shrink-0 place-items-center text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]"><Info className="size-4" /></motion.button></Dialog.Trigger>
    <Dialog.Portal forceMount><AnimatePresence>{open ? <>
      <Dialog.Overlay forceMount asChild><motion.div className="fixed inset-0 z-50 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} /></Dialog.Overlay>
      <Dialog.Content forceMount asChild><motion.section layoutId={reduceMotion ? undefined : 'payout-info'} transition={transition} style={{ borderRadius: 24 }} className="fixed left-[max(16px,calc(50vw-210px))] top-[max(16px,calc(50dvh-220px))] z-50 max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto border border-zinc-200 bg-white p-6 shadow-xl outline-none">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }}>
          <Dialog.Title className="pr-8 text-lg font-semibold">Your earnings. Your timing.</Dialog.Title>
          <Dialog.Close aria-label="Close bundled payouts information" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="size-4" /></Dialog.Close>
          <Dialog.Description className="mt-3 text-sm leading-6 text-zinc-500">Bundled payouts let you choose when to get paid. Keep your approved video earnings together, then request one combined transfer instead of several smaller payouts.</Dialog.Description>
          <ol className="my-5 space-y-3 text-sm"><li><strong>1. Keep creating.</strong> Your reviewed earnings build up in Money.</li><li><strong>2. Tap Pay me now.</strong> We receive one request with the full amount owed.</li><li><strong>3. Get one payout.</strong> Combining transfers helps reduce repeated payout fees.</li></ol>
          <p className="border-t border-zinc-100 pt-4 text-xs leading-5 text-zinc-500">If a video reaches a new milestone, only the increase is added. Anything already paid or processing is excluded. Bundling does not change your earnings or eliminate provider and currency conversion fees.</p>
        </motion.div>
      </motion.section></Dialog.Content>
    </> : null}</AnimatePresence></Dialog.Portal>
  </LayoutGroup></Dialog.Root>
}
