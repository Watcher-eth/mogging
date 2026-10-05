import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'

const stats = [
  { value: 10, label: 'Detailed categories', suffix: '' },
  { value: 40, label: 'Feature metrics', suffix: '+' },
  { value: 200, label: 'Facial anchors mapped', suffix: '+' },
]
const timing = { duration: 1600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }

export function EvaluationStats() {
  const ref = useRef<HTMLDListElement>(null)
  const visible = useInView(ref, { once: true, amount: .6 })
  const reduced = useReducedMotion()
  return <dl ref={ref} className="mt-7 grid grid-cols-3 gap-4 text-center lg:text-left">
    <NumberFlowGroup>
      {stats.map(({ value, label, suffix }) => <div key={label} className="flex flex-col">
        <dt className="mt-2 text-xs leading-5 text-zinc-500">{label}</dt>
        <dd className="-order-1 text-3xl font-semibold tracking-tight sm:text-4xl" aria-label={`${value}${suffix}`}>
          <NumberFlow value={visible || reduced ? value : 0} suffix={suffix} animated={!reduced} locales="en-US" spinTiming={timing} transformTiming={timing} aria-hidden="true" />
        </dd>
      </div>)}
    </NumberFlowGroup>
  </dl>
}
