import Image from 'next/image'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import styles from './report-image-panel.module.css'


export function ReportImagePanel({ category, imageSrc, landmarks, value, naturalImage = false }: {
  category: { id: string; title: string; overlayPreset?: OverlayPreset | null; faceMapPointCount?: number }
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  naturalImage?: boolean
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
    <div style={{ '--portrait-ratio': image ? image.width / image.height : 2 / 3 } as CSSProperties} className={`${styles.portrait} ${naturalImage ? styles.natural : ''}`}>
      <div className={styles.media}>
        <Image key={attempt} className="object-contain object-center" src={imageSrc} alt={`${category.title} analysis image`} fill priority onError={() => setFailed(true)} sizes="(min-width: 1024px) 44vw, 100vw" onLoad={(event) => {
          const photo = event.currentTarget
          setImage((previous) => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
        }} />
        <AnimatePresence>
          {image && enriched ? <FaceOverlay key={category.id} categoryId={category.id} fit="contain" preset={category.overlayPreset === undefined ? getReportOverlayPreset(category.id) : category.overlayPreset} faceMapPointCount={category.faceMapPointCount} landmarks={enriched} image={image} value={value} /> : null}
        </AnimatePresence>
        <ProgressiveBlur className={styles.leftBlur} direction="left" blurLayers={6} intensity={12} />
        <ProgressiveBlur className={styles.rightBlur} direction="right" blurLayers={6} intensity={8} />
        <ProgressiveBlur className={styles.bottomBlur} blurLayers={8} intensity={16} />
        <div className={styles.wash} aria-hidden="true" />
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
    </div>
  )
}
