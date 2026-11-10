import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Check, CircleAlert, Loader2, ShieldCheck } from '@/components/ui/mogging-glyphs'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'
import { apiGet, apiPost } from '@/lib/api/client'
import { sprintMoney } from '@/lib/creator/sprints'
import { payoutNetworks } from '@/lib/admin/crypto-payouts/shared'
import type { payoutQueue, prepareCryptoBatch, publicBatch } from '@/lib/admin/crypto-payouts/queue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Network = Awaited<ReturnType<typeof payoutQueue>>[number]
type Batch = ReturnType<typeof publicBatch>
type Prepared = Awaited<ReturnType<typeof prepareCryptoBatch>>
const endpoint = '/api/admin/creator/crypto-payouts'
const running = (batch?: Batch | null) => batch?.status === 'prepared' || batch?.status === 'submitted'
const batchUrl = (id: string) => `${endpoint}?id=${id}`
const actionFor = (action: 'cancel' | 'reconcile' | 'begin-evm', id: string) => apiPost<Batch>(endpoint, { action, id })
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not check this payout batch.'

async function checkBatch(url: string) {
  const batch = await apiGet<Batch>(url)
  if (batch.status !== 'submitted') return batch
  const reconciled = await actionFor('reconcile', batch.id)
  const { chain } = reconciled
  if (reconciled.status === 'submitted' && chain !== 'solana' && !reconciled.hashes.length) {
    // The wallet can supply an early hint. Server reconciliation also searches the chain.
    const hashes = await import('@/lib/admin/crypto-payouts/browser')
      .then(client => client.findEvmHashes(batch.id, chain)).catch(() => [])
    if (hashes.length) return apiPost<Batch>(endpoint, { action: 'attach-evm', id: batch.id, hashes })
  }
  return reconciled
}

export default function CryptoPayoutQueue({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { data, error, mutate } = useSWR<{ networks: Network[] }>(endpoint, apiGet, {
    refreshInterval: current => current?.networks.some(item => item.active) ? 12_000 : 0,
  })
  const [review, setReview] = useState<Network | null>(null)
  const [tracking, setTracking] = useState<Batch | null>(null)
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const inFlight = useRef(false)
  const notifiedBatch = useRef<string | null>(null)
  const { data: tracked, error: trackingError, mutate: refreshTracking } = useSWR(
    tracking ? batchUrl(tracking.id) : null,
    busy ? apiGet<Batch> : checkBatch,
    {
      refreshInterval: current => !busy && running(current ?? tracking) ? 5_000 : 0,
      shouldRetryOnError: false,
      refreshWhenOffline: false,
    },
  )
  const batch = tracked ?? tracking

  useEffect(() => {
    if (!batch || !running(tracking) || running(batch) || notifiedBatch.current === batch.id) return
    notifiedBatch.current = batch.id
    void Promise.allSettled([mutate(), onRefresh()])
  }, [batch, tracking, mutate, onRefresh])

  function close() {
    if (inFlight.current) return
    setReview(null)
    setTracking(null)
    setProblem('')
  }

  async function run(label: string, action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(label)
    setProblem('')
    try { await action() }
    catch (error) { setProblem(errorMessage(error)) }
    finally {
      inFlight.current = false
      setBusy('')
      void mutate()
    }
  }

  async function approve(network: Network) {
    if (!network.sender || !network.preview) return
    const client = await import('@/lib/admin/crypto-payouts/browser')
    const wallet = await client.connectPayoutWallet(network.chain, network.sender)
    const prepared = await apiPost<Prepared>(endpoint, { action: 'prepare', chain: network.chain, preview: network.preview })
    setBusy('Approve in your wallet…')
    try {
      if (wallet.chain === 'solana') {
        const signed = await client.signSolanaBatch(prepared, wallet.wallet)
        const result = await apiPost<Batch>(endpoint, { action: 'submit-solana', id: prepared.id, signed })
        setTracking(result)
        if (!running(result)) void onRefresh().catch(() => undefined)
      } else {
        setTracking(await actionFor('begin-evm', prepared.id))
        await client.sendEvmBatch(prepared, wallet.wallet)
      }
      setReview(null)
    } catch (error) {
      // Cancellation is conditional on the reservation still being unsent.
      const saved = await actionFor('cancel', prepared.id).catch(() => apiGet<Batch>(batchUrl(prepared.id)).catch(() => null))
      if (!saved || saved.status !== 'failed') {
        setTracking(saved ?? prepared)
        setReview(null)
        if (error && typeof error === 'object' && 'code' in error && error.code === 4001) {
          throw Error('Wallet approval was declined. The server will keep the batch reserved until it can verify the outcome.')
        }
        throw Error('The batch is reserved while we verify its outcome. Check your wallet activity here before taking any further action.')
      }
      throw error
    }
  }

  function updateTracking(result: Batch) {
    setTracking(result)
    void refreshTracking(result, { revalidate: false })
    if (!running(result)) {
      notifiedBatch.current = result.id
      void onRefresh().catch(() => undefined)
    }
  }

  return <section aria-label="Batch crypto payouts" className="mb-7 rounded-2xl border border-zinc-200 bg-white p-5">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-700" aria-hidden="true" /><h2 className="text-base font-semibold">Pay crypto in batches</h2></div>
    <p className="mt-2 text-sm text-zinc-600">Review each network, approve once in your treasury wallet, and track final confirmation here.</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">Could not load crypto payouts. <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p>}
    {!data && !error && <p role="status" className="mt-4 text-sm text-zinc-500">Loading crypto payouts…</p>}
    <div className="mt-4 divide-y divide-zinc-100">
      {data?.networks.map(network => {
        const { active, latest } = network
        const total = network.recipients.reduce((sum, recipient) => sum + recipient.amountCents, 0)
        return <div key={network.chain} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <h3 className="text-sm font-semibold">USDC on {payoutNetworks[network.chain].label}</h3>
            <p className="mt-1 text-xs text-zinc-500">{active ? `${sprintMoney(active.amountCents)} · ${active.status === 'prepared' ? 'Reserved for approval' : 'Awaiting final confirmation'}`
              : !network.sender ? 'Treasury wallet setup required' : `${sprintMoney(total)} ready · ${network.recipients.length} wallets`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {latest && <Button size="sm" variant="outline" onClick={() => { setProblem(''); setTracking(latest) }}>{active ? 'Track batch' : 'Last batch'}</Button>}
            {!active && <Button size="sm" disabled={!total} onClick={() => { setProblem(''); setReview(network) }}>Review all · {sprintMoney(total)}</Button>}
          </div>
        </div>
      })}
    </div>
    <Dialog open={Boolean(review || batch)} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[530px] overflow-y-auto rounded-[28px] bg-white p-6 sm:p-7">
        {batch ? <BatchProgress key={batch.id} batch={batch} busy={busy} problem={running(batch) ? problem || (trackingError ? errorMessage(trackingError) : '') : ''} onClose={close}
          onRelease={() => void run('Releasing reservation…', async () => updateTracking(await actionFor('cancel', batch.id)))}
          onRecover={hashes => void run('Verifying receipts…', async () => {
            try { updateTracking(await apiPost<Batch>(endpoint, { action: 'attach-evm', id: batch.id, hashes })) }
            catch (error) {
              const current = await apiGet<Batch>(batchUrl(batch.id)).catch(() => null)
              if (current?.status === 'paid') updateTracking(current)
              else throw error
            }
          })} />
          : review && <>
            <DialogHeader className="pr-8 text-left">
              <DialogTitle>Review {payoutNetworks[review.chain].label} payouts</DialogTitle>
              <DialogDescription>Your wallet will show the network fee and ask for one batch approval.</DialogDescription>
            </DialogHeader>
            <p className="text-3xl font-semibold tabular-nums">{sprintMoney(review.recipients.reduce((total, recipient) => total + recipient.amountCents, 0))} <span className="text-sm font-medium text-zinc-500">USDC</span></p>
            <p className="break-all rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">Treasury wallet · {review.sender}</p>
            <ul className="max-h-60 divide-y divide-zinc-100 overflow-y-auto">{review.recipients.map(recipient => <li key={recipient.destination} className="flex justify-between gap-3 py-3 text-sm">
              <RecipientName names={recipient.names} destination={recipient.destination} />
              <span className="shrink-0 tabular-nums">{sprintMoney(recipient.amountCents)}</span>
            </li>)}</ul>
            {problem && <p role="alert" className="text-sm text-red-700">{problem}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={Boolean(busy)} onClick={close}>Cancel</Button>
              <Button disabled={Boolean(busy)} onClick={() => void run('Connecting wallet…', () => approve(review))}>
                {busy && <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />}<Morph>{busy || 'Approve in wallet'}</Morph>
              </Button>
            </div>
          </>}
      </DialogContent>
    </Dialog>
  </section>
}

function Morph({ children }: { children: string }) {
  return useReducedMotion() ? children : <TextMorph duration={260}>{children}</TextMorph>
}

function RecipientName({ names, destination }: { names: string[]; destination: string }) {
  return <div className="min-w-0">
    {!!names.length && <p className="break-words font-medium">{names.join(', ')}</p>}
    <p className="break-all font-mono text-[11px] text-zinc-500">{destination}</p>
  </div>
}

function BatchProgress({ batch, busy, problem, onClose, onRelease, onRecover }: {
  batch: Batch
  busy: string
  problem: string
  onClose: () => void
  onRelease: () => void
  onRecover: (hashes: string[]) => void
}) {
  const reduced = useReducedMotion()
  const [recover, setRecover] = useState(false)
  const [hashInput, setHashInput] = useState('')
  const count = batch.paidCreatorCount ?? batch.paidWalletCount
  const total = batch.creatorCount ?? batch.recipientCount
  const unit = batch.creatorCount === null ? 'wallets' : 'creators'
  const done = batch.status === 'paid'
  const failed = batch.status === 'failed' || batch.status === 'partial'
  const title = done ? 'All payouts confirmed' : failed ? 'Batch finished' : busy || (batch.status === 'prepared' ? 'Awaiting wallet approval' : 'Confirming payouts')
  const note = done ? 'Every transfer finalized and its transaction hash was saved to the payment ledger.'
    : failed ? (batch.hashes.length ? 'Finalized payouts are recorded. Failed transfers are back in the queue.' : 'The unsigned reservation was released.')
    : busy === 'Approve in your wallet…' ? 'Review the transfers and network fee in your treasury wallet.'
    : batch.status === 'prepared' ? 'This batch is reserved for wallet approval.' : 'We’re checking the chain for final confirmation. You can close this dialog and come back to it.'
  const icon = done ? <Check className="size-5" /> : failed ? <CircleAlert className="size-5" /> : <Loader2 className="size-5 motion-safe:animate-spin" />
  return <motion.div className="grid gap-4" initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}>
    <DialogHeader className="pr-8 text-left">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500"><ShieldCheck className="size-4" aria-hidden="true" /> USDC on {payoutNetworks[batch.chain].label}</div>
      <DialogTitle className="text-xl"><Morph>{title}</Morph></DialogTitle>
      <DialogDescription>{note}</DialogDescription>
    </DialogHeader>
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p role="status" className="text-3xl font-semibold tracking-tight tabular-nums">
            <span className="sr-only">{count} of {total} {unit} paid</span>
            <span aria-hidden="true"><Morph>{`${count} of ${total}`}</Morph></span>
          </p>
          <p className="mt-1 text-xs text-zinc-600">{unit} paid · {sprintMoney(batch.amountCents)} batch total</p>
        </div>
        <div aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-zinc-600'}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={done ? 'done' : failed ? 'finished' : 'waiting'} initial={reduced ? false : { opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, scale: 0.93 }} transition={{ duration: reduced ? 0 : 0.16 }}>{icon}</motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div role="progressbar" aria-label={`${unit} paid`} aria-valuenow={count} aria-valuemax={total || 1} className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <motion.div initial={false} animate={{ scaleX: total ? count / total : 0 }} transition={{ duration: reduced ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="h-full origin-left rounded-full bg-emerald-600" />
      </div>
    </div>
    <ul className="max-h-52 divide-y divide-zinc-100 overflow-y-auto">
      {batch.recipients.map(recipient => <li key={recipient.destination} className="flex justify-between gap-3 py-2.5 text-sm">
        <RecipientName names={recipient.names} destination={recipient.destination} />
        <div className="shrink-0 text-right">
          <p className="tabular-nums">{sprintMoney(recipient.amountCents)}</p>
          <div className={`flex items-center justify-end gap-1 text-xs ${recipient.outcome === 'paid' ? 'text-emerald-700' : 'text-zinc-500'}`}>
            <Morph>{recipient.outcome === 'paid' ? 'Confirmed' : recipient.outcome === 'failed' ? 'Released' : 'Pending'}</Morph>
            {recipient.hash && <ReceiptLink chain={batch.chain} hash={recipient.hash} />}
          </div>
        </div>
      </li>)}
    </ul>
    {!batch.recipients.some(recipient => recipient.hash) && !!batch.hashes.length &&
      <div className="flex flex-wrap gap-3">{batch.hashes.map(hash => <ReceiptLink key={hash} chain={batch.chain} hash={hash} />)}</div>}
    {problem && <p role="alert" className="text-sm text-zinc-700">{problem}</p>}
    {batch.status === 'submitted' && batch.chain !== 'solana' && recover &&
      <label className="grid gap-2 text-sm font-medium">Transaction hashes
        <textarea className="creator-field min-h-20" value={hashInput} onChange={event => setHashInput(event.target.value)} placeholder="One hash per line" />
      </label>}
    <div className="flex flex-wrap justify-end gap-2">
      {batch.status === 'prepared' && !busy && <Button variant="outline" onClick={onRelease}>Release reservation</Button>}
      {batch.status === 'submitted' && batch.chain !== 'solana' && (recover
        ? <Button variant="outline" disabled={Boolean(busy) || !hashInput.trim()} onClick={() => onRecover(hashInput.trim().split(/\s+/))}><Morph>{busy || 'Verify receipts'}</Morph></Button>
        : <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setRecover(true)}>Recover receipts</Button>)}
      <Button disabled={Boolean(busy)} onClick={onClose}>{running(batch) ? 'Close' : 'Done'}</Button>
    </div>
  </motion.div>
}

function ReceiptLink({ chain, hash }: { chain: Batch['chain']; hash: string }) {
  return <a href={payoutNetworks[chain].explorer + hash} target="_blank" rel="noreferrer" aria-label={`View transaction ${hash} on ${payoutNetworks[chain].label}`}
    className="inline-flex items-center gap-1 rounded-sm text-xs underline decoration-zinc-300 underline-offset-2">
    {hash.slice(0, 6)}…{hash.slice(-4)}<ArrowUpRight className="size-3" aria-hidden="true" />
  </a>
}
