import { useRef, type CSSProperties } from 'react'
import { useInView } from 'motion/react'
import styles from './anchor-earnings-animation.module.css'

const tiktokNote = 'M14 3h3a6 6 0 0 0 6 6v3a9 9 0 0 1-6-2.3V17a7 7 0 1 1-7-7v3a4 4 0 1 0 4 4V3Z'

type Point = [number, number]
const line = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const curve = (a: Point, b: Point, c: Point, t: number): Point => line(line(a, b, t), line(b, c, t), t)
const ring = (x: number, y: number, radius: number, t: number): Point => [x + Math.cos(t * Math.PI * 2) * radius, y + Math.sin(t * Math.PI * 2) * radius]
const dots = Array.from({ length: 76 }, (_, i) => {
  const start = i < 34 ? ring(9, 17, 4.5, i / 34) : i < 55 ? line([15.5, 3], [15.5, 17], (i - 34) / 20) : curve([16, 3], [16, 9], [22, 9], (i - 55) / 20)
  const end = i < 16 ? ring(12, 5, 3, i / 16) : i < 34 ? line([12, 8], [12, 22], (i - 16) / 17) : i < 55 ? curve([2, 12], [2, 22], [12, 22], (i - 34) / 20) : curve([22, 12], [22, 22], [12, 22], (i - 55) / 20)
  const angle = i * 2.39996
  const distance = 20 + (i % 9) * 4
  return {
    '--from-x': `${(start[0] - 12) * 3}px`, '--from-y': `${(start[1] - 12) * 3}px`,
    '--to-x': `${(end[0] - 12) * 3}px`, '--to-y': `${(end[1] - 12) * 3}px`,
    '--scatter-x': `${Math.cos(angle) * distance}px`, '--scatter-y': `${Math.sin(angle) * distance}px`,
    '--dot-color': i % 7 === 0 ? '#25bfc5' : i % 9 === 0 ? '#ed5974' : 'var(--anchor-note, #25282d)',
  } as CSSProperties
})

/** One CSS clock dissolves the TikTok note into an app anchor and back. */
export function AnchorEarningsAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  return <div ref={ref} className={styles.scene} data-running={visible} aria-hidden="true">
    <svg viewBox="0 0 200 150" fill="none" className={styles.art}>
      <g transform="translate(100 75)">
        <g className={styles.tiktok}>
          <svg x="-36" y="-36" width="72" height="72" viewBox="0 0 24 24" overflow="visible">
            <path fill="#25bfc5" transform="translate(-.45 -.25)" d={tiktokNote} />
            <path fill="#ed5974" transform="translate(.45 .25)" d={tiktokNote} />
            <path fill="var(--anchor-note, #25282d)" d={tiktokNote} />
          </svg>
        </g>
        {dots.map((style, i) => <circle key={i} r={i % 4 === 0 ? 1.3 : .95} className={styles.particle} style={style} />)}
        <g className={styles.anchor}>
          <svg x="-36" y="-36" width="72" height="72" viewBox="0 0 24 24" stroke="var(--anchor-accent, #00a8ef)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3" />
            <path d="M12 8v14M5 12H2a10 10 0 0 0 20 0h-3" />
          </svg>
        </g>
      </g>
    </svg>
  </div>
}
