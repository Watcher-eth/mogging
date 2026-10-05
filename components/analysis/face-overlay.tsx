import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { buildFaceMapPoints } from '@/lib/creator/mobile-overlay-engine/face-map-points'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import { resolveOverlayPreset } from '@/lib/creator/mobile-overlay-engine/resolve'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { drawReportOverlay, type ReportOverlay } from '@/lib/creator/report-overlay'

export type LoadedImage = { src: string; width: number; height: number }

export function FaceOverlay({ preset, landmarks, image, value, appearance = 'report' }: {
  preset: OverlayPreset | null
  landmarks: FaceLandmarksPayload
  image: LoadedImage
  value?: string
  appearance?: 'report' | 'scan'
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
        primitives: preset ? resolveOverlayPreset({ preset, landmarks, imageSize: image, viewport: size, fit: 'cover' }).primitives : [],
        dots: preset ? [] : getFaceMapDots(landmarks, image, size),
        value,
        labelAppearance: appearance === 'scan' ? 'scan' : undefined,
      }
      const end = Math.max(preset ? 0 : 2800, ...overlay.primitives.map((primitive) => (primitive.animation?.delay ?? 0) + Math.max(980, primitive.animation?.duration ?? 760) + 150))
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
  }, [preset, landmarks, image, value, appearance])
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : appearance === 'scan' ? .52 : .18 } }} exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : appearance === 'scan' ? .76 : .18 } }} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </motion.div>
  )
}

function getFaceMapDots(landmarks: FaceLandmarksPayload, image: LoadedImage, size: { width: number; height: number }) {
  const points = buildFaceMapPoints(landmarks)
  const transform = getImageTransform(image, size, 'cover')
  const top = Math.min(...points.map(point => point.y))
  const bottom = Math.max(...points.map(point => point.y))
  return points.map(point => ({ ...projectImagePoint(point, image, transform), band: Math.min(17, Math.floor((point.y - top) / Math.max(.001, bottom - top) * 18)) }))
}
