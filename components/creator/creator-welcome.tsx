import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Eye, Film, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { Button } from '@/components/ui/button'
import { CREATOR_CTA_GUIDANCE, CREATOR_SUBMIT_GUIDANCE, CREATOR_REREVIEW_GUIDANCE } from '@/lib/creator/post-guidance'

const questions = [
  { title: 'When should I submit?', headline: '20K views. Send it in.', answer: CREATOR_SUBMIT_GUIDANCE },
  { title: 'How much do I get paid?', headline: 'Your views. Your audience.', answer: 'Each campaign has its own milestone payouts. Your verified views set the milestone; your combined Tier 1 audience sets the rate. Standard campaign tiers pay A 100%, B 65%, C 40%, and D 20%, with at least 10% Tier 1 audience required. Check the campaign’s audience rules and milestone timeline for its exact amounts. Approval depends on the campaign rules and remaining budget.' },
  { title: 'Can I get paid again?', headline: 'New milestone. More earnings.', answer: CREATOR_REREVIEW_GUIDANCE },
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
      <DialogContent ref={contentRef} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus() }} className="creator-dialog max-h-[calc(100dvh-32px)] max-w-[480px] overflow-y-auto !rounded-[28px] border-zinc-100 bg-white p-0">
        <div className="px-6 pt-6 sm:px-8 sm:pt-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Welcome to Creator Studio</p>
          <nav aria-label="Creator introduction" className="mt-5 flex gap-1.5 pr-6">
            {questions.map((item, index) => <button key={item.title} type="button" aria-label={`Question ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} className="group flex min-h-8 flex-1 items-center">
              <span className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                {index <= step ? <motion.span initial={false} animate={{ opacity: index === step ? 1 : 0.4 }} transition={{ duration: reduced ? 0 : 0.2 }} className="absolute inset-0 rounded-full bg-[#00A8EF]" /> : null}
              </span>
            </button>)}
          </nav>
        </div>
        <AnimatedDialogPanel contentKey={step} contentClassName="px-6 pb-6 sm:px-8 sm:pb-7">
          <WelcomeGraphic key={step} step={step} />
          <p className="mt-5 text-xs font-medium text-[#00A8EF]">{step + 1} / 4 · {question.title}</p>
          <DialogTitle className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.04em]">{question.headline}</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-zinc-500">{question.answer}</DialogDescription>
        </AnimatedDialogPanel>
        <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4 sm:px-8">
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
      <motion.p initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">20,000<span className="ml-2 text-sm font-normal text-zinc-400">views</span></motion.p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-200/60"><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={transition} className="h-full origin-left rounded-full bg-[#00A8EF]" /></div>
      <motion.div initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ ...transition, delay: reduced ? 0 : 0.4 }} className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><Check className="size-3.5 text-[#00A8EF]" />Ready to submit</motion.div>
    </div> : step === 1 ? <div className="w-[75%]">
      <p className="mb-4 text-center text-xs text-zinc-400">Example · $15 milestone, different audience rates</p>
      <div className="flex h-20 items-end justify-between gap-4">{[20,40,65,100].map((percent,index) => <div key={percent} className="flex h-full flex-1 flex-col justify-end text-center">
        <span className="mb-1 text-[10px] tabular-nums text-zinc-500">{['$3', '$6', '$9.75', '$15'][index]}</span>
        <motion.div initial={{ scaleY: reduced ? 1 : 0 }} animate={{ scaleY: 1 }} transition={{ ...transition, delay: reduced ? 0 : index * 0.08 }} style={{ height: `${percent * 0.6}px` }} className="mx-auto w-9 origin-bottom rounded-t-md bg-[#00A8EF]" />
        <span className="mt-2 text-xs font-semibold text-zinc-600">{['D','C','B','A'][index]}</span>
      </div>)}</div>
    </div> : step === 2 ? <div className="w-[80%]">
      <div className="flex items-center justify-center gap-5"><div className="text-center"><span className="text-[10px] text-zinc-400">Already paid</span><p className="mt-1 text-3xl font-semibold tracking-tight">$15</p></div><motion.span initial={{ x: reduced ? 0 : -6, opacity: reduced ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={transition}><RotateCcw className="size-5 text-[#00A8EF]" /></motion.span><div className="text-center"><span className="text-[10px] text-zinc-400">New total</span><p className="mt-1 text-3xl font-semibold tracking-tight">$45</p></div></div>
      <motion.p initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...transition, delay: reduced ? 0 : 0.3 }} className="mt-4 text-center text-sm font-medium text-[#00A8EF]">+$30 additional payout</motion.p>
      <p className="mt-2 text-center text-[10px] text-zinc-400">Example · totals vary by campaign and tier</p>
    </div> : <div className="w-[80%]">
      <div className="mb-3 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-zinc-500"><Film className="size-3.5" />First 10 seconds</span><span className="font-medium text-[#00A8EF]">CTA · 2–3s</span></div>
      <div className="relative h-8 overflow-hidden rounded-lg bg-zinc-200/60"><motion.div initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={transition} className="absolute inset-y-0 left-[80%] flex w-[20%] origin-left items-center justify-center rounded-md bg-[#00A8EF] text-[10px] font-semibold text-white">CTA</motion.div></div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400"><span>0s</span><span>10s</span></div>
      <div className="mt-4 flex items-center justify-between"><span className="text-[10px] text-zinc-500">Slideshows · first 5 slides</span><div className="flex gap-1">{[1,2,3,4,5].map(n => <motion.span key={n} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ ...transition, delay: reduced ? 0 : n * 0.06 }} className={`grid h-6 w-4 place-items-center rounded-sm text-[8px] ${n === 4 ? 'bg-[#00A8EF] text-white' : 'border border-zinc-200 text-zinc-400'}`}>{n}</motion.span>)}</div></div>
    </div>}
  </div>
}
