import { motion, useReducedMotion } from 'motion/react'

type Reading = { id: string; date: string; score: number }

export function historyTickPositions(readings: Reading[]) {
  const first = Date.parse(readings[0]?.date ?? '')
  const duration = Date.parse(readings.at(-1)?.date ?? '') - first
  return readings.map((reading, index) => readings.length === 1 ? 160 : 8 + 304 * (
    duration > 0 ? (Date.parse(reading.date) - first) / duration : index / (readings.length - 1)
  ))
}

export function IndustrialHistory({ readings, activeId = readings.at(-1)?.id, compact = false }: {
  readings: Reading[]; activeId?: string | null; compact?: boolean
}) {
  const reduced = useReducedMotion()
  const positions = historyTickPositions(readings)
  const height = compact ? 46 : 72
  const baseline = height - 5
  return <svg viewBox={`0 0 320 ${height}`} preserveAspectRatio="none" aria-hidden="true" className="member-industrial-history">
    <path d={`M8 ${baseline}H312`} stroke="#e1e4e8" vectorEffect="non-scaling-stroke" />
    {Array.from({ length: 39 }, (_, index) => {
      const x = 8 + index * 8
      return <path key={index} d={`M${x} ${baseline}v-${index % 5 === 0 ? 10 : 5}`} stroke="#b8c0c9" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    })}
    {readings.map(({ id, score }, index) => {
      const active = id === activeId
      const y = baseline - 9 - score / 10 * (height - 21)
      return <motion.g key={id} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: .24, delay: reduced ? 0 : Math.min(index, 12) * .024 }}>
        <line x1={positions[index]} x2={positions[index]} y1={y} y2={baseline} stroke={active ? '#e8942b' : '#667685'} strokeWidth={active ? 3 : 1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {active && <line x1={positions[index]} x2={positions[index] + .02} y1={y - 4} y2={y - 4} stroke="#252a30" strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </motion.g>
    })}
  </svg>
}
