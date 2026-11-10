'use client'

import { Children, type ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

// Adapted from Motion Primitives' AnimatedGroup, with stable keys and reduced motion.
const container: Variants = {
  visible: { transition: { staggerChildren: 0.045 } },
}
const presets: Record<'fade' | 'scale' | 'slide', Variants> = {
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  scale: {
    hidden: { opacity: 0, transform: 'scale(0.96)' },
    visible: { opacity: 1, transform: 'scale(1)' },
  },
  slide: {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  },
}

export function AnimatedGroup({
  children,
  className,
  preset = 'fade',
}: {
  children: ReactNode
  className?: string
  preset?: keyof typeof presets
}) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : 'hidden'}
      animate="visible"
      variants={reducedMotion ? undefined : container}
    >
      {Children.map(children, child => (
        <motion.div
          className="min-w-0"
          variants={reducedMotion ? undefined : presets[preset]}
          transition={preset === 'slide' ? { type: 'spring', stiffness: 170, damping: 25, mass: .8 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
