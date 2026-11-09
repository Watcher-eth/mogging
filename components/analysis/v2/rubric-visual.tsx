import type { ComponentProps } from 'react'
import { timelineGeometry, timelinePalette, timelinePoint } from '@/lib/creator/mobile-report-geometry'
import { MetricTimeline } from './metric-timeline'
import styles from './rubrics.module.css'

const dialWidth = 216
const dial = timelineGeometry(dialWidth, 'dial')
const point = (position: number) => timelinePoint(Math.max(0, Math.min(1, position)), dialWidth, 'dial')

export function RubricVisual(props: ComponentProps<typeof MetricTimeline>) {
  if (props.kind !== 'Dial') return <MetricTimeline {...props} />
  const { positions, value = '', scale, axis } = props
  const limits = axis ? [axis.minimum, axis.maximum].map(number => `${number}${axis.unit}`)
    : scale === 'quality' ? ['0', value.match(/\/\s*(\d+)/)?.[1] ?? '10'] : []
  return <svg className={styles.dial} viewBox={`0 0 ${dialWidth} ${dial.height}`} aria-hidden="true">
    {dial.ticks.map(({ start, end, weight }, index) => <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
      stroke={index / (dial.ticks.length - 1) <= positions[0] ? timelinePalette.muted : '#d9dfe5'} strokeWidth={weight} strokeLinecap="round" />)}
    {positions.filter(Number.isFinite).map((position, index) => {
      const { x, y, rotation } = point(position)
      return <g key={index} transform={`translate(${x} ${y}) rotate(${rotation * 180 / Math.PI})`}>
        <line y1="-3" y2={dial.majorLength + 3} stroke={index ? timelinePalette.ink : timelinePalette.warm} strokeWidth="4.5" strokeLinecap="round" />
      </g>
    })}
    {value && <text x={dialWidth / 2} y={dialWidth * .54} textAnchor="middle" className={styles.dialValue}
      fontSize={Math.min(34, 195 / Math.max(5, value.length) * 1.45)}>{value}</text>}
    {limits.map((label, index) => {
      const { x, y } = point(index)
      return <text key={index} x={x} y={y + 15} textAnchor="middle" className={styles.dialLimit}>{label}</text>
    })}
  </svg>
}
