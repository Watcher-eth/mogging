import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import { skinNetworkFrame } from '@/lib/creator/mobile-overlay-engine/skin-network'
import type { PixelPoint } from '@/lib/creator/mobile-overlay-engine/resolve'

export function SkinNetworkSvg({ points, active = true }: { points: readonly PixelPoint[]; active?: boolean }) {
  const ref = useRef<SVGGElement>(null)
  const visible = useInView(ref)
  const reduced = useReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (reduced || !visible || !active) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (now - last >= 32) {
        const delta = Math.min(50, now - last)
        if (!document.hidden) setElapsed(time => time + delta)
        last = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, visible, reduced])

  const { anchors, links, radius, opacity } = skinNetworkFrame(points, elapsed, Boolean(reduced || !active))
  const line = (start: PixelPoint, end: PixelPoint, opacity: number, weight: number) =>
    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} opacity={opacity} strokeWidth={radius * weight} />
  return <g ref={ref} opacity={opacity} aria-hidden="true" stroke="white" strokeLinecap="round">
    {links.map(({ start, end, opacity, glint }, index) => <g key={index}>
      {line(start, end, opacity, .52)}
      {glint && <>
        {line(glint.start, glint.end, glint.opacity * .16, 2.4)}
        {line(glint.start, glint.end, glint.opacity, .8)}
      </>}
    </g>)}
    {anchors.map(({ x, y, tracker, trail }, index) => <g key={index}>
      {trail && <>
        {line(trail, { x, y }, .08, 2.2)}
        {line(trail, { x, y }, .18, .9)}
      </>}
      <circle cx={x} cy={y} r={radius} fill="white" stroke="none" opacity={.76} />
      {tracker && <rect x={x - radius * 2.5} y={y - radius * 2.5} width={radius * 5} height={radius * 5} fill="none" opacity={.37} strokeWidth={radius * .55} />}
    </g>)}
  </g>
}
