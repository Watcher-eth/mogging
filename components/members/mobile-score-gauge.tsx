import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useId } from 'react'

function gaugeGeometry(semicircle: boolean) {
  const start = semicircle ? 180 : 144
  const sweep = semicircle ? 180 : 252
  const centerY = semicircle ? 49 : 47
  const position = (progress: number, radius: number, axis: 'x' | 'y') => {
    const angle = (start + progress * sweep) * Math.PI / 180
    const coordinate = axis === 'x' ? 50 + Math.cos(angle) * radius : centerY + Math.sin(angle) * radius
    return Number(coordinate.toFixed(4))
  }
  const ticks = Array.from({ length: 51 }, (_, index) => {
    const value = index / 50
    const inner = 43 - (index % 5 === 0 ? 6.5 : 3.2)
    return { x1: position(value, inner, 'x'), y1: position(value, inner, 'y'), x2: position(value, 43, 'x'), y2: position(value, 43, 'y') }
  })
  const arc = `M${position(0, 40, 'x')} ${position(0, 40, 'y')}A40 40 0 ${semicircle ? 0 : 1} 1 ${position(1, 40, 'x')} ${position(1, 40, 'y')}`
  return { position, ticks, arc }
}

const standardGauge = gaugeGeometry(false)
const evaluationGauge = gaugeGeometry(true)

export function MobileScoreGauge({ score, light = false, semicircle = false }: { score: number; light?: boolean; semicircle?: boolean }) {
  const { position, ticks, arc } = semicircle ? evaluationGauge : standardGauge
  const reduced = useReducedMotion()
  const tickMask = useId()
  const progress = Math.max(0, Math.min(1, score / 10))
  const sweep = useMotionValue(0)
  useEffect(() => {
    if (reduced) { sweep.set(progress); return }
    const animation = animate(sweep, progress, { duration: 1.2, ease: [.22, .61, .36, 1] })
    return () => animation.stop()
  }, [progress, reduced, sweep])
  const cursorX1 = useTransform(sweep, value => position(value, 35.5, 'x'))
  const cursorY1 = useTransform(sweep, value => position(value, 35.5, 'y'))
  const cursorX2 = useTransform(sweep, value => position(value, 44.5, 'x'))
  const cursorY2 = useTransform(sweep, value => position(value, 44.5, 'y'))
  const dotX = useTransform(sweep, value => position(value, 45.6, 'x'))
  const dotY = useTransform(sweep, value => position(value, 45.6, 'y'))
  const reading = useTransform(sweep, value => (value * 10).toFixed(1))
  return <div className="scan-score-gauge" data-light={light || undefined} data-semicircle={semicircle || undefined}>
    <svg viewBox={semicircle ? '0 0 100 67' : '0 0 100 80'} aria-hidden="true">
      {ticks.map((tick, index) => <line key={index} {...tick} stroke={light ? '#a6afb8' : '#64707c'} strokeWidth=".5" strokeLinecap="round" />)}
      <defs><mask id={tickMask}><motion.path d={arc} pathLength={sweep} fill="none" stroke="white" strokeWidth="10" /></mask></defs>
      <g mask={`url(#${tickMask})`}>{ticks.map((tick, index) => <line key={index} {...tick} stroke={light ? '#131820' : '#dce2e8'} strokeWidth=".5" strokeLinecap="round" />)}</g>
      <motion.line x1={cursorX1} y1={cursorY1} x2={cursorX2} y2={cursorY2} stroke="#ed982b" strokeWidth="1.2" strokeLinecap="round" />
      <motion.circle cx={dotX} cy={dotY} r=".6" fill={light ? '#131820' : '#fff'} />
    </svg>
    <span><span><motion.strong aria-hidden="true">{reading}</motion.strong><span className="sr-only">{score.toFixed(1)}</span> <small>/ 10</small></span><small>Overall score</small></span>
  </div>
}
