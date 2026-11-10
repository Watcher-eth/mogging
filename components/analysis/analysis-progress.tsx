import { motion, useReducedMotion } from 'motion/react'
import { TextMorph } from 'torph/react'

export function AnalysisProgress({ label, durationMs, stage, initialProgress = 0 }: { label: string; durationMs?: number; stage?: number; initialProgress?: number }) {
  const reduce = useReducedMotion()
  return <div className="analysis-progress">
    <span role="status"><TextMorph>{label}</TextMorph></span>
    <div className="analysis-progress-track" aria-hidden="true">
      {stage !== undefined ? <motion.span className="analysis-progress-fill" initial={false} animate={{ scaleX: stage / 3 }}
        transition={{ duration: reduce ? 0 : .32, ease: [.22, 1, .36, 1] }} />
        : durationMs !== undefined && !reduce ? <motion.span className="analysis-progress-fill" initial={{ scaleX: initialProgress }} animate={{ scaleX: 1 }}
        transition={{ duration: durationMs / 1000, ease: 'linear' }} />
        : <span className="analysis-progress-pulse" />}
    </div>
  </div>
}
