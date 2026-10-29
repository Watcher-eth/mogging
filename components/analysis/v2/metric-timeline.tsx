import { metricTimelineGeometry, metricTimelinePalette, metricTimelineVariant } from '@/lib/creator/metric-timeline'
import { useEffect, useRef } from 'react'
import { motion, useInView, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import styles from './metric-timeline.module.css'

const svgNumber = (value: number) => Number(value.toFixed(3))
export type TimelineAxis = { minimum: number; maximum: number; unit: string; digits: number }

export function MetricTimeline({ kind, positions, grade, scale = 'range', label = '', value = '', axis, onPositionChange }: { kind: string; positions: number[]; grade: number | null; scale?: 'range' | 'quality'; label?: string; value?: string; axis?: TimelineAxis; onPositionChange?: (position: number) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const entered = useInView(root, { once: true, amount: .25 })
  const reduced = useReducedMotion()
  const progress = useSpring(0, { stiffness: 130, damping: 21, mass: 1.1 })
  useEffect(() => {
    if (reduced) progress.jump(1)
    else if (entered) progress.set(1)
  }, [entered, reduced, progress])
  const active = (kind === 'Rail' ? grade === null ? [] : [grade / 10] : positions).filter(Number.isFinite)
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
  const explore = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect(), x = (clientX - rect.left) / rect.width * 900 - 12
    let closest = 0, distance = Infinity
    for (let step = 0; step <= 200; step++) {
      const delta = Math.abs(geometry.place(step / 20).x - x)
      if (delta < distance) { closest = step / 200; distance = delta }
    }
    onPositionChange?.(closest)
  }
  return <div ref={root} className={styles.instrument} data-chart-state={entered || reduced ? 'entered' : 'waiting'}><svg aria-hidden="true" viewBox={`-12 -12 900 ${svgNumber(Math.max(height, cursorLabel ? labelY + 24 : geometry.bottom + 70))}`}>
    <g stroke={muted} strokeLinecap="round">{geometry.ticks.map(tick => <g key={tick.value} transform={`translate(${svgNumber(tick.x)} ${svgNumber(tick.y)}) rotate(${svgNumber(tick.rotation * 180 / Math.PI)})`}>
      <path d={`M0 ${geometry.balanced ? -tick.length / 2 : 0} V${geometry.balanced ? tick.length / 2 : tick.length}`} strokeWidth={tick.weight} opacity={svgNumber(tick.opacity)} />
    </g>)}</g>
    {geometry.ticks.filter(tick => tick.label !== undefined).map(tick => <text key={tick.value} x={svgNumber(tick.x - Math.sin(tick.rotation) * (geometry.balanced ? tick.length / 2 : tick.length))} y={svgNumber(tick.y + Math.cos(tick.rotation) * (geometry.balanced ? tick.length / 2 : tick.length) + 38)} textAnchor="middle" fill={muted} fontSize="32">{tick.label}</text>)}
    {axis ? [0, .2, .4, .6, .8, 1].map(position => { const point = geometry.place(position * 10); return <text key={position} x={svgNumber(point.x)} y={svgNumber(point.y + Math.cos(point.rotation) * (geometry.balanced ? geometry.majorLength / 2 : geometry.majorLength) + 40)} textAnchor="middle" fill={muted} fontSize="26">{(axis.minimum + position * (axis.maximum - axis.minimum)).toFixed(axis.digits)}{axis.unit}</text> }) : null}
    {geometry.cursors.map((_, index) => <TimelineCursor key={index} position={active[index]} geometry={geometry} tracking={variant === 3} progress={progress} color={index ? ink : accent} weight={index ? 7 : geometry.sparse ? 16 : 9}
      label={index ? '' : cursorLabel} labelSize={labelSize} labelHalf={labelHalf} labelY={labelY} />)}
  </svg>{onPositionChange && axis ? <input className={styles.timelineControl} type="range" min={0} max={1} step={.005} value={active[0]} aria-label={`Explore ${label.toLowerCase()}`} aria-valuetext={`${(axis.minimum + active[0] * (axis.maximum - axis.minimum)).toFixed(axis.digits)}${axis.unit}`} onChange={event => onPositionChange(Number(event.target.value))} onPointerMove={event => { if (event.pointerType === 'mouse' && !event.buttons) explore(event.clientX, event.currentTarget) }} /> : null}</div>
}

function TimelineCursor({ position, geometry, tracking, progress, color, weight, label, labelSize, labelHalf, labelY }: {
  position: number; geometry: ReturnType<typeof metricTimelineGeometry>; tracking: boolean; progress: MotionValue<number>; color: string; weight: number
  label: string; labelSize: number; labelHalf: number; labelY: number
}) {
  const reduced = useReducedMotion()
  const targetPosition = useSpring(position, { stiffness: 340, damping: 36 })
  useEffect(() => { if (reduced) targetPosition.jump(position); else targetPosition.set(position) }, [position, reduced, targetPosition])
  const pointAt = (amount: number) => {
    const target = Math.max(0, Math.min(1, targetPosition.get()))
    const start = tracking ? Math.max(0, target - .12) : 0
    return geometry.place(Math.max(0, Math.min(1, start + (target - start) * amount)) * 10)
  }
  const pointOnCursor = (amount: number, offset: number) => {
    const point = pointAt(amount)
    return { x: point.x - Math.sin(point.rotation) * offset, y: point.y + Math.cos(point.rotation) * offset }
  }
  const path = useTransform(() => {
    const amount = progress.get()
    const start = pointOnCursor(amount, geometry.balanced ? -geometry.majorLength / 2 - 10 : -10)
    const end = pointOnCursor(amount, geometry.balanced ? geometry.majorLength / 2 + 13 : geometry.majorLength + 13)
    return `M${svgNumber(start.x)} ${svgNumber(start.y)} L${svgNumber(end.x)} ${svgNumber(end.y)}`
  })
  const dotOffset = geometry.balanced ? -geometry.majorLength / 2 - 20 : -20
  const dotX = useTransform(() => pointOnCursor(progress.get(), dotOffset).x)
  const dotY = useTransform(() => pointOnCursor(progress.get(), dotOffset).y)
  const labelX = useTransform(() => Math.max(labelHalf, Math.min(876 - labelHalf, pointAt(progress.get()).x)))
  return <>
    <motion.g style={{ opacity: progress }}>
      <motion.path d={path} stroke={color} strokeWidth={weight} strokeLinecap="round" pathLength={progress} />
      <motion.circle cx={dotX} cy={dotY} r="4" fill={metricTimelinePalette.ink} />
    </motion.g>
    {label ? <motion.text x={labelX} y={svgNumber(labelY)} style={{ opacity: progress }} textAnchor="middle" fill={metricTimelinePalette.ink} fontSize={labelSize} letterSpacing="-1">{label}</motion.text> : null}
  </>
}
