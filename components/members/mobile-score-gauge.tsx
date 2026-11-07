import { motion, useReducedMotion } from 'motion/react'

const ticks = Array.from({ length: 51 }, (_, index) => {
  const angle = (144 + index / 50 * 252) * Math.PI / 180
  const inner = 43 - (index % 5 === 0 ? 6.5 : 3.2)
  return {
    x1: 50 + Math.cos(angle) * inner,
    y1: 47 + Math.sin(angle) * inner,
    x2: 50 + Math.cos(angle) * 43,
    y2: 47 + Math.sin(angle) * 43,
  }
})

export function MobileScoreGauge({ score, light = false }: { score: number; light?: boolean }) {
  const reduced = useReducedMotion()
  const progress = Math.max(0, Math.min(1, score / 10))
  return <div className="scan-score-gauge" data-light={light || undefined}>
    <svg viewBox="0 0 100 80" aria-hidden="true">
      {ticks.map((tick, index) => <line key={index} {...tick} stroke={light ? '#a6afb8' : '#64707c'} strokeWidth=".5" strokeLinecap="round" />)}
      {ticks.slice(0, Math.floor(progress * 50) + 1).map((tick, index) => <motion.line key={index} {...tick}
        stroke={light ? '#131820' : '#dce2e8'} strokeWidth=".5" strokeLinecap="round"
        initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : .12, delay: reduced ? 0 : .72 * index / 50 }} />)}
      <motion.g style={{ transformOrigin: '50px 47px' }} initial={reduced ? false : { rotate: 144 }}
        animate={{ rotate: 144 + progress * 252 }} transition={{ duration: reduced ? 0 : 1.2, ease: [.22, .61, .36, 1] }}>
        <path d="M85.5 47h9" stroke="#ed982b" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="95.6" cy="47" r=".6" fill={light ? '#131820' : '#fff'} />
      </motion.g>
    </svg>
    <span><span><strong>{score.toFixed(1)}</strong> <small>/ 10</small></span><small>Overall score</small></span>
  </div>
}
