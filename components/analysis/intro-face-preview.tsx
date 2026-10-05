import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { reportOverlayPresets } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset, type PixelPoint, type ResolvedPrimitive } from '@/lib/creator/mobile-overlay-engine/resolve'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

const initialHoldMs = 4_000
const overlayHoldMs = 3_000
const morphDuration = 0.9
const morphEase = [0.65, 0, 0.35, 1] as const
const presets = Object.values(reportOverlayPresets)
const pathSamples = 32

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

type Shape = Exclude<ResolvedPrimitive, { kind: 'label' }>
function primitivePath(primitive: Shape) {
  switch (primitive.kind) {
    case 'point': {
      const radius = primitive.radius ?? 3
      return morphPath(Array.from({ length: 33 }, (_, index) => ({
        x: primitive.point.x + Math.cos(index / 32 * Math.PI * 2) * radius,
        y: primitive.point.y + Math.sin(index / 32 * Math.PI * 2) * radius,
      })))
    }
    case 'line': return morphPath([primitive.fromPoint, primitive.toPoint])
    case 'box': {
      const { x, y, width, height } = primitive.rect
      return morphPath([{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y }])
    }
    default: {
      const points = primitive.pixelPoints
      return morphPath(primitive.kind === 'region' || primitive.closed ? [...points, points[0]] : points)
    }
  }
}

export function IntroFacePreview({ imageSrc }: { imageSrc: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [landmarks, setLandmarks] = useState<FaceLandmarksPayload | null>(null)
  const [image, setImage] = useState<{ src: string; width: number; height: number } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [active, setActive] = useState(-1)
  const enriched = useMemo(() => enrichFaceLandmarks(landmarks), [landmarks])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!image) return
    let cancelled = false
    getReportImageLandmarks(imageSrc, image.src).then((result) => {
      if (!cancelled) setLandmarks(result)
    })
    return () => { cancelled = true }
  }, [image, imageSrc])

  useEffect(() => {
    if (reduceMotion) return
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setActive(0)
      interval = setInterval(() => setActive((current) => (current + 1) % presets.length), overlayHoldMs + morphDuration * 1_000)
    }, initialHoldMs)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [reduceMotion])

  const overlays = useMemo(() => enriched && image && size.width ? presets.map((preset) =>
    resolveOverlayPreset({ preset, landmarks: enriched, imageSize: image, viewport: size, fit: 'cover' }).primitives,
  ) : [], [enriched, image, size])
  const showingReport = !reduceMotion && active >= 0 && overlays.length > 0
  const paths = (showingReport ? overlays[active] : []).filter((primitive): primitive is Shape => primitive.kind !== 'label')
  const slotCount = Math.max(1, ...overlays.map((overlay) => overlay.filter((primitive) => primitive.kind !== 'label').length))
  const cardWidth = Math.min(size.width * 0.8, 300)
  const x = (size.width - cardWidth) / 2
  const y = (size.height - 300) / 2
  const cardPath = morphPath([{ x, y }, { x: x + cardWidth, y }, { x: x + cardWidth, y: y + 300 }, { x, y: y + 300 }, { x, y }])
  const collapsed = morphPath([{ x: size.width / 2, y: size.height / 2 }])

  return (
    <div ref={containerRef} className="relative min-h-[420px] overflow-hidden bg-zinc-200 sm:min-h-[560px] lg:min-h-0">
      <Image className="object-cover object-center" src={imageSrc} alt="Preview of facial analysis measurements" fill priority sizes="(min-width: 1024px) 46vw, 100vw" onLoad={(event) => {
        const photo = event.currentTarget
        setImage((current) => current?.src === photo.currentSrc ? current : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
      }} />
      <div className="pointer-events-none absolute inset-0 text-white" aria-hidden="true">
        {size.width > 0 ? (
          <svg className="absolute inset-0 size-full drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]" viewBox={`0 0 ${size.width} ${size.height}`} fill="none">
            {Array.from({ length: slotCount }, (_, index) => {
              const primitive = paths[index]
              const opacity = showingReport ? primitive ? ('opacity' in primitive ? primitive.opacity ?? 0.88 : 0.88) : 0 : index === 0 ? 0.8 : 0
              return (
                <motion.path
                  key={index}
                  initial={false}
                  animate={{ d: primitive ? primitivePath(primitive) : showingReport ? collapsed : cardPath, opacity }}
                  transition={{ duration: reduceMotion ? 0 : morphDuration, ease: morphEase }}
                  stroke="white"
                  strokeWidth={primitive && 'strokeWidth' in primitive ? Math.max(1, primitive.strokeWidth ?? 1) : 1}
                  strokeDasharray={primitive && 'dashed' in primitive && primitive.dashed ? '4 5' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            })}
          </svg>
        ) : null}
        <motion.div className="absolute left-1/2 top-1/2 h-[300px] w-[min(80%,300px)] -translate-x-1/2 -translate-y-1/2 p-3" initial={false} animate={{ opacity: showingReport ? 0 : 1 }} transition={{ duration: 0.25 }}>
          <div className="text-xl font-medium leading-none tracking-[-0.04em]">Facial<br />Aesthetic<br />Assessments</div>
          <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[9px] uppercase">
            {['Eyes / Canthal tilt', 'Jaw / Gonial angle', 'Symmetry / Eye line tilt', 'Face shape / Upper third'].map((label) => <span key={label}>{label}</span>)}
          </div>
        </motion.div>
        <motion.div className="absolute inset-x-5 bottom-5 font-mono text-[10px] uppercase tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]" initial={false} animate={{ opacity: showingReport ? 1 : 0 }} transition={{ duration: morphDuration }}>
          {showingReport ? presets[active].footer : ''}
        </motion.div>
      </div>
    </div>
  )
}
