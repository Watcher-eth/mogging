import { useEffect, useId, useRef } from 'react'
import { useAnimationFrame, useInView, useReducedMotion } from 'motion/react'

const CYCLE = 12
const IMPACT = 6.8
const GRAVITY = 420
const pieces = [
  { x: 107, y: 137, vx: -58, vy: -95, spin: -90, path: 'M40 70H144L136 116L150 147L135 215H40Z' },
  { x: 165, y: 104, vx: -23, vy: -155, spin: 95, path: 'M144 70H193L183 120L161 132L136 116Z' },
  { x: 151, y: 170, vx: 20, vy: -100, spin: -100, path: 'M136 116L161 132L174 166L164 215H135L150 147Z' },
  { x: 220, y: 108, vx: 38, vy: -130, spin: 75, path: 'M193 70H280V141L214 140L183 120Z' },
  { x: 213, y: 165, vx: 64, vy: -75, spin: 120, path: 'M183 120L214 140H280V215H164L174 166L161 132Z' },
]
const ease = (p: number) => 1 - (1 - p) ** 3
const clamp = (p: number) => Math.max(0, Math.min(1, p))

// Ballistic flight, one damped bounce, then friction along the ground.
function flight(age: number, vx: number, vy: number, floor: number) {
  const hit = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * floor)) / GRAVITY
  const after = Math.max(0, age - hit)
  const bounce = (vy + GRAVITY * hit) * 0.22
  return {
    x: vx * (Math.min(age, hit) + (1 - Math.exp(-after * 3)) / 3),
    y: age < hit ? vy * age + GRAVITY * age * age / 2 : Math.min(floor, floor - bounce * after + GRAVITY * after * after / 2),
  }
}

function place(node: SVGGElement | null, transform: string, opacity = 1) {
  if (!node) return
  node.setAttribute('transform', transform)
  node.style.opacity = String(opacity)
}

export function PiggyBank() {
  const id = useId()
  const scene = useRef<SVGSVGElement>(null)
  const bank = useRef<SVGGElement>(null)
  const hammer = useRef<SVGGElement>(null)
  const cracks = useRef<SVGGElement>(null)
  const incoming = useRef<(SVGGElement | null)[]>([])
  const fragments = useRef<(SVGGElement | null)[]>([])
  const spilled = useRef<(SVGGElement | null)[]>([])
  const elapsed = useRef(0)
  const visible = useInView(scene)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!reduced) return
    elapsed.current = 0
    place(bank.current, '')
    for (const node of [hammer.current, cracks.current, ...incoming.current, ...fragments.current, ...spilled.current]) place(node, '', 0)
  }, [reduced])

  useAnimationFrame((_, delta) => {
    if (!visible || reduced) return
    elapsed.current += delta / 1000
    const t = elapsed.current % CYCLE
    const broken = t >= IMPACT && t < 11.4
    const reform = ease(clamp((t - 10.1) / 1.3))
    const remaining = 1 - reform
    place(bank.current, '', broken ? 0 : 1)
    place(cracks.current, '', t >= 6.72 && t < IMPACT ? 1 : 0)

    incoming.current.forEach((node, index) => {
      const clock = t - index * 0.23
      const lap = Math.floor(clock / 1.3)
      const age = clock % 1.3
      const p = clamp(age / 1.1)
      const start = 40 + ((index * 57 + lap * 41) % 240)
      const control = (start + 149) / 2 + Math.sin(index + lap * 2) * 38
      const x = (1 - p) ** 2 * start + 2 * (1 - p) * p * control + p * p * 149
      const y = (1 - p) ** 2 * -12 + p * p * 104
      place(node, `translate(${x} ${y}) rotate(${p * 210 - 35})`, t < 6 && clock >= 0 && age < 1.1 ? clamp(p * 8) : 0)
    })

    pieces.forEach((piece, index) => {
      const age = Math.max(0, Math.min(t - IMPACT, 3.3))
      const position = flight(age, piece.vx, piece.vy, 193 - piece.y)
      place(fragments.current[index], `translate(${position.x * remaining} ${position.y * remaining}) rotate(${piece.spin * Math.min(age, 1.2) * remaining} ${piece.x} ${piece.y})`, broken ? 1 : 0)
    })
    spilled.current.forEach((node, index) => {
      const age = Math.max(0, Math.min(t - IMPACT - index * 0.025, 3.3))
      const position = flight(age, (index - 3) * 29, -160 - (index % 3) * 28, 65)
      place(node, `translate(${149 + position.x * remaining} ${131 + position.y * remaining}) rotate(${age * (index % 2 ? 210 : -180) * remaining})`, broken ? remaining : 0)
    })

    let angle = 72, x = 228, y = 168, opacity = 0
    if (t >= 6 && t < IMPACT) {
      const p = clamp((t - 6) / 0.8)
      angle = 72 - 112 * p ** 3
      x += 38 * (1 - ease(clamp(p * 3)))
      y -= 60 * (1 - ease(clamp(p * 3)))
      opacity = clamp(p * 5)
    } else if (t >= IMPACT && t < 7.6) {
      const p = (t - IMPACT) / 0.8
      angle = -40 + 85 * ease(p)
      x += 100 * p * p
      y -= 110 * p * p
      opacity = 1 - clamp((p - 0.35) / 0.65)
    }
    place(hammer.current, `translate(${x} ${y}) rotate(${angle})`, opacity)
  })

  return (
    <svg ref={scene} viewBox="0 0 320 230" className="w-72 max-w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="132" y1="82" x2="178" y2="191" gradientUnits="userSpaceOnUse"><stop stopColor="white" /><stop offset="1" stopColor="#eef0f2" /></linearGradient>
        <radialGradient id={`${id}-coin`}><stop stopColor="white" /><stop offset="1" stopColor="#e2e5e9" /></radialGradient>
        <clipPath id={`${id}-slot`}><path d="M0 0h320v97H0z" /></clipPath>
        {pieces.map((piece, index) => <clipPath key={index} id={`${id}-piece-${index}`}><path d={piece.path} /></clipPath>)}
        <g id={`${id}-coin-shape`}>
          <circle r="8" fill={`url(#${id}-coin)`} stroke="#ccd2da" strokeWidth="1.2" />
          <circle r="5.5" stroke="white" /><path d="M0-3v6m-2-5 2-1" stroke="#aeb7c3" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <g id={`${id}-bank`} stroke="#d2d7de" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M86 133c-18 1-25-14-17-20 8-6 17 7 6 12" />
          <path d="m111 171 3 27h17l7-19m48-1 5 20h17l5-28" fill={`url(#${id}-body)`} />
          <path d="M236 121h13c5 0 8 4 8 9v17c0 5-3 9-8 9h-17c-14 23-38 33-72 33-45 0-77-22-77-54s31-52 75-52c15 0 28 2 40 6l19-15c5-4 8-2 7 4l-3 26c7 5 12 11 15 17Z" fill={`url(#${id}-body)`} />
          <path d="m204 91 10-8-2 17" fill="#e9ecf0" stroke="none" />
          <path d="M132 98c10-3 24-3 35 0" stroke="#b5bdc8" strokeWidth="3" />
          <path d="M101 135c0-16 10-28 25-34" stroke="white" strokeWidth="4" />
          <circle cx="218" cy="120" r="2.5" fill="#aeb5be" stroke="none" />
          <path d="M246 133v8" stroke="#b5bdc8" strokeWidth="2.5" />
        </g>
      </defs>
      <ellipse cx="165" cy="204" rx="112" ry="8" fill="#f5f6f7" />
      <g ref={bank}><use href={`#${id}-bank`} /></g>
      <g ref={cracks} opacity="0" stroke="#aeb7c3" strokeWidth="1.2" strokeLinejoin="round"><path d="m144 86-8 30 25 16 22-12 27-31m-49 43 13 34-10 23m-28-73 14 31-15 37m48-64 31 20 27 1" /></g>
      {pieces.map((_, index) => <g key={index} ref={node => { fragments.current[index] = node }} opacity="0"><g clipPath={`url(#${id}-piece-${index})`}><use href={`#${id}-bank`} /></g></g>)}
      <g clipPath={`url(#${id}-slot)`}>
        {Array.from({ length: 5 }, (_, index) => <g key={index} ref={node => { incoming.current[index] = node }} opacity="0"><use href={`#${id}-coin-shape`} /></g>)}
        {reduced ? <use href={`#${id}-coin-shape`} x="149" y="39" /> : null}
      </g>
      {Array.from({ length: 7 }, (_, index) => <g key={index} ref={node => { spilled.current[index] = node }} opacity="0"><use href={`#${id}-coin-shape`} /></g>)}
      <g ref={hammer} opacity="0" stroke="#c5ccd5" strokeWidth="1.4">
        <rect x="-4" y="-85" width="8" height="87" rx="4" fill="#e8ebef" />
        <rect x="-24" y="-103" width="48" height="23" rx="5" fill={`url(#${id}-body)`} />
        <path d="M-18-97h34" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}
