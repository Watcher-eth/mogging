import { useId } from 'react'
import styles from './rubrics.module.css'

const distribution = 'linear-gradient(90deg,#F33232 0%,#FF6800 18%,#53A553 35%,#00A8EF 48%,#00A8EF 52%,#53A553 65%,#FF6800 82%,#F33232 100%)'
const progress = 'linear-gradient(90deg,#F33232,#FF6800 32%,#53A553 64%,#00A8EF)'
const bounded = (value: number) => Math.max(0, Math.min(1, value))

export function RubricVisual({ kind, positions, grade, scale = 'range' }: { kind: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality' }) {
  const id = useId().replace(/:/g, '')
  if (kind === 'Rail' ? grade === null : positions.length === 0) return null
  if (kind === 'Orbit') {
    const point = (value: number) => { const angle = Math.PI * (1 - bounded(value)); return { x: 50 + 38 * Math.cos(angle), y: 48 - 38 * Math.sin(angle) } }
    const stops = scale === 'quality' ? [['0%', '#F33232'], ['32%', '#FF6800'], ['64%', '#53A553'], ['100%', '#00A8EF']] : [['0%', '#F33232'], ['18%', '#FF6800'], ['35%', '#53A553'], ['48%', '#00A8EF'], ['52%', '#00A8EF'], ['65%', '#53A553'], ['82%', '#FF6800'], ['100%', '#F33232']]
    return <div className={styles.orbit} aria-hidden="true"><svg viewBox="0 0 100 60">
      <defs>
        <linearGradient id={id} x1="12" y1="0" x2="88" y2="0" gradientUnits="userSpaceOnUse">{stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}</linearGradient>
        <filter id={`${id}-blur`} x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <path d="M12 48 A38 38 0 0 1 88 48" fill="none" stroke={positions.length ? `url(#${id})` : '#e4e4e7'} strokeWidth="9" strokeLinecap="round" filter={`url(#${id}-blur)`} opacity=".35" />
      <path d="M12 48 A38 38 0 0 1 88 48" fill="none" stroke={positions.length ? `url(#${id})` : '#e4e4e7'} strokeWidth="6" strokeLinecap="round" opacity=".55" />
      <path d="M12 48 A38 38 0 0 1 88 48" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity=".65" transform="translate(0,-1.5)" />
      {positions.map((position, index) => { const { x, y } = point(position); return <g key={index}>
        <path d={`M50 48 L${x} ${y}`} stroke="#18181b" strokeWidth="1" opacity=".18" />
        <circle cx={x} cy={y} r="6" fill="#ffffffbb" stroke="white" strokeWidth="1.5" />
        <circle cx={x} cy={y} r="2" fill="#18181b" />
      </g> })}
      <circle cx="50" cy="48" r="2" fill="#71717a" />
    </svg></div>
  }

  const rail = kind === 'Rail'
  const activePositions = rail && grade !== null ? [grade / 10] : positions
  return <div aria-hidden="true" className={`${styles.track} ${rail ? styles.rail : styles.capsule}`}>
    <span className={styles.tint} style={{ background: activePositions.length ? rail ? progress : distribution : '#e4e4e7', ...(rail && grade !== null ? { width: `${bounded(grade / 10) * 100}%` } : {}) }} />
    {activePositions.map((position, index) => <span key={index} className={`${styles.thumb} ${index ? styles.secondary : ''}`} style={{ left: `${bounded(position) * 100}%` }} />)}
  </div>
}
