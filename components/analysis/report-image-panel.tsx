import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { resolveOverlayPreset } from '@/lib/creator/mobile-overlay-engine/resolve'
import { drawReportOverlay, type ReportOverlay } from '@/lib/creator/report-overlay'

type LoadedImage = { src: string; width: number; height: number }

export function ReportImagePanel({ category, imageSrc, landmarks, value }: {
  category: { id: string; title: string }
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  value?: string
}) {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const measured = isFaceLandmarksUsable(landmarks) ? landmarks : detected
  const enriched = useMemo(() => enrichFaceLandmarks(measured), [measured])

  useEffect(() => {
    if (!image || isFaceLandmarksUsable(landmarks)) return
    let active = true
    getReportImageLandmarks(imageSrc, image.src).then((result) => {
      if (!active) return
      setDetected(result)
      setFailed(!result)
    })
    return () => { active = false }
  }, [image, imageSrc, landmarks, attempt])

  return (
    <div className="relative min-h-[520px] overflow-hidden bg-zinc-100 lg:h-full lg:min-h-0">
      <Image key={attempt} className="object-cover object-center" src={imageSrc} alt={`${category.title} analysis image`} fill priority onError={() => setFailed(true)} sizes="(min-width: 1024px) 44vw, 100vw" onLoad={(event) => {
        const photo = event.currentTarget
        setImage((previous) => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
      }} />
      <div className="absolute inset-0 bg-black/10" />
      <AnimatePresence>
        {image && enriched ? <MeasuredOverlay key={category.id} categoryId={category.id} landmarks={enriched} image={image} value={value} /> : null}
      </AnimatePresence>
      <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-wide text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
        <span>[ {category.title} ]</span>
        <span role="status">{enriched ? 'Active measurement' : failed ? 'Face overlay unavailable' : 'Locating facial landmarks'}</span>
      </div>
      {failed && !enriched ? (
        <button type="button" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" onClick={() => { setFailed(false); setAttempt((current) => current + 1) }}>
          Retry face overlay
        </button>
      ) : null}
    </div>
  )
}

function MeasuredOverlay({ categoryId, landmarks, image, value }: {
  categoryId: string
  landmarks: NonNullable<ReturnType<typeof enrichFaceLandmarks>>
  image: LoadedImage
  value?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let start: number | null = null
    let frame = 0
    let visible = false
    let draw = () => {}
    const resize = () => {
      cancelAnimationFrame(frame)
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const size = { width: 360, height: height / width * 360 }
      const overlay: ReportOverlay = {
        size,
        primitives: resolveOverlayPreset({ preset: getReportOverlayPreset(categoryId), landmarks, imageSize: image, viewport: size, fit: 'cover' }).primitives,
        dots: [],
        value,
      }
      const end = Math.max(0, ...overlay.primitives.map((primitive) => (primitive.animation?.delay ?? 0) + Math.max(980, primitive.animation?.duration ?? 760) + 150))
      draw = () => {
        cancelAnimationFrame(frame)
        if (!visible || document.hidden) return
        start ??= performance.now()
        const elapsed = reducedMotion.matches ? end : Math.min(end, performance.now() - start)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        drawReportOverlay(ctx, overlay, width, elapsed)
        if (elapsed < end) frame = requestAnimationFrame(draw)
      }
      draw()
    }
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .25
      draw()
    }, { threshold: .25 })
    visibility.observe(canvas)
    const resume = () => draw()
    document.addEventListener('visibilitychange', resume)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    reducedMotion.addEventListener('change', resize)
    resize()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', resume); reducedMotion.removeEventListener('change', resize) }
  }, [categoryId, landmarks, image, value])
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18, ease: [.23, 1, .32, 1] }} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </motion.div>
  )
}
