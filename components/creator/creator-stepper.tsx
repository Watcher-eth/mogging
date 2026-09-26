import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CreatorStepper({ step, labels }: { step: 1 | 2 | 3; labels: [string, string, string] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    containerRef.current?.focus({ preventScroll: true })
    containerRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [step])
  return <div ref={containerRef} tabIndex={-1} role="group" className="scroll-mt-20 outline-none mb-5 grid grid-cols-3 rounded-[16px] bg-black/[0.045] p-1" aria-label={`Step ${step} of 3`}>{labels.map((label, index) => { const number = index + 1; const active = number === step; const complete = number < step; return <div key={label} className={cn('flex items-center justify-center gap-2 rounded-[12px] px-2 py-2 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-200', active ? 'bg-white text-[#1d1d1f] shadow-sm' : complete ? 'text-[#248a3d]' : 'text-[#86868b]')}><span className={cn('grid size-5 place-items-center rounded-full text-[10px]', active ? 'bg-[#0071e3] text-white' : complete ? 'bg-[#e5f7ea]' : 'bg-black/[0.05]')}>{complete ? <Check className="size-3" /> : number}</span><span className="leading-tight">{label}</span></div> })}</div>
}

