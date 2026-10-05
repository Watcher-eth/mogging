import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset, type PixelPoint, type ResolvedPrimitive } from '@/lib/creator/mobile-overlay-engine/resolve'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { buildFaceMapPoints } from '@/lib/creator/mobile-overlay-engine/face-map-points'
import type { OverlayPreset, OverlayPrimitive } from '@/lib/creator/mobile-overlay-engine/schema'
import portrait from './intro-portrait.json'

const initialHoldMs = 4_000
const overlayHoldMs = 3_000
const morphDuration = 0.9
const morphEase = [0.65, 0, 0.35, 1] as const
const pathSamples = 65

// A shared path topology lets persistent SVG nodes interpolate every geometry.
function morphPath(points: PixelPoint[]) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0
  let offset = 0
  return Array.from({ length: pathSamples }, (_, index) => {
    const distance = total * index / (pathSamples - 1)
    while (segment < lengths.length - 1 && offset + lengths[segment] < distance) {
      offset += lengths[segment++]
    }
    const from = points[segment]
    const to = points[segment + 1] ?? from
    const progress = lengths[segment] ? (distance - offset) / lengths[segment] : 0
    return `${index ? 'L' : 'M'} ${(from.x + (to.x - from.x) * progress).toFixed(2)} ${(from.y + (to.y - from.y) * progress).toFixed(2)}`
  }).join(' ')
}

type Shape = Exclude<ResolvedPrimitive, { kind: 'label' | 'point' }>

function smoothContour(points: PixelPoint[], closed: boolean) {
  // Interpolate the measured contour rather than drawing angular landmark edges.
  const point = (index: number) => closed
    ? points[(index + points.length) % points.length]
    : points[Math.max(0, Math.min(points.length - 1, index))]
  return Array.from({ length: (closed ? points.length : points.length - 1) * 8 + 1 }, (_, index) => {
    const segment = Math.floor(index / 8)
    const t = index % 8 / 8
    const a = point(segment - 1)
    const b = point(segment)
    const c = point(segment + 1)
    const d = point(segment + 2)
    const interpolate = (key: 'x' | 'y') => 0.5 * (2 * b[key] + (-a[key] + c[key]) * t
      + (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t
      + (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t)
    return { x: interpolate('x'), y: interpolate('y') }
  })
}

function primitivePath(primitive: Shape) {
  switch (primitive.kind) {
    case 'line': return morphPath([primitive.fromPoint, primitive.toPoint])
    case 'box': {
      const { x, y, width, height } = primitive.rect
      const radius = Math.min(10, width / 4, height / 4)
      const corners = [
        { x: x + width - radius, y: y + radius },
        { x: x + width - radius, y: y + height - radius },
        { x: x + radius, y: y + height - radius },
        { x: x + radius, y: y + radius },
      ]
      const points = corners.flatMap((corner, index) => Array.from({ length: 9 }, (_, step) => {
        const angle = (index - 1 + step / 8) * Math.PI / 2
        return { x: corner.x + Math.cos(angle) * radius, y: corner.y + Math.sin(angle) * radius }
      }))
      return morphPath([...points, points[0]])
    }
    default: {
      const closed = primitive.kind === 'region' || Boolean(primitive.closed)
      const points = primitive.pixelPoints
      return morphPath(primitive.id === 'mouth-contour'
        ? closed ? [...points, points[0]] : points
        : smoothContour(points, closed))
    }
  }
}

// The demo portrait is immutable: resolve and sample its paths once, in source
// coordinates. SVG cover projection handles every viewport without JS resizing.
const landmarks = enrichFaceLandmarks(portrait as FaceLandmarksPayload)!
const size = portrait.image
const point = (x: number, y: number) => ({ point: { x, y } })
const contour = (id: string, points: PixelPoint[], closed = true): OverlayPrimitive => ({
  id, kind: 'polyline', points: points.map((p) => point(p.x, p.y)), closed, opacity: 0.88,
})
const line = (id: string, from: PixelPoint, to: PixelPoint): OverlayPrimitive => ({
  id, kind: 'line', from: point(from.x, from.y), to: point(to.x, to.y), opacity: 0.88,
})
// Vision's outline ends at the eyebrows; trace the visible hairline to close it.
const faceOutline = [
  ...portrait.contours.faceOutline.slice(1, -1),
  { x: 0.29, y: 0.235 }, { x: 0.34, y: 0.183 }, { x: 0.42, y: 0.154 },
  { x: 0.51, y: 0.143 }, { x: 0.61, y: 0.161 }, { x: 0.69, y: 0.207 },
  { x: 0.727, y: 0.252 },
]
const lowerJaw = portrait.contours.jawline.slice(4, 13)
const label = (id: string, title: string, x: number, y: number): OverlayPrimitive => ({ id, kind: 'label', title, at: point(x, y) })
const dot = (id: string, x: number, y: number, radius = 4): OverlayPrimitive => ({ id, kind: 'point', at: point(x, y), radius })

// Keep these demo edits local; report measurements still use the shared presets.
const presets: OverlayPreset[] = Object.entries(reportOverlayPresets).map(([category, preset]) => {
  switch (category) {
    // Preserve the calibrated eyelid extrema instead of resampling them again.
    case 'eyes': return { ...preset, primitives: [
      contour('left-eye-contour', portrait.contours.leftEye),
      contour('right-eye-contour', portrait.contours.rightEye),
      ...preset.primitives.filter((p) => p.kind === 'point' || p.kind === 'label'),
    ] }
    case 'nose': return { ...preset, primitives: [
      contour('nose-outline', portrait.contours.noseOutline),
      label('nose-label', 'Nose shape', 0.59, 0.45),
    ] }
    case 'jaw': return { ...preset, primitives: [
      ...[lowerJaw[0], lowerJaw[lowerJaw.length - 1]].flatMap((vertex, index) => {
        const upper = portrait.contours.jawline[index === 0 ? 2 : 14]
        const lower = lowerJaw[index === 0 ? 2 : lowerJaw.length - 3]
        return [
          line(`jaw-ramus-${index}`, upper, vertex),
          line(`jaw-body-${index}`, vertex, lower),
          dot(`jaw-vertex-${index}`, vertex.x, vertex.y, 3),
        ]
      }),
      label('jaw-label', 'Jaw angle', 0.61, 0.67),
    ] }
    case 'dimorphism': return { ...preset, primitives: [
      line('brow-width', portrait.anchors.leftBrow, portrait.anchors.rightBrow),
      contour('lower-jaw-contour', lowerJaw, false),
      dot('left-jaw', lowerJaw[lowerJaw.length - 1].x, lowerJaw[lowerJaw.length - 1].y, 3),
      dot('right-jaw', lowerJaw[0].x, lowerJaw[0].y, 3),
      dot('chin', portrait.anchors.chin.x, portrait.anchors.chin.y, 3),
      label('dimorphism-label', 'Dimorphism', 0.61, 0.67),
    ] }
    case 'face-shape': return { ...preset, primitives: [
      contour('full-face-outline', faceOutline),
      label('shape-label', 'Face shape', 0.61, 0.67),
    ] }
    case 'overall': return { ...preset, primitives: [
      contour('left-eye-contour', portrait.contours.leftEye),
      contour('right-eye-contour', portrait.contours.rightEye),
      contour('nose-outline', portrait.contours.noseOutline),
      contour('mouth-contour', portrait.contours.mouth),
      ...[portrait.anchors.leftCheek, portrait.anchors.rightCheek, portrait.anchors.chin]
        .map((p, index) => dot(`proportion-${index}`, p.x, p.y, 3)),
      label('overall-label', 'PSL score', 0.61, 0.67),
    ] }
    case 'facial-fat': return { ...preset, primitives: preset.primitives.filter((p) => p.id !== 'facial-fat-box') }
    case 'biological-age': return { ...preset, footer: '[ 008 ] SKIN AGE', primitives: [
      ...buildFaceMapPoints(landmarks).slice(0, 60).map((p, index) => dot(`face-map-${index}`, p.x, p.y, 2.6)),
      label('face-map-label', 'Skin age', 0.63, 0.59),
    ] }
    case 'sun-damage': {
      const leftEye = landmarks.anchors.leftPupil!, rightEye = landmarks.anchors.rightPupil!
      const mouth = landmarks.anchors.mouthCenter!
      const cheek = (eye: PixelPoint, side: number) => ({ x: eye.x + side * 0.025, y: eye.y + (mouth.y - eye.y) * 0.56 })
      const cheeks = [cheek(leftEye, -1), cheek(rightEye, 1)]
      return { ...preset, primitives: [
        ...cheeks.flatMap((center, side) => [
          contour(`cheek-zone-${side}`, Array.from({ length: 24 }, (_, index) => ({ x: center.x + Math.cos(index / 24 * Math.PI * 2) * 0.06, y: center.y + Math.sin(index / 24 * Math.PI * 2) * 0.036 }))),
          ...[[0, 0], [-0.025, -0.007], [0.022, 0.013], [0.012, -0.018], [-0.017, 0.016]].map(([dx, dy], index) => dot(`sunspot-${side}-${index}`, center.x + dx, center.y + dy, 3)),
        ]),
        label('sun-label', 'Sunspots / cheek texture', 0.62, 0.55),
      ] }
    }
    default: return preset
  }
})
const overlays = presets.map((preset) => {
  const primitives = resolveOverlayPreset({ preset, landmarks, viewport: size, imageSize: size }).primitives
  return {
    paths: primitives.filter((primitive): primitive is Shape => primitive.kind !== 'label' && primitive.kind !== 'point')
      .map((primitive) => ({ primitive, d: primitivePath(primitive) })),
    dots: primitives.filter((primitive) => primitive.kind === 'point'),
    labels: primitives.filter((primitive) => primitive.kind === 'label').map((primitive) => {
      const width = Math.max(180, primitive.title.length * 12 + 40)
      return {
        ...primitive,
        x: Math.min(size.width - width - 160, Math.max(160, primitive.point.x)),
        y: Math.min(1300, Math.max(100, primitive.point.y)),
        width,
      }
    }),
  }
})
const slotCount = Math.max(...overlays.map((overlay) => overlay.paths.length))
const dotCount = Math.max(...overlays.map((overlay) => overlay.dots.length))
const collapsed = morphPath([{ x: size.width / 2, y: size.height / 2 }])
function squarePath(side: number, centerY: number) {
  const x = (size.width - side) / 2
  const y = centerY - side / 2
  return morphPath([{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }, { x, y }])
}

export function IntroFacePreview() {
  const maskId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(-1)
  const [card, setCard] = useState({ side: 400, centerY: size.height / 2 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([{ contentRect: { width, height } }]) => {
      if (!width || !height) return
      const scale = Math.max(width / size.width, height / size.height)
      setCard({ side: Math.min(300, width * 0.8) / scale, centerY: height / scale / 2 })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden), { threshold: 0.1 })
    const visibility = () => setVisible(!document.hidden && container.getBoundingClientRect().bottom > 0 && container.getBoundingClientRect().top < window.innerHeight)
    observer.observe(container)
    document.addEventListener('visibilitychange', visibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  useEffect(() => {
    if (reduceMotion || !visible) return
    const timeout = setTimeout(() => setActive((current) => (current + 1) % presets.length), active < 0 ? initialHoldMs : overlayHoldMs + morphDuration * 1_000)
    return () => clearTimeout(timeout)
  }, [reduceMotion, visible, active])

  const showingReport = active >= 0 || Boolean(reduceMotion)
  const overlay = overlays[Math.max(0, active)]
  const transition = { duration: reduceMotion ? 0 : morphDuration, ease: morphEase }

  return (
    <div ref={containerRef} className="relative min-h-[420px] overflow-hidden bg-zinc-200 sm:min-h-[560px] lg:min-h-0">
      <Image className="object-cover object-top" src="/model.png" alt="Preview of facial analysis measurements" fill priority sizes="(min-width: 1024px) 46vw, 100vw" />
      <div className="pointer-events-none absolute inset-0 text-white" aria-hidden="true">
        <svg className="absolute inset-0 size-full" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMin slice" fill="none">
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={size.width} height={size.height}>
              <rect width={size.width} height={size.height} fill="white" />
              {showingReport ? overlay.labels.map((label, index) => (
                <motion.rect key={index} initial={false} animate={{ x: label.x - 10, y: label.y - 34, width: label.width + 20 }} transition={transition} height="68" rx="28" fill="black" />
              )) : null}
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
          {Array.from({ length: slotCount }, (_, index) => {
            const shape = showingReport ? overlay.paths[index] : undefined
            const primitive = shape?.primitive
            return (
              <motion.path
                key={index}
                initial={false}
                animate={{
                  d: shape?.d ?? (showingReport || index > 0 ? collapsed : squarePath(card.side, card.centerY)),
                  opacity: showingReport ? primitive ? primitive.opacity ?? 0.75 : 0 : index === 0 ? 0.8 : 0,
                  fillOpacity: primitive && 'fillOpacity' in primitive ? primitive.fillOpacity ?? 0 : 0,
                }}
                transition={showingReport ? transition : { duration: 0 }}
                stroke="white" fill="white" strokeWidth={1.1} vectorEffect="non-scaling-stroke"
                strokeDasharray={primitive && 'dashed' in primitive && primitive.dashed ? '5 7' : undefined}
                strokeLinecap="round" strokeLinejoin="round"
              />
            )
          })}
          {Array.from({ length: dotCount }, (_, index) => {
            const dot = showingReport ? overlay.dots[index] : undefined
            return (
              <motion.circle
                key={index}
                initial={false}
                animate={{ cx: dot?.point.x ?? size.width / 2, cy: dot?.point.y ?? size.height / 2, opacity: dot ? 1 : 0, r: dot?.radius ?? 0 }}
                transition={transition}
                fill="white" stroke="white" strokeOpacity={0.2} strokeWidth={5}
              />
            )
          })}
          </g>
          {showingReport ? overlay.labels.map((label, index) => (
            <motion.g key={index} initial={{ opacity: 0 }} animate={{ x: label.x, y: label.y, opacity: 1 }} transition={transition}>
              <rect x="0" y="-24" width={label.width} height="48" rx="24" fill="white" fillOpacity="0.9" />
              <text x="20" y="7" fill="#3f3f46" fontSize="20" fontFamily="monospace">{label.title}</text>
            </motion.g>
          )) : null}
        </svg>
        <motion.div className="absolute left-1/2 top-1/2 aspect-square w-[min(80%,300px)] -translate-x-1/2 -translate-y-1/2 p-3" initial={false} animate={{ opacity: showingReport ? 0 : 1 }} transition={{ duration: reduceMotion ? 0 : 0.25 }}>
          <div className="text-xl font-medium leading-none tracking-[-0.04em]">Facial<br />Aesthetic<br />Assessments</div>
          <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[9px] uppercase">
            {['Eyes / Canthal tilt', 'Jaw / Gonial angle', 'Symmetry / Eye line', 'Face shape / Thirds'].map((title) => <span key={title}>{title}</span>)}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
