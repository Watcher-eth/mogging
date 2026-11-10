import { extendReportForehead, getReportFaceVisibility } from '@/lib/client/report-face-visibility'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { buildFaceMapPoints } from '@/lib/creator/mobile-overlay-engine/face-map-points'
import { getImageTransform, projectImagePoint } from '@/lib/creator/mobile-overlay-engine/layout'
import { resolveOverlayPreset } from '@/lib/creator/mobile-overlay-engine/resolve'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { drawFaceTreatment, preciseFaceOverlay, smoothContour } from '@/lib/creator/face-treatment'
import type { ImageFit } from '@/lib/creator/mobile-overlay-engine/layout'
import { drawReportOverlay, type ReportOverlay } from '@/lib/creator/report-overlay'

export type LoadedImage = { src: string; width: number; height: number }

export function FaceOverlay({ preset, landmarks, image, value, appearance = 'report', faceMapPointCount, categoryId, fadeDurations, fit = 'cover', drawBeforeMask = false }: {
  preset: OverlayPreset | null
  landmarks: FaceLandmarksPayload | null
  image: LoadedImage
  value?: string
  appearance?: 'report' | 'profile-report' | 'scan' | 'scan-detail' | 'primer'
  faceMapPointCount?: number
  categoryId?: string
  fadeDurations?: { enter: number; exit: number }
  fit?: ImageFit
  drawBeforeMask?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const needsMask = appearance === 'report' && Boolean(landmarks && categoryId) && categoryId !== 'hair' && categoryId !== 'ears'
    const portrait = new window.Image()
    let mask: HTMLCanvasElement | null | undefined = needsMask && !drawBeforeMask ? undefined : null
    let displayLandmarks = landmarks
    let disposed = false
    let start: number | null = null
    let networkTime = 0
    let lastNetworkFrame: number | null = null
    let frame = 0
    let visible = false
    let draw = () => {}
    const resize = () => {
      cancelAnimationFrame(frame)
      const { clientWidth: width, clientHeight: height } = canvas
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const scanDetail = appearance === 'scan-detail'
      const profileReport = appearance === 'profile-report'
      const glass = scanDetail || profileReport || (appearance === 'report' && Boolean(categoryId))
      const size = appearance === 'primer' ? { width, height } : { width: 360, height: glass ? image.height / image.width * 360 : height / width * 360 }
      const base: ReportOverlay = {
        size,
        primitives: preset ? resolveOverlayPreset({ preset, landmarks: displayLandmarks, imageSize: image, viewport: size, fit: glass ? 'contain' : fit }).primitives : [],
        dots: preset ? [] : getFaceMapDots(displayLandmarks, image, size, faceMapPointCount),
        value,
        nativePrimer: appearance === 'primer',
        labelAppearance: appearance === 'scan' ? 'scan' : undefined,
        labelScale: appearance === 'report' ? .6 : 1,
      }
      const overlay = profileReport
        ? { ...base, primitives: base.primitives.map(primitive => primitive.kind === 'polyline' && primitive.pixelPoints.length > 2
          ? { ...primitive, pixelPoints: smoothContour(primitive.pixelPoints, primitive.closed) } : primitive) }
        : glass && categoryId && !['hair', 'ears'].includes(categoryId)
          ? preciseFaceOverlay(base, { ...image, landmarks: displayLandmarks }, categoryId, '', categoryId === 'cheeks')
          : base
      const end = Math.max(glass ? 850 : preset ? 0 : 2800, ...overlay.primitives.map((primitive) => {
        const { delay = 0, duration = 760 } = primitive.animation ?? {}
        return delay + (profileReport && primitive.kind === 'point' ? duration : Math.max(980, duration) + 150)
      }))
      const continuous = overlay.skinNetwork && overlay.dots.length > 0
      const placement = getImageTransform(image, { width, height }, fit)
      const outline = displayLandmarks?.contours?.faceOutline
      const boundary = needsMask && outline && outline.length >= 3 ? new Path2D() : null
      if (boundary && outline) {
        outline.forEach((point, index) => {
          const projected = projectImagePoint(point, image, placement)
          if (index === 0) boundary.moveTo(projected.x, projected.y)
          else boundary.lineTo(projected.x, projected.y)
        })
        boundary.closePath()
      }
      draw = () => {
        cancelAnimationFrame(frame)
        if (!visible || document.hidden || mask === undefined) {
          lastNetworkFrame = null
          return
        }
        const now = performance.now()
        start ??= now
        if (continuous) {
          networkTime += lastNetworkFrame === null ? 0 : Math.min(50, now - lastNetworkFrame)
          lastNetworkFrame = now
        }
        const elapsed = reducedMotion.matches ? end : continuous ? networkTime : Math.min(end, now - start)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        ctx.save()
        if (boundary) ctx.clip(boundary)
        if (glass) {
          ctx.save(); ctx.translate(placement.offsetX, placement.offsetY)
          drawFaceTreatment(ctx, overlay, placement.renderedWidth, elapsed, reducedMotion.matches, 1, {
            inkScale: scanDetail ? .74 : 1,
            usePrimitiveStyles: profileReport,
            appearance: {
              pattern: scanDetail && !categoryId ? 'solid' : 'dotted',
              opacity: scanDetail ? .95 : .82,
              markers: !profileReport || categoryId !== 'skin',
              regions: categoryId === 'cheeks',
            },
          })
          ctx.restore()
        } else drawReportOverlay(ctx, overlay, width, elapsed)
        ctx.restore()
        if (mask) {
          ctx.save()
          ctx.globalCompositeOperation = 'destination-in'
          ctx.drawImage(mask, placement.offsetX, placement.offsetY, placement.renderedWidth, placement.renderedHeight)
          ctx.restore()
        }
        if (!reducedMotion.matches && (continuous || elapsed < end)) frame = requestAnimationFrame(draw)
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
    if (drawBeforeMask) canvas.dataset.faceVisibility = 'outline'
    if (needsMask && landmarks) {
      portrait.onload = () => {
        void getReportFaceVisibility(portrait).then(result => {
          if (disposed) return
          mask = result
          displayLandmarks = result ? extendReportForehead(landmarks, result) : landmarks
          canvas.dataset.faceVisibility = result ? 'segmented' : 'outline'
          resize()
        })
      }
      portrait.onerror = () => {
        mask = null
        draw()
      }
      portrait.src = image.src
    }
    resize()
    return () => { disposed = true; portrait.onload = null; portrait.onerror = null; cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', resume); reducedMotion.removeEventListener('change', resize) }
  }, [preset, landmarks, image, value, appearance, faceMapPointCount, categoryId, fit, drawBeforeMask])
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : fadeDurations?.enter ?? (appearance === 'scan' ? .52 : .18) } }} exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : fadeDurations?.exit ?? (appearance === 'scan' ? .76 : .18) } }} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </motion.div>
  )
}

function getFaceMapDots(landmarks: FaceLandmarksPayload | null, image: LoadedImage, size: { width: number; height: number }, count?: number) {
  const points = buildFaceMapPoints(landmarks).slice(0, count)
  const transform = getImageTransform(image, size, 'cover')
  const top = Math.min(...points.map(point => point.y))
  const bottom = Math.max(...points.map(point => point.y))
  return points.map(point => ({ ...projectImagePoint(point, image, transform), band: Math.min(17, Math.floor((point.y - top) / Math.max(.001, bottom - top) * 18)) }))
}
