import { getImageProps } from 'next/image'
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, useInView, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { TextMorph } from 'torph/react'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import { MetricTimeline } from '@/components/analysis/v2/metric-timeline'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import portraits from './hero-portraits.json'
import compactPortraits from './hero-portraits-compact.json'
import styles from './portrait-hero.module.css'

const compactMedia = '(min-width: 768px) and (max-width: 1279px)'
const imageOptions = { alt: '', width: 3072, height: 2048, sizes: 'max(100vw, 150vh)' }
const { props: wideImage } = getImageProps({ ...imageOptions, src: '/landing/portrait-pair-v2.webp' })
const { props: compactImage } = getImageProps({ ...imageOptions, src: '/landing/portrait-pair-compact.webp' })
const wideFaces = portraits as FaceLandmarksPayload[]
const compactFaces = compactPortraits as FaceLandmarksPayload[]

function compactAnchor([x, y]: readonly [number, number]) {
  const index = x < 768 ? 0 : 1
  const before = wideFaces[index].anchors.noseTip!
  const after = compactFaces[index].anchors.noseTip!
  return [x + (after.x - before.x) * 768, y + (after.y - before.y) * 1024]
}
const ease = [.22, 1, .36, 1] as const
const morphEase = 'cubic-bezier(.22, 1, .36, 1)'
const beatMs = 850
const sceneBeats = 11
const overlayBlendMs = 1250
const traceMotion = { duration: 1.35, ease }
const sceneTransition = { type: 'spring', stiffness: 62, damping: 16, mass: 1.1 } as const
const chartPaths = {
  angle: ['M20 42H160', 'M20 42L160 18', 'M69 42Q68 37 66 34'],
  thirds: ['M32 9H148M32 22H148M32 35H148M32 48H148', 'M90 9V48', 'M54 9V48M126 9V48'],
  contour: ['M24 15C43 16 51 40 90 47C129 40 137 16 156 15', 'M47 30H133', 'M90 29V47'],
  mirror: ['M90 8V48', 'M30 40Q48 10 79 26M150 40Q132 10 101 26', 'M48 30H77M103 30H132'],
  ratio: ['M31 15H109M31 39H151', 'M31 10V20M109 10V20M31 34V44M151 34V44', 'M109 15V39'],
} as const
const scenes = [
  {
    note: { text: 'facial midline', anchor: [332, 444], x: 64, y: 362 },
    label: 'Facial harmony', focus: { side: 0, category: 'symmetry', cue: 'symmetry', pattern: 'dashed' },
    cards: [
      { label: 'Facial harmony', value: '8.4', detail: 'Proportions in balance', chart: 'dial', x: 2, y: 51, anchor: [273, 630] },
      { label: 'Eye spacing', value: '0.46×', detail: 'Interpupillary / face width', chart: 'ticks', x: 43, y: 35, anchor: [398, 465] },
      { label: 'Hair profile', value: 'Wavy', detail: 'Texture & natural direction', chart: 'hair', x: 83, y: 31, anchor: [1270, 232] },
    ],
    pills: [{ x: 31.5, y: 46, value: '8.4' }, { x: 71, y: 63, value: '1 : 1.6' }],
  },
  {
    note: { text: 'jawline follows the chin', anchor: [256, 695], x: 62, y: 648 },
    label: 'Structure & definition', focus: { side: 0, category: 'jaw', cue: '', pattern: 'solid' },
    cards: [
      { label: 'Jaw & chin', value: '8.2', detail: 'Lower-face definition', chart: 'dial', x: 43, y: 56, anchor: [437, 663] },
      { label: 'Canthal tilt', value: '+5.2°', detail: 'Inner to outer eye corner', chart: 'ticks', x: 82, y: 42, anchor: [1304, 444] },
      { label: 'Brow shape', value: 'Straight', detail: 'A frame for your eyes', chart: 'crop', x: 3, y: 32, anchor: [245, 439] },
    ],
    pills: [{ x: 29, y: 64, value: '8.2' }, { x: 78, y: 39, value: '+5.2°' }],
  },
  {
    note: { text: 'texture across the cheek', anchor: [406, 517], x: 570, y: 320 },
    label: 'Skin & detail', focus: { side: 0, category: 'skin', cue: '', pattern: 'dotted' },
    cards: [
      { label: 'Skin texture', value: '8.6', detail: 'Surface detail & consistency', chart: 'dots', x: 3, y: 46, anchor: [250, 538] },
      { label: 'Facial symmetry', value: '96.2%', detail: 'Landmark correspondence', chart: 'mirror', x: 83, y: 51, anchor: [1233, 615] },
      { label: 'Lip proportions', value: '1 : 1.5', detail: 'Upper-to-lower lip ratio', chart: 'crop', x: 43, y: 49, anchor: [386, 627] },
    ],
    pills: [{ x: 30.5, y: 49, value: '8.6' }, { x: 72, y: 57, value: '96.2%' }],
  },
  {
    label: 'Eyes & brows', focus: { side: 1, category: 'eyes', cue: 'canthal tilt', pattern: 'solid' },
    note: { text: 'outer eye corner', anchor: [1205, 445], x: 1270, y: 320 },
    cards: [
      { label: 'Eye spacing', value: '0.46×', detail: 'Relative to face width', chart: 'ticks', position: .46, x: 3, y: 55, anchor: [376, 454] },
      { label: 'Brow direction', value: 'Straight', detail: 'Arch and outer tail', chart: 'crop', crop: 'brow', x: 44, y: 39, anchor: [291, 426] },
      { label: 'Eye angle', value: '+5.2°', detail: 'Inner to outer corner', chart: 'angle', x: 84, y: 34, anchor: [1304, 444] },
    ],
    pills: [{ x: 23, y: 47, value: '0.46×' }, { x: 76, y: 47, value: '+5.2°' }],
  },
  {
    label: 'Facial thirds', focus: { side: 1, category: 'proportions', cue: 'facial thirds', pattern: 'dashed' },
    note: { text: 'bridge to tip', anchor: [1067, 532], x: 1260, y: 635 },
    cards: [
      { label: 'Upper third', value: '33%', detail: 'Share of mapped height', chart: 'ticks', position: .33, x: 4, y: 36, anchor: [288, 377] },
      { label: 'Vertical thirds', value: '1 : 1 : 1', detail: 'Three reference zones', chart: 'thirds', x: 43, y: 51, anchor: [466, 576] },
      { label: 'Nose width', value: '0.25×', detail: 'Relative to face width', chart: 'ratio', x: 83, y: 40, anchor: [1119, 529] },
    ],
    pills: [{ x: 21, y: 52, value: '33%' }, { x: 76, y: 39, value: '0.25×' }],
  },
  {
    label: 'Contour & balance', focus: { side: 1, category: 'face-shape', cue: 'face width', pattern: 'dotted' },
    note: { text: 'widest part of the outline', anchor: [1269, 523], x: 1255, y: 354 },
    cards: [
      { label: 'Cheek contour', value: '8.6', detail: 'Curve along the cheek', chart: 'contour', x: 3, y: 41, anchor: [211, 551] },
      { label: 'Lip proportions', value: '1 : 1.5', detail: 'Upper-to-lower lip ratio', chart: 'crop', crop: 'lip', x: 44, y: 58, anchor: [386, 627] },
      { label: 'Face width', value: '0.74×', detail: 'Relative to face height', chart: 'ticks', position: .74, x: 83, y: 48, anchor: [1269, 523] },
    ],
    pills: [{ x: 22, y: 62, value: '8.6' }, { x: 76, y: 59, value: '0.74×' }],
  },
] as const

function lensPosition(x: number, y: number): CSSProperties {
  return { '--lens-x': `${-x}cqw`, '--lens-y': `${-y * 2 / 3}cqw` } as CSSProperties
}

function FaceTrace({ focus, compact, visible, reduced }: {
  focus: typeof scenes[number]['focus']
  compact: boolean
  visible: boolean
  reduced: boolean
}) {
  const { side, category, cue, pattern } = focus
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const surface = canvas.current
    const context = surface?.getContext('2d')
    if (!surface || !context || !visible) return
    const previous = document.createElement('canvas')
    previous.width = surface.width
    previous.height = surface.height
    previous.getContext('2d')?.drawImage(surface, 0, 0)
    let disposed = false
    let frame = 0
    let observer: ResizeObserver | undefined
    void import('@/lib/creator/face-treatment').then(({ preciseFaceOverlay, drawFaceTreatment }) => {
      if (disposed) return
      const landmarks = (compact ? compactFaces : wideFaces)[side]
      const size = { width: 768, height: 1024 }
      const source = { ...size, landmarks }
      const base = { size, primitives: [], dots: [] }
      const overlay = preciseFaceOverlay(base, source, category, cue)
      // Measurements already draw their own guides and endpoints.
      const features = overlay.measurement ? { ...overlay, primitives: [] } : overlay
      const started = performance.now()
      let last = started
      let elapsed = 0
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        surface.width = Math.round(surface.clientWidth * dpr)
        surface.height = Math.round(surface.clientHeight * dpr)
        if (reduced) requestAnimationFrame(() => paint(performance.now()))
      }
      observer = new ResizeObserver(resize)
      observer.observe(surface)
      resize()
      const paint = (now: number) => {
        if (disposed) return
        if (!document.hidden) elapsed += Math.min(50, now - last)
        last = now
        context.clearRect(0, 0, surface.width, surface.height)
        if (!reduced && elapsed < overlayBlendMs && previous.width && previous.height) {
          context.save()
          context.globalAlpha = Math.cos((elapsed / overlayBlendMs) * Math.PI / 2) ** 2
          context.drawImage(previous, 0, 0, surface.width, surface.height)
          context.restore()
        }
        const scale = surface.width / 768
        context.save()
        context.scale(scale, scale)
        const blend = reduced ? 1 : Math.sin(Math.min(1, elapsed / overlayBlendMs) * Math.PI / 2) ** 2
        context.globalAlpha = blend
        drawFaceTreatment(context, features, 768, reduced ? 2400 : elapsed * .58, Boolean(reduced), 1, {
          appearance: { color: '#ffffff', opacity: category === 'skin' ? .5 : .74, pattern, markers: false, regions: false },
          inkScale: Math.min(.76, Math.max(.40, surface.clientWidth / 725)),
          hold: true,
        })
        context.restore()
        if (!reduced) frame = requestAnimationFrame(paint)
      }
      paint(started)
    })
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect() }
  }, [category, cue, pattern, visible, reduced, compact, side])

  return <canvas ref={canvas} className={styles.overlay} data-side={side} />
}

export function PortraitHero({ title, children }: { title: ReactNode; children: ReactNode }) {
  const lensFilter = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const stage = useRef<HTMLDivElement>(null)
  const sceneFrame = useRef<HTMLDivElement>(null)
  const [cropInset, setCropInset] = useState(0)
  const visible = useInView(stage, { amount: .15 })
  const reduced = useReducedMotion()
  const [beat, setBeat] = useState(0)
  const [compact, setCompact] = useState(false)
  const phaseAt = (offset: number) => Math.floor(Math.max(0, beat - offset) / sceneBeats) % scenes.length
  const scene = scenes[phaseAt(1)]
  const activeStudy = scenes[phaseAt(0)]
  const { focus, note } = activeStudy
  const showNote = !reduced && beat % sceneBeats >= 5 && beat % sceneBeats <= 9
  const [noteAnchorX, noteAnchorY] = compact ? compactAnchor(note.anchor) : note.anchor
  const noteX = compact ? Math.max(170, Math.min(1130, note.x)) : note.x
  const arrowAngle = Math.atan2(noteAnchorY - (note.y + 18), (noteAnchorX - noteX) / 2) * 180 / Math.PI
  const cardPositions = [3, 6, 8].map((offset, lane) => {
    const selected = phaseAt(offset)
    const card = [...scenes[selected].cards].sort((left, right) => left.x - right.x)[lane]
    const width = lane === 1 ? 11 : 10.5
    const gutter = cropInset + 1.7 + Math.abs(card.x - (lane === 0 ? 3 : 83)) * .35
    return {
      ...card, selected, width,
      x: lane === 0 ? gutter : lane === 2 ? 100 - width - gutter : 50 - width / 2 + (card.x - 43) * .4,
      y: card.y,
      anchor: compact ? compactAnchor(card.anchor) : card.anchor,
    }
  })

  useEffect(() => {
    const viewport = stage.current
    const artwork = sceneFrame.current
    if (!viewport || !artwork) return
    const measure = () => {
      const width = artwork.getBoundingClientRect().width
      if (width > 0) setCropInset(Math.max(0, 50 * (1 - viewport.clientWidth / width)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(artwork)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const query = window.matchMedia(compactMedia)
    const sync = () => setCompact(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!visible || reduced) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setBeat(index => index + 1)
    }, beatMs)
    return () => window.clearInterval(timer)
  }, [visible, reduced])

  return <div className={styles.hero}>
    <div ref={stage} className={styles.stage} data-visible={visible} role="img" aria-label="A woman and man in a studio portrait with animated facial measurements and sample scores">
      <div ref={sceneFrame} className={styles.scene} data-compact={compact} aria-hidden="true" style={{ '--lens-filter': `url(#${lensFilter})` } as CSSProperties}>
        <svg width="0" height="0" className={styles.lensDefinition}>
          <filter id={lensFilter} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="1" seed="12" result="surface" />
            <feDisplacementMap in="SourceGraphic" in2="surface" scale="9" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <picture>
          <source media={compactMedia} srcSet={compactImage.srcSet} sizes={compactImage.sizes} />
          {/* eslint-disable-next-line @next/next/no-img-element -- Responsive, Next-optimized art direction. */}
          <img {...wideImage} loading="eager" fetchPriority="high" className={styles.photo} />
        </picture>
        <FaceTrace key={focus.side} focus={focus} compact={compact} visible={visible} reduced={Boolean(reduced)} />
        <svg className={styles.pointers} viewBox="0 0 1536 1024">
          {cardPositions.map((card, index) => {
            if (showNote || index !== (focus.side === 0 ? 0 : 2)) return null
            const endX = (card.x + (card.anchor[0] > (card.x + card.width / 2) * 15.36 ? card.width : 0)) * 15.36
            const endY = (card.y + 5) * 10.24
            return <AnimatePresence key={index}>
              <m.g key={card.selected} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .4 }}>
                <m.path d={`M${card.anchor[0]} ${card.anchor[1]} L${(card.anchor[0] + endX) / 2} ${card.anchor[1]} L${endX} ${endY}`}
                  initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }}
                  transition={reduced ? { duration: 0 } : traceMotion} />
                <m.circle cx={card.anchor[0]} cy={card.anchor[1]} r="3.25" className={styles.anchorPulse}
                  initial={{ scale: reduced ? 1 : 0 }} animate={{ scale: 1 }}
                  transition={{ duration: reduced ? 0 : .4, ease }} />
              </m.g>
            </AnimatePresence>
          })}
          <AnimatePresence>
            {showNote && <m.g key={note.text} className={styles.annotations}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }}
              transition={{ duration: reduced ? 0 : .72, ease }}>
              <m.path
                d={`M${noteX} ${note.y + 12} Q${(noteX + noteAnchorX) / 2} ${note.y + 18} ${noteAnchorX} ${noteAnchorY}`}
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduced ? 0 : 1.3, delay: reduced ? 0 : .35, ease }}
              />
              <g transform={`translate(${noteAnchorX} ${noteAnchorY}) rotate(${arrowAngle})`}>
                <m.path d="M-7 -3L0 0L-7 3" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: reduced ? 0 : .24, delay: reduced ? 0 : 1.58, ease }} />
              </g>
              <text x={noteX} y={note.y} xmlSpace="preserve">
                {Array.from(note.text).map((letter, index) => (
                  <m.tspan key={index} initial={{ opacity: reduced ? 1 : 0, clipPath: reduced ? 'inset(0%)' : 'inset(0 100% 0 0)' }}
                    animate={{ opacity: 1, clipPath: 'inset(0%)' }}
                    transition={{ duration: reduced ? 0 : .16, ease, delay: reduced ? 0 : .48 + index * .072 }}>
                    {letter}
                  </m.tspan>
                ))}
              </text>
            </m.g>}
          </AnimatePresence>
        </svg>
        {cardPositions.map((card, index) => {
          const diagram = chartPaths[card.chart as keyof typeof chartPaths]
          const isCrop = card.chart === 'hair' || card.chart === 'crop'
          return <m.div key={index} layout className={styles.card} data-image={isCrop || undefined} style={{ left: `${card.x}%`, top: `${card.y}%`, width: `${card.width}%`, ...lensPosition(card.x, card.y) }}
          initial={{ opacity: 0, scale: .94, y: 9 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .85, ease, layout: reduced ? { duration: 0 } : sceneTransition }}>
          {!isCrop && <>
            <span className={styles.lens} />
            <div className={styles.cardHeader}><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.label}</TextMorph></div>
          </>}
          <AnimatePresence initial={false} mode="popLayout">
            <m.div key={card.selected} className={styles.chart} initial={{ opacity: 0, scale: reduced ? 1 : .96, y: reduced ? 0 : 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: reduced ? 0 : 1.08, ease }}>
              {isCrop ? <div className={styles.detailCrop} data-crop={card.chart === 'hair' ? 'hair' : 'crop' in card ? card.crop : card.selected === 1 ? 'brow' : 'lip'}><i /></div>
                : card.chart === 'dots' ? <div className={styles.dotMap}>{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ '--dot-delay': `${i * -55}ms` } as CSSProperties} />)}</div>
                : card.chart === 'dial' ? <svg className={styles.dial} viewBox="0 0 180 96"><g strokeLinecap="round">{Array.from({ length: 41 }, (_, i) => {
                    const angle = Math.PI + i / 40 * Math.PI
                    const x = 90 + Math.cos(angle) * 76
                    const y = 87 + Math.sin(angle) * 76
                    const length = i % 5 === 0 ? 14 : 7
                    return <path key={i} d={`M${x} ${y} l${-Math.cos(angle) * length} ${-Math.sin(angle) * length}`} opacity={i / 40 < Number(card.value) / 10 ? .9 : .3} />
                  })}</g><m.path key={card.value} d={`M90 87 l${Math.cos(Math.PI + Number(card.value) / 10 * Math.PI) * 57} ${Math.sin(Math.PI + Number(card.value) / 10 * Math.PI) * 57}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : .75, ease }} /><circle cx="90" cy="87" r="3" /></svg>
                : diagram ? (
                  <svg className={styles.diagram} viewBox="0 0 180 56" aria-hidden="true">
                    {diagram.map((path, index) => <m.path key={path} d={path} initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : index * .18, ease }} />)}
                  </svg>
                )
                : <MetricTimeline kind="Orbit" positions={['position' in card ? card.position : card.selected === 2 ? .962 : card.selected === 1 ? .76 : .46]} grade={null} label={card.label} />}
            </m.div>
          </AnimatePresence>
          {!isCrop && <>
          <div className={styles.cardValue}><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.value}</TextMorph><span>{card.chart === 'dial' || card.chart === 'dots' || card.chart === 'contour' ? '/ 10' : ''}</span></div>
          <p><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.detail}</TextMorph></p>
          </>}
        </m.div>
        })}
        {!showNote && activeStudy.pills.map((pill, index) => {
          if (index !== focus.side) return null
          const x = compact ? Math.max(21, Math.min(77, pill.x)) : pill.x
          const y = pill.y
          return <m.div layout className={styles.scorePill} key={index}
            style={{ left: `${x}%`, top: `${y}%`, ...lensPosition(x, y) }}
            transition={reduced ? { duration: 0 } : sceneTransition}>
            <span className={styles.lens} />
            <i /><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{pill.value}</TextMorph>
          </m.div>
        })}
        <div className={styles.studyLabel}>
          <span>{String(phaseAt(1) + 1).padStart(2, '0')} / FACE MAP</span>
          <TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{scene.label}</TextMorph>
        </div>
      </div>
        <div className={`public-frame public-gutters ${styles.instruments}`} aria-hidden="true">
          <span><i />120+ facial landmarks</span>
          <span className={styles.instrumentCaption}>A closer look at you</span>
          <svg viewBox="0 0 420 30">{Array.from({ length: 85 }, (_, i) => <path key={i} d={`M${i * 5} 0v${i % 10 === 0 ? 16 : i % 5 === 0 ? 10 : 5}`} />)}</svg>
        </div>
      <ProgressiveBlur className={styles.blur} blurLayers={4} intensity={7} />
      <div className={styles.fade} />
    </div>
    <div className={`public-frame public-gutters ${styles.copy}`}>
      <div><p className={styles.kicker}>The science of your features</p><h1>{title}</h1></div>
      <div className={styles.action}>{children}</div>
    </div>
  </div>
}
