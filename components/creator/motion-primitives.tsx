'use client'

import { useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView, useIsPresent, useReducedMotion } from 'motion/react'
import { appearanceVariants, motionEase, motionTiming, type AppearancePreset } from '@/lib/creator/motion-presets'

export function InView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, amount: .12 })
  const reduced = useReducedMotion()
  return <motion.div ref={ref} className={className} initial={reduced ? false : 'hidden'} animate={visible || reduced ? 'visible' : 'hidden'} variants={appearanceVariants('in-view')} transition={{ duration: reduced ? 0 : motionTiming.enter, ease: motionEase }}>{children}</motion.div>
}

function Panel({ children }: { children: ReactNode }) {
  const present = useIsPresent(), reduced = useReducedMotion()
  return <motion.div inert={!present} aria-hidden={!present || undefined} initial={{ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? 'none' : 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: reduced ? 0 : -8, filter: reduced ? 'none' : 'blur(4px)' }} transition={{ duration: reduced ? 0 : present ? .24 : motionTiming.exit, ease: motionEase }}>{children}</motion.div>
}

export function TransitionPanel({ children, activeKey }: { children: ReactNode; activeKey: string }) {
  return <AnimatePresence initial={false} mode="wait"><Panel key={activeKey}>{children}</Panel></AnimatePresence>
}

export function TextEffect({ children, className, preset = 'text-blur' }: { children: string; className?: string; preset?: AppearancePreset }) {
  const reduced = useReducedMotion()
  return <span className={className}><span className="sr-only">{children}</span><motion.span key={children} aria-hidden="true" initial={reduced ? false : 'hidden'} animate="visible" transition={{ staggerChildren: reduced ? 0 : motionTiming.stagger }}>{children.split(/(\s+)/).map((segment, index) => <motion.span key={index} className="inline-block whitespace-pre" variants={appearanceVariants(preset)} transition={{ duration: reduced ? 0 : motionTiming.enter, ease: motionEase }}>{segment}</motion.span>)}</motion.span></span>
}
