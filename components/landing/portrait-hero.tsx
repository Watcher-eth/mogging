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
const imageOptions = { alt: '', width: 1536, height: 1024, sizes: '100vw' }
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
const overlayBlendMs = 1600
const sceneTransition = { type: 'spring', stiffness: 46, damping: 17, mass: 1.15 } as const
const cardWidth = 13
const annotations = [
  { text: 'brow alignment', anchor: [245, 435], x: 64, y: 362 },
  { text: 'jaw contour', anchor: [256, 695], x: 63, y: 692 },
  { text: 'cheek texture', anchor: [406, 517], x: 566, y: 320 },
] as const
const scenes = [
  {
    label: 'Facial harmony', left: 'overall', right: 'proportions',
    cards: [
      { label: 'Facial harmony', value: '8.4', detail: 'Proportions in balance', chart: 'dial', x: 2, y: 51, anchor: [273, 630] },
      { label: 'Eye spacing', value: '0.46×', detail: 'Interpupillary / face width', chart: 'ticks', x: 43, y: 35, anchor: [398, 465] },
      { label: 'Hair profile', value: 'Wavy', detail: 'Texture & natural direction', chart: 'hair', x: 83, y: 16, anchor: [1270, 232] },
    ],
    pills: [{ x: 31.5, y: 46, value: '8.4' }, { x: 71, y: 63, value: '1 : 1.6' }],
  },
  {
    label: 'Structure & definition', left: 'jaw', right: 'eyes',
    cards: [
      { label: 'Jaw & chin', value: '8.2', detail: 'Lower-face definition', chart: 'dial', x: 40, y: 57, anchor: [437, 663] },
      { label: 'Canthal tilt', value: '+5.2°', detail: 'Inner to outer eye corner', chart: 'ticks', x: 82, y: 42, anchor: [1304, 444] },
      { label: 'Brow shape', value: 'Straight', detail: 'A frame for your eyes', chart: 'crop', x: 3, y: 18, anchor: [245, 439] },
    ],
    pills: [{ x: 29, y: 64, value: '8.2' }, { x: 78, y: 39, value: '+5.2°' }],
  },
  {
    label: 'Skin & detail', left: 'skin', right: 'symmetry',
    cards: [
      { label: 'Skin texture', value: '8.6', detail: 'Surface detail & consistency', chart: 'dots', x: 3, y: 46, anchor: [250, 538] },
      { label: 'Facial symmetry', value: '96.2%', detail: 'Landmark correspondence', chart: 'ticks', x: 82, y: 57, anchor: [1233, 615] },
      { label: 'Lip proportions', value: '1 : 1.5', detail: 'Upper-to-lower lip ratio', chart: 'crop', x: 43, y: 49, anchor: [386, 627] },
    ],
    pills: [{ x: 30.5, y: 49, value: '8.6' }, { x: 72, y: 57, value: '96.2%' }],
  },
] as const

function lensPosition(x: number, y: number): CSSProperties {
  return { '--lens-x': `${-x}cqw`, '--lens-y': `${-y * 2 / 3}cqw` } as CSSProperties
}

export function PortraitHero({ title, children }: { title: ReactNode; children: ReactNode }) {
  const lensFilter = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const visible = useInView(stage, { amount: .15 })
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState(0)
  const scene = scenes[selected]
  const [compact, setCompact] = useState(false)
  // Keep each card in its own column as the study changes.
  const cardPositions = [...scene.cards].sort((left, right) => left.x - right.x).map((card, lane) => ({
    ...card,
    x: compact ? [3, 44, 85][lane] : card.x,
    y: [48, 36, 30][lane] + (selected - 1) * 2,
    anchor: compact ? compactAnchor(card.anchor) : card.anchor,
  }))
  const note = annotations[selected]
  const [noteAnchorX, noteAnchorY] = compact ? compactAnchor(note.anchor) : note.anchor
  const noteX = compact && selected === 2 ? 661 : note.x

  const width = compact ? 12 : cardWidth

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
      if (!document.hidden) setSelected(index => (index + 1) % scenes.length)
    }, 7900)
    return () => window.clearInterval(timer)
  }, [visible, reduced, selected])

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
      const overlays = (compact ? compactFaces : wideFaces).map((landmarks, index) => {
        const size = { width: 768, height: 1024 }
        const source = { ...size, landmarks }
        const base = { size, primitives: [], dots: [] }
        const category = index === 0 ? scene.left : scene.right
        return {
          features: preciseFaceOverlay(base, source, category),
          texture: index === 1 && category !== 'skin' ? preciseFaceOverlay(base, source, 'skin') : null,
        }
      })
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
        const scale = surface.width / 1536
        context.save()
        context.scale(scale, scale)
        const blend = reduced ? 1 : Math.sin(Math.min(1, elapsed / overlayBlendMs) * Math.PI / 2) ** 2
        overlays.forEach(({ features, texture }, index) => {
          context.save()
          context.translate(index * 768, 0)
          context.globalAlpha = blend
          if (texture) drawFaceTreatment(context, texture, 768, elapsed, Boolean(reduced), 1, {
            appearance: { color: '#ffffff', opacity: .23, pattern: 'dotted', markers: false, regions: false },
            hold: true,
          })
          drawFaceTreatment(context, features, 768, reduced ? 2400 : elapsed, Boolean(reduced), 1, {
            appearance: { color: '#ffffff', opacity: .77, pattern: index ? 'dashed' : 'dotted', markers: false, regions: false },
            inkScale: Math.min(.76, Math.max(.40, surface.clientWidth / 1450)),
            hold: true,
          })
          context.restore()
        })
        context.restore()
        if (!reduced) frame = requestAnimationFrame(paint)
      }
      paint(started)
    })
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect() }
  }, [scene, visible, reduced, compact])

  return <div className={styles.hero}>
    <div ref={stage} className={styles.stage} data-visible={visible} role="img" aria-label="A woman and man in a studio portrait with animated facial measurements and sample scores">
      <div className={styles.scene} data-compact={compact} aria-hidden="true" style={{ '--lens-filter': `url(#${lensFilter})` } as CSSProperties}>
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
        <canvas ref={canvas} className={styles.overlay} />
        <svg className={styles.pointers} viewBox="0 0 1536 1024">
          <defs>
            <marker id="hero-annotation-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 L7 4 L1 7" stroke="#293039" fill="none" />
            </marker>
          </defs>
          {cardPositions.map((card, index) => {
            const endX = (card.x + (card.anchor[0] > (card.x + width / 2) * 15.36 ? width : 0)) * 15.36
            const endY = (card.y + 5) * 10.24
            return <m.g key={index} initial={false} animate={{ opacity: 1 }}>
              <m.path animate={{ d: `M${card.anchor[0]} ${card.anchor[1]} L${(card.anchor[0] + endX) / 2} ${card.anchor[1]} L${endX} ${endY}` }} transition={{ duration: reduced ? 0 : 1.1, ease }} />
              <m.circle animate={{ cx: card.anchor[0], cy: card.anchor[1] }} r="3.25" className={styles.anchorPulse} transition={{ duration: reduced ? 0 : 1.1, ease }} />
            </m.g>
          })}
          <AnimatePresence initial={false}>
            {selected === 0 && !compact && <m.g key="side-ruler" className={styles.sideRuler} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .65, ease }}>
              <path d="M1005 320V722 M997 320H1013 M997 454H1013 M997 588H1013 M997 722H1013" />
              {Array.from({ length: 27 }, (_, index) => <path key={index} d={`M1005 ${326 + index * 15}h${index % 3 === 0 ? -7 : -4}`} />)}
            </m.g>}
            <m.g key={note.text} className={styles.annotations}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : .72, ease }}>
              <m.path
                d={`M${noteX} ${note.y + 12} Q${(noteX + noteAnchorX) / 2} ${note.y + 18} ${noteAnchorX} ${noteAnchorY}`}
                markerEnd="url(#hero-annotation-arrow)"
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduced ? 0 : 1.3, delay: reduced ? 0 : .35, ease }}
              />
              <m.text x={noteX} y={note.y}
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : .63, ease }}>
                {note.text}
              </m.text>
            </m.g>
          </AnimatePresence>
        </svg>
        {cardPositions.map((card, index) => {
          const isCrop = card.chart === 'hair' || card.chart === 'crop'
          return <m.div key={index} layout className={styles.card} data-image={isCrop || undefined} style={{ left: `${card.x}%`, top: `${card.y}%`, width: `${width}%`, ...lensPosition(card.x, card.y) }}
          initial={{ opacity: 0, scale: .94, y: 9 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : .85, ease, layout: reduced ? { duration: 0 } : sceneTransition }}>
          {!isCrop && <>
            <span className={styles.lens} />
            <div className={styles.cardHeader}><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.label}</TextMorph></div>
          </>}
          <AnimatePresence initial={false} mode="popLayout">
            <m.div key={card.chart} className={styles.chart} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: reduced ? 0 : .9, ease }}>
              {isCrop ? <div className={styles.detailCrop} data-crop={card.chart === 'hair' ? 'hair' : selected === 1 ? 'brow' : 'lip'}><i /></div>
                : card.chart === 'dots' ? <div className={styles.dotMap}>{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ '--dot-delay': `${i * -55}ms` } as CSSProperties} />)}</div>
                : card.chart === 'dial' ? <svg className={styles.dial} viewBox="0 0 180 96"><g strokeLinecap="round">{Array.from({ length: 41 }, (_, i) => {
                    const angle = Math.PI + i / 40 * Math.PI
                    const x = 90 + Math.cos(angle) * 76
                    const y = 87 + Math.sin(angle) * 76
                    const length = i % 5 === 0 ? 14 : 7
                    return <path key={i} d={`M${x} ${y} l${-Math.cos(angle) * length} ${-Math.sin(angle) * length}`} opacity={i / 40 < Number(card.value) / 10 ? .9 : .3} />
                  })}</g><m.path key={card.value} d={`M90 87 l${Math.cos(Math.PI + Number(card.value) / 10 * Math.PI) * 57} ${Math.sin(Math.PI + Number(card.value) / 10 * Math.PI) * 57}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : .75, ease }} /><circle cx="90" cy="87" r="3" /></svg>
                : <MetricTimeline kind="Orbit" positions={[selected === 2 ? .962 : selected === 1 ? .76 : .46]} grade={null} label={card.label} />}
            </m.div>
          </AnimatePresence>
          {!isCrop && <>
          <div className={styles.cardValue}><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.value}</TextMorph><span>{card.chart === 'dial' || card.chart === 'dots' ? '/ 10' : ''}</span></div>
          <p><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{card.detail}</TextMorph></p>
          </>}
        </m.div>
        })}
        {scene.pills.map((pill, index) => {
          const x = compact ? [16, 79][index] : pill.x
          const y = compact ? [44, 64][index] : pill.y
          return <m.div layout className={styles.scorePill} key={index}
            style={{ left: `${x}%`, top: `${y}%`, ...lensPosition(x, y) }}
            transition={reduced ? { duration: 0 } : sceneTransition}>
            <span className={styles.lens} />
            <i /><TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{pill.value}</TextMorph>
          </m.div>
        })}
        <div className={styles.studyLabel}>
          <span>01 / FACE MAP</span>
          <TextMorph duration={reduced ? 0 : 560} ease={morphEase}>{scene.label}</TextMorph>
        </div>
      </div>
        <div className={styles.instruments} aria-hidden="true">
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
