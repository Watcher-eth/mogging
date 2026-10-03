import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CreatorStepper({
  step,
  labels,
}: {
  step: number
  labels: readonly string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    containerRef.current?.focus({ preventScroll: true })
    containerRef.current?.scrollIntoView({
      block: 'start',
      behavior: 'instant',
    })
  }, [step])
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="group"
      style={{
        gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
      }}
      className="scroll-mt-20 outline-none mb-5 grid rounded-[16px] bg-black/[0.045] p-1"
      aria-label={`Step ${step} of ${labels.length}`}
    >
      {labels.map((label, index) => {
        const number = index + 1
        const active = number === step
        const complete = number < step
        return (
          <div
            key={label}
            className={cn(
              'flex items-center justify-center gap-2 rounded-[12px] px-2 py-2 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-200',
              labels.length > 3 ? 'flex-col gap-1 sm:flex-row sm:gap-2' : '',
              active
                ? 'bg-white text-[#1d1d1f] shadow-sm'
                : complete
                  ? 'text-[#181a1d]'
                  : 'text-[#86868b]',
            )}
          >
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full text-[10px]',
                active
                  ? 'creator-tone-blue text-white'
                  : complete
                    ? 'creator-tone-green'
                    : 'bg-black/[0.05]',
              )}
            >
              {complete ? <Check className="size-3" /> : number}
            </span>
            <span className="leading-tight">{label}</span>
          </div>
        )
      })}
    </div>
  )
}
