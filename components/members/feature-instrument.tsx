import { motion, useReducedMotion } from 'motion/react'
import type { FeatureArea } from '@/lib/analysis-v2/feature-history'
import { historyTickPositions } from './industrial-history'

type Reading = { id: string; date: string; score: number }
type Kind = 'histogram' | 'steps' | 'dial' | 'pins' | 'rail' | 'balance'
const instruments: Record<FeatureArea, { kind: Kind; ink: string }> = {
  skin: { kind: 'histogram', ink: '#467f9d' }, jaw: { kind: 'steps', ink: '#a76536' },
  eyes: { kind: 'dial', ink: '#447b9b' }, cheeks: { kind: 'pins', ink: '#8c689b' },
  face: { kind: 'rail', ink: '#507d73' }, symmetry: { kind: 'balance', ink: '#627c9e' },
  proportions: { kind: 'rail', ink: '#aa7633' }, brows: { kind: 'pins', ink: '#9b6275' },
  nose: { kind: 'dial', ink: '#6678a8' }, mouth: { kind: 'steps', ink: '#a15e72' },
  hair: { kind: 'histogram', ink: '#6d8256' }, ears: { kind: 'balance', ink: '#647b86' },
}
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, strokeWidth = 1.35) =>
  <line {...{ x1, y1, x2, y2, stroke, strokeWidth }} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
const guides: Partial<Record<FeatureArea, { numerator: string; denominator: string; vertical?: boolean }>> = {
  eyes: { numerator: 'Pupil span', denominator: 'Cheek width' },
  jaw: { numerator: 'Chin height', denominator: 'Lower-face height', vertical: true },
  cheeks: { numerator: 'Cheek width', denominator: 'Outer-eye span' },
  face: { numerator: 'Face width', denominator: 'Face height', vertical: true },
}
const neutral = '#a5b1bf'
const grid = '#ced5dd'
const clamp = (value: number) => Math.min(1, Math.max(0, value))

export function FeatureInstrument({ area, readings, measured, caption, format, wide }: {
  area: FeatureArea; readings: Reading[]; measured: boolean; caption: string; format: (value: number) => string; wide: boolean
}) {
  const reduced = useReducedMotion()
  const { kind, ink } = instruments[area]
  const recent = readings.slice(wide ? -18 : -10)
  const values = recent.map(item => item.score)
  const current = values.at(-1)!
  const min = Math.min(...values)
  const max = Math.max(...values)
  const discrete = measured && area === 'skin'
  const difference = measured && area === 'symmetry'
  const pad = Math.max((max - min) * .2, Math.abs(current) * .025, .015)
  const lower = measured && !discrete && !difference ? min - pad : 0
  const upper = !measured ? 10 : discrete ? 4 : difference ? Math.max(1, max + pad) : max + pad
  const valueAt = (value: number) => clamp((value - lower) / (upper - lower))
  const positions = historyTickPositions(recent)
  const tickCount = wide ? 28 : 16
  const ruler = (baseline: number) => Array.from({ length: tickCount + 1 }, (_, i) =>
    <g key={i}>{line(8 + i * 304 / tickCount, baseline, 8 + i * 304 / tickCount, baseline - (i % 4 === 0 ? 10 : 5), '#c7cfd7')}</g>)
  const historySummary = recent.length > 1 ? `${format(recent[0].score)} → ${format(current)}` : format(current)

  let graphic
  if (discrete) {
    const levels = Array.from({ length: 5 }, (_, level) => values.filter(value => value === level).length)
    const peak = Math.max(1, ...levels)
    graphic = <>{line(12, 51, 308, 51, grid)}{levels.map((count, level) => {
      const x = 22 + level * 69
      return <g key={level}>
        {line(x, 46, x, 46 - (count ? 8 + 29 * count / peak : 2), level === current ? ink : neutral, level === current ? 6 : 3.5)}
        <text x={x} y="64" textAnchor="middle" fill="#64717d" fontSize="10">{level}</text>
      </g>
    })}</>
  } else if (kind === 'histogram') {
    const bins = Array.from({ length: wide ? 19 : 13 }, () => 0)
    const bin = (value: number) => Math.min(bins.length - 1, Math.floor(valueAt(value) * bins.length))
    for (const value of values) bins[bin(value)]++
    const peak = Math.max(...bins)
    graphic = <>{ruler(57)}{bins.map((count, i) => {
      const x = 12 + i * 296 / (bins.length - 1)
      return <g key={i}>{line(x, 52, x, 52 - (count ? 7 + 34 * count / peak : 3), i === bin(current) ? ink : '#aebcc7', count ? 3.7 : 1.35)}</g>
    })}</>
  } else if (kind === 'dial') {
    const point = (position: number, r: number) => {
      const theta = Math.PI * (1 + position)
      return [160 + r * Math.cos(theta), 57 + r * Math.sin(theta)] as const
    }
    graphic = <>
      {Array.from({ length: 29 }, (_, i) => <g key={i}>{line(...point(i / 28, i % 4 ? 46 : 43), ...point(i / 28, 51), '#bfc9d2')}</g>)}
      {values.map((value, i) => <g key={recent[i].id}>{line(...point(valueAt(value), 34), ...point(valueAt(value), 53), i === values.length - 1 ? ink : '#8396a7', i === values.length - 1 ? 3.4 : 1.6)}</g>)}
      {line(151, 57, 169, 57, '#bfc9d2')}
    </>
  } else if (kind === 'rail') {
    graphic = <>{ruler(48)}{line(8, 39, 312, 39, '#e3e8ec')}
      {line(8 + valueAt(min) * 304, 39, 8 + valueAt(max) * 304, 39, ink, 2)}
      {values.map((value, i) => {
        const x = 8 + valueAt(value) * 304
        return <g key={recent[i].id}>{line(x, 29 - i % 3 * 4, x, 44, i === values.length - 1 ? ink : '#899aa9', i === values.length - 1 ? 3.4 : 1.6)}</g>
      })}</>
  } else if (kind === 'pins') {
    graphic = <>{ruler(56)}{recent.map((item, i) => {
      const x = positions[i]
      const y = 46 - valueAt(item.score) * 32
      return <g key={item.id}>{line(x, y, x, 53, '#c9d2da')}{line(x, y, x + .06, y, i === recent.length - 1 ? ink : '#8495a6', i === recent.length - 1 ? 6 : 4)}</g>
    })}</>
  } else if (kind === 'balance') {
    graphic = <>{line(8, difference ? 50 : 32, 312, difference ? 50 : 32, grid)}{ruler(59)}{recent.map((item, i) => {
      const baseline = difference ? 50 : 32
      const offset = difference ? valueAt(item.score) * 39 : (valueAt(item.score) - valueAt(recent[0].score)) * 30
      const x = positions[i]
      const latest = i === recent.length - 1
      return <g key={item.id}>{line(x, baseline, x, baseline - offset, latest ? ink : neutral, latest ? 3.6 : 2)}
        {line(x - 5, baseline - offset, x + 5, baseline - offset, latest ? ink : neutral, 2.3)}</g>
    })}</>
  } else {
    graphic = <>{ruler(58)}{recent.map((item, i) => {
      const x = positions[i]
      const y = 49 - valueAt(item.score) * 32
      const color = i === recent.length - 1 ? ink : '#8999a6'
      return <g key={item.id}>{line(x, y, x, 54, color, i === recent.length - 1 ? 3.2 : 1.8)}{line(Math.max(7, x - 7), y, Math.min(313, x + 7), y, color, 2)}</g>
    })}</>
  }

  const guide = measured && current > 0 ? guides[area] : undefined
  return <div className="member-feature-visual" data-instrument={kind} data-measured={measured || undefined} data-baseline={recent.length === 1 || undefined} data-with-guide={Boolean(guide) || undefined} role="img"
    aria-label={`${caption}: ${historySummary}${discrete ? '. Scan count by texture level.' : ''}${difference ? '. Zero means the eyes are level.' : ''}`}>
    <div className="member-feature-caption" aria-hidden="true"><span>{caption}</span><b>{historySummary}</b></div>
    {guide && <RatioGuide {...guide} ratio={current} ink={ink} />}
    {(recent.length > 1 || !guide) && <svg viewBox="0 0 320 68" preserveAspectRatio={kind === 'dial' ? 'xMidYMid meet' : 'none'} aria-hidden="true">
      <motion.g initial={reduced ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : .38, ease: [.22, 1, .36, 1] }}>
        {graphic}
      </motion.g>
    </svg>}
  </div>
}

function RatioGuide({ numerator, denominator, ratio, vertical, ink }: {
  numerator: string; denominator: string; ratio: number; vertical?: boolean; ink: string
}) {
  const maximum = Math.max(1, ratio)
  const dimension = (value: number, offset: number, color: string) => {
    const span = (vertical ? 28 : 106) * value / maximum
    return vertical ? <>
      {line(offset, 36 - span, offset, 36, color, 2.8)}
      {line(offset - 4, 36 - span, offset + 4, 36 - span, color, 1.5)}
      {line(offset - 4, 36, offset + 4, 36, color, 1.5)}
    </> : <>
      {line(60 - span / 2, offset, 60 + span / 2, offset, color, 2.8)}
      <circle cx={60 - span / 2} cy={offset} r="2.8" fill={color} />
      <circle cx={60 + span / 2} cy={offset} r="2.8" fill={color} />
    </>
  }
  return <div className="member-feature-guide" aria-hidden="true">
    <svg viewBox={vertical ? '31 0 58 43' : '0 0 120 43'}>
      {dimension(1, vertical ? 70 : 30, neutral)}
      {dimension(ratio, vertical ? 50 : 13, ink)}
    </svg>
    <span style={{ color: ink }}>{numerator}</span><span>{denominator}</span>
  </div>
}
