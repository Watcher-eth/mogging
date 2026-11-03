import { useReducedMotion } from 'motion/react'
import type { MotionProps } from 'motion/react'

export function useHomepageEntrance(): MotionProps {
  const reduced = useReducedMotion()
  return {
    initial: reduced ? false : { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 'some', margin: '0px 0px -40px 0px' },
    transition: { duration: reduced ? 0 : .52, ease: [.22, 1, .36, 1] },
  }
}
