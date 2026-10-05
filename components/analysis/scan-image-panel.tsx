import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { processingOverlayPresets } from '@/lib/creator/mobile-overlay-engine/processing-presets'
import { FaceOverlay, type LoadedImage } from './face-overlay'

export function ScanImagePanel({ imageSrc, landmarks, variant = 'analysis', paused = false }: {
  imageSrc: string | null
  landmarks: FaceLandmarksPayload | null
  variant?: 'analysis' | 'paywall'
  paused?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [phase, setPhase] = useState(variant === 'paywall' ? 1 : 0)
  const [visible, setVisible] = useState(false)
  const reduceMotion = useReducedMotion()
  const enriched = useMemo(() => enrichFaceLandmarks(landmarks), [landmarks])
  const usable = isFaceLandmarksUsable(enriched, .2)
  const preset = phase === 0 ? null : processingOverlayPresets[phase - 1]

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
    const timer = setTimeout(() => setPhase(current => {
      const next = (current + 1) % (processingOverlayPresets.length + 1)
      return variant === 'paywall' && next === 0 ? 1 : next
    }), phase === 0 ? 4000 : 2800)
    return () => clearTimeout(timer)
  }, [visible, paused, reduceMotion, usable, image, phase, variant])

  return (
    <div ref={panelRef} className={`relative w-full overflow-hidden bg-zinc-950 ${variant === 'paywall' ? 'h-[min(38svh,340px)] min-h-[220px]' : 'aspect-[4/5] max-w-[620px]'}`}>
      {imageSrc ? <Image className="object-cover object-center" src={imageSrc} alt="Your facial analysis preview" fill sizes={variant === 'paywall' ? '500px' : '(min-width: 1024px) 45vw, 100vw'} onLoad={event => {
        const photo = event.currentTarget
        setImage(previous => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
      }} /> : null}
      <div className="pointer-events-none absolute inset-0 bg-black/10" />
      {usable && phase !== 0 ? <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ backgroundImage: 'linear-gradient(to right, transparent 30%, #ffffff29 30%, #ffffff29 calc(30% + 1px), transparent calc(30% + 1px), transparent 70%, #ffffff29 70%, #ffffff29 calc(70% + 1px), transparent calc(70% + 1px)), linear-gradient(to bottom, transparent 46%, #ffffff24 46%, #ffffff24 calc(46% + 1px), transparent calc(46% + 1px))' }} /> : null}
      <AnimatePresence>
        {!paused && usable && image && enriched ? <FaceOverlay key={phase} preset={preset} landmarks={enriched} image={image} appearance="scan" /> : null}
      </AnimatePresence>
      {!paused && visible && !reduceMotion && phase !== 0 ? <motion.div className="pointer-events-none absolute inset-0" initial={{ y: '-100%' }} animate={{ y: '0%' }} transition={{ duration: 2.1, ease: [.65, 0, .35, 1], repeat: Infinity, repeatType: 'reverse' }} aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
      </motion.div> : null}
      {variant === 'paywall' ? <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%]" initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .6, ease: [.22, 1, .36, 1] }} style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,.015) 10%, rgba(255,255,255,.06) 20%, rgba(255,255,255,.15) 35%, rgba(255,255,255,.33) 50%, rgba(255,255,255,.58) 65%, rgba(255,255,255,.8) 80%, rgba(255,255,255,.95) 90%, #fff 100%)' }} /> : null}
    </div>
  )
}
