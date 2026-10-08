import { useEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Eye, Film } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { Button } from '@/components/ui/button'
import { CREATOR_AUDIENCE_BANDS } from '@/lib/creator/sprint-defaults'
import { CREATOR_CTA_GUIDANCE, CREATOR_SUBMIT_GUIDANCE, CREATOR_REREVIEW_GUIDANCE } from '@/lib/creator/post-guidance'

const questions = [
  { title: 'When should I submit?', headline: '20K views. Send it in.', answer: CREATOR_SUBMIT_GUIDANCE },
  { title: 'How much do I get paid?', headline: 'Your views. Your audience.', answer: 'Each campaign has its own milestone payouts. Your verified views set the milestone; your combined Tier 1 audience sets the rate. Standard campaign tiers pay A 100%, B 65%, C 40%, and D 20%, with at least 10% Tier 1 audience required.' },
  { title: 'Can I get paid again?', headline: 'New milestone. More earnings.', answer: CREATOR_REREVIEW_GUIDANCE.replace(', subject to campaign rules and remaining budget.', '.') },
  { title: 'How long should the CTA be?', headline: 'Keep it short. Show it early.', answer: CREATOR_CTA_GUIDANCE },
] as const

// Per-creator, versioned dismissal: revisiting routes does not replay the intro.
export function useCreatorWelcome(userId?: string, enabled = true) {
  const [open, setOpen] = useState(false)
  const storageKey = userId ? `mogging:creator-intro:v1:${userId}` : null
  useEffect(() => {
    if (!enabled || !storageKey) return
    try { setOpen(localStorage.getItem(storageKey) !== 'seen') }
    catch { setOpen(true) }
  }, [enabled, storageKey])

  function onOpenChange(value: boolean) {
    setOpen(value)
    if (!value && storageKey) {
      try { localStorage.setItem(storageKey, 'seen') } catch { /* Storage may be disabled. */ }
    }
  }
  return { open, onOpenChange }
}

export function CreatorWelcomeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const question = questions[step]
  const reduced = useReducedMotion()
  useEffect(() => { if (open) setStep(0) }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus() }} className="creator-dialog max-h-[calc(100dvh-32px)] max-w-[480px] overflow-y-auto gap-2 !rounded-[28px] border-zinc-100 bg-white p-0">
        <div className="px-6 pt-6 sm:px-8 sm:pt-7">
          <p className="pr-8 text-[15px] font-semibold text-zinc-500">{question.title}</p>
          <nav aria-label="Creator introduction" className="mt-5 flex gap-1.5 pr-6">
            {questions.map((item, index) => <button key={item.title} type="button" aria-label={`Question ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} className="group flex min-h-8 flex-1 items-center">
              <span className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                {index <= step ? <motion.span initial={false} animate={{ opacity: index === step ? 1 : 0.4 }} transition={{ duration: reduced ? 0 : 0.2 }} className="absolute inset-0 rounded-full bg-[#00A8EF]" /> : null}
              </span>
            </button>)}
          </nav>
        </div>
        <AnimatedDialogPanel contentKey={step} contentClassName="px-6 pb-2 sm:px-8">
          <WelcomeGraphic key={step} step={step} />
          <DialogTitle className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.04em]">{question.headline}</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-zinc-500">{question.answer}</DialogDescription>
        </AnimatedDialogPanel>
        <div className="flex items-center justify-between px-6 pb-4 sm:px-8">
          <button type="button" onClick={() => step ? setStep(step - 1) : onOpenChange(false)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
            {step ? <ArrowLeft className="size-4" /> : null}{step ? 'Back' : 'Skip for now'}
          </button>
          <Button className="rounded-full px-5" onClick={() => step === 3 ? onOpenChange(false) : setStep(step + 1)}>
            {step === 3 ? <>Got it<Check className="size-4" /></> : <>Next<ArrowRight className="size-4" /></>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WelcomeGraphic({ step }: { step: number }) {
  const reduced = useReducedMotion()
  const transition = { duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] as const }
  return <div aria-hidden="true" className="relative flex h-44 items-center justify-center overflow-hidden rounded-[20px] bg-[#f7f9fa]">
    {step === 0 ? <div className="w-full px-5">
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs text-zinc-400"><Eye className="size-3.5" />Views</span><span className="text-xs font-medium text-[#00A8EF]">First milestone</span></div>
      <motion.p initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="mt-3 text-4xl font-semibold tracking-tight tabular-nums"><WelcomeViewsCounter /><span className="ml-2 text-sm font-normal text-zinc-400">views</span></motion.p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-200/60"><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ ...transition, duration: reduced ? 0 : 1.4 }} className="h-full origin-left rounded-full bg-[#00A8EF]" /></div>
    </div> : step === 1 ? <div className="w-[75%]">
      <p className="mb-4 text-center text-xs text-zinc-400">Example · 1M views, up to $325</p>
      <div className="flex h-20 items-end justify-between gap-4">{CREATOR_AUDIENCE_BANDS.map((band,index) => <div key={band.tier} className="flex h-full flex-1 flex-col justify-end text-center">
        <span className="mb-1 text-[10px] tabular-nums text-zinc-500">{(325 * band.payoutPercent / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
        <motion.div initial={{ scaleY: reduced ? 1 : 0 }} animate={{ scaleY: 1 }} transition={{ ...transition, delay: reduced ? 0 : index * 0.08 }} style={{ height: `${band.payoutPercent * 0.6}px` }} className="mx-auto w-9 origin-bottom rounded-t-md bg-[#00A8EF]" />
        <span className="mt-2 text-xs font-semibold text-zinc-600">{band.tier}</span>
      </div>)}</div>
    </div> : step === 2 ? <div className="w-full px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-[11px] text-zinc-400">20K views</p><p className="mt-1 text-lg font-semibold tracking-tight">$15 paid</p></div>
        <ArrowRight className="size-4 shrink-0 text-zinc-400" />
        <div className="text-right"><p className="text-[11px] text-zinc-400">40K views</p><p className="mt-1 text-lg font-semibold tracking-tight">$45 total</p></div>
      </div>
      <div className="flex h-9 overflow-hidden rounded-lg">
        <span className="flex w-1/3 items-center justify-center bg-zinc-200 text-[10px] font-medium text-zinc-600">$15 already paid</span>
        <motion.span initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={transition} className="flex w-2/3 origin-left items-center justify-center bg-[#00A8EF] text-xs font-semibold text-white">+$30 new payout</motion.span>
      </div>
      <motion.p initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...transition, delay: reduced ? 0 : 0.3 }} className="mt-3 text-center text-xs font-medium text-[#00A8EF]">Rereview approved → receive $30 more</motion.p>
    </div> : <div className="w-[80%]">
      <div className="mb-3 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-zinc-500"><Film className="size-3.5" />First 10 seconds</span><span className="font-medium text-[#00A8EF]">CTA · 2–3s</span></div>
      <div className="relative h-8 overflow-hidden rounded-lg bg-zinc-200/60"><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={transition} className="absolute inset-y-0 left-[80%] flex w-[20%] origin-left items-center justify-center rounded-md bg-[#00A8EF] text-[10px] font-semibold text-white">CTA</motion.div></div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400"><span>0s</span><span>10s</span></div>
      <div className="mt-4 flex items-center justify-between"><span className="text-[10px] text-zinc-500">Slideshows · first 5 slides</span><div className="flex gap-1">{[1,2,3,4,5].map(n => <motion.span key={n} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ ...transition, delay: reduced ? 0 : n * 0.06 }} className={`grid h-6 w-4 place-items-center rounded-sm text-[8px] ${n === 4 ? 'bg-[#00A8EF] text-white' : 'border border-zinc-200 text-zinc-400'}`}>{n}</motion.span>)}</div></div>
    </div>}
  </div>
}


function WelcomeViewsCounter() {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.textContent = '20,000'
      return
    }
    if (ref.current) ref.current.textContent = '0'
    const counter = animate(0, 20_000, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (views) => {
        if (ref.current) ref.current.textContent = Math.round(views).toLocaleString('en-US')
      },
    })
    return () => counter.stop()
  }, [reduced])
  return <span ref={ref}>20,000</span>
}
