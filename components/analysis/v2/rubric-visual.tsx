import { metricTimelineGeometry, metricTimelinePalette, metricTimelineVariant } from '@/lib/creator/metric-timeline'
import styles from './rubrics.module.css'

const svgNumber = (value: number) => Number(value.toFixed(3))

export function RubricVisual({ kind, positions, grade, scale = 'range', label = '', value = '' }: { kind: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality'; label?: string; value?: string }) {
  const active = kind === 'Rail' ? grade === null ? [] : [grade / 10] : positions
  if (!active.length) return null
  const numericScore = scale === 'quality' && /^\d.*\/\s*\d/.test(value)
  const variant = metricTimelineVariant(label, label), maximum = Number(value.match(/\/\s*(\d+)/)?.[1] ?? 10)
  const curved = [1, 4, 7].includes(variant), height = curved ? 340 : 260
  const geometry = metricTimelineGeometry({ width: 876, height, positions: active, variant, progress: 1, labels: numericScore, maximum })
  const { ink, muted } = metricTimelinePalette
  const accent = geometry.sparse ? metricTimelinePalette.warm : metricTimelinePalette.accent
  const cursorLabel = numericScore ? '' : value.length <= 38 ? value : ''
  const labelSize = Math.min(64, 760 / Math.max(1, cursorLabel.length * .55)), labelHalf = cursorLabel.length * labelSize * .28
  const labelY = geometry.bottom + labelSize + 42
  return <div className={styles.instrument} aria-hidden="true"><svg viewBox={`-12 -12 900 ${svgNumber(Math.max(height, cursorLabel ? labelY + 24 : geometry.bottom + 70))}`}>
    <g stroke={muted} strokeLinecap="round">{geometry.ticks.map(tick => <g key={tick.value} transform={`translate(${svgNumber(tick.x)} ${svgNumber(tick.y)}) rotate(${svgNumber(tick.rotation * 180 / Math.PI)})`}>
      <path d={`M0 ${geometry.balanced ? -tick.length / 2 : 0} V${geometry.balanced ? tick.length / 2 : tick.length}`} strokeWidth={tick.weight} opacity={svgNumber(tick.opacity)} />
    </g>)}</g>
    {geometry.ticks.filter(tick => tick.label !== undefined).map(tick => <text key={tick.value} x={svgNumber(tick.x - Math.sin(tick.rotation) * (geometry.balanced ? tick.length / 2 : tick.length))} y={svgNumber(tick.y + Math.cos(tick.rotation) * (geometry.balanced ? tick.length / 2 : tick.length) + 38)} textAnchor="middle" fill={muted} fontSize="32">{tick.label}</text>)}
    {geometry.cursors.map((point, index) => <g key={index} transform={`translate(${svgNumber(point.x)} ${svgNumber(point.y)}) rotate(${svgNumber(point.rotation * 180 / Math.PI)})`}>
      <path className={styles.cursor} d={`M0 ${geometry.balanced ? -geometry.majorLength / 2 - 10 : -10} V${geometry.balanced ? geometry.majorLength / 2 + 13 : geometry.majorLength + 13}`} stroke={index ? ink : accent} strokeWidth={index ? 7 : geometry.sparse ? 16 : 9} strokeLinecap="round" />
      <circle cy={geometry.balanced ? -geometry.majorLength / 2 - 20 : -20} r="4" fill={ink} />
    </g>)}
    {cursorLabel ? <text x={svgNumber(Math.max(labelHalf, Math.min(876 - labelHalf, geometry.cursors[0].x)))} y={svgNumber(labelY)} textAnchor="middle" fill={ink} fontSize={labelSize} letterSpacing="-1">{cursorLabel}</text> : null}
  </svg></div>
}
