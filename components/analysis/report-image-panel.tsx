import Image from 'next/image'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import { FaceOverlay, type LoadedImage } from './face-overlay'


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
        {image && enriched ? <FaceOverlay key={category.id} preset={getReportOverlayPreset(category.id)} landmarks={enriched} image={image} value={value} /> : null}
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
