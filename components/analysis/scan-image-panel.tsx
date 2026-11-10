import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { processingOverlaySteps } from '@/lib/creator/mobile-overlay-engine/processing-presets'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { FaceOverlay, type LoadedImage } from './face-overlay'

export function ScanImagePanel({ imageSrc, landmarks, variant = 'analysis', paused = false }: {
  imageSrc: string | null
  landmarks: FaceLandmarksPayload | null
  variant?: 'analysis' | 'paywall'
  paused?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const [phase, setPhase] = useState(0)
  const [visible, setVisible] = useState(false)
  const reduceMotion = useReducedMotion()
  const measured = isFaceLandmarksUsable(landmarks) ? landmarks : detected
  const enriched = useMemo(() => enrichFaceLandmarks(measured), [measured])
  const usable = isFaceLandmarksUsable(enriched, .2)
  const step = processingOverlaySteps[phase]

  useEffect(() => {
    setDetected(null)
    if (!imageSrc || !image || isFaceLandmarksUsable(landmarks)) return
    let active = true
    getReportImageLandmarks(imageSrc, image.src).then(result => { if (active) setDetected(result) })
    return () => { active = false }
  }, [imageSrc, image, landmarks])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let inViewport = false
    const update = () => setVisible(inViewport && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      update()
    })
    observer.observe(panel)
    document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])

  useEffect(() => {
    if (!visible || paused || reduceMotion || !usable || !image) return
    const timer = setTimeout(() => setPhase(current => (current + 1) % processingOverlaySteps.length), 3400)
    return () => clearTimeout(timer)
  }, [visible, paused, reduceMotion, usable, image, phase])

  return (
    <div ref={panelRef} style={variant === 'analysis' && image ? { aspectRatio: image.width / image.height } : undefined} className={`relative w-full overflow-hidden bg-white ${variant === 'paywall' ? 'h-[min(38svh,340px)] min-h-[220px]' : 'aspect-[4/5] max-w-[620px]'}`}>
      {imageSrc ? <Image className="object-contain object-center" src={imageSrc} alt="Your facial analysis preview" fill sizes={variant === 'paywall' ? '500px' : '(min-width: 1024px) 45vw, 100vw'} onLoad={event => {
        const photo = event.currentTarget
        setImage(previous => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
      }} /> : null}
      <AnimatePresence>
        {!paused && usable && image && enriched ? <FaceOverlay key={`${image.src}:${step.categoryId}`} categoryId={step.categoryId} preset={getReportOverlayPreset(step.categoryId)} landmarks={enriched} image={image} fit="contain" /> : null}
      </AnimatePresence>
      {usable && !paused ? <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/35 bg-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-white shadow-sm backdrop-blur-md" aria-hidden="true">{step.label}</div> : null}
      {variant === 'paywall' ? <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%]" initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .6, ease: [.22, 1, .36, 1] }} style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.015) 10%, rgba(255,255,255,.06) 20%, rgba(255,255,255,.15) 35%, rgba(255,255,255,.33) 50%, rgba(255,255,255,.58) 65%, rgba(255,255,255,.8) 80%, rgba(255,255,255,.95) 90%, #fff 100%)' }} /> : null}
    </div>
  )
}
