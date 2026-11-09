import { SkeletonImage } from '@/components/ui/skeleton-image'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getSideReportOverlay } from '@/lib/creator/profile-report-overlay'
import { sampleProfilePhoto } from '@/lib/creator/profile-report-sample'
import { getProfileSilhouetteRegions, type ProfileSilhouette } from '@/lib/client/profile-silhouette'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import styles from './report-image-panel.module.css'


export function ReportImagePanel({ category, imageSrc, landmarks, value, naturalImage = false, mobileScan = false, clearPortrait = false, side = false, authoredOverlay = false, active = true, onAspectRatio }: {
  category: { id: string; title: string; overlayPreset?: OverlayPreset | null; faceMapPointCount?: number }
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  naturalImage?: boolean
  mobileScan?: boolean
  clearPortrait?: boolean
  side?: boolean
  authoredOverlay?: boolean
  active?: boolean
  value?: string
  onAspectRatio?: (ratio: number) => void
}) {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const [silhouette, setSilhouette] = useState<ProfileSilhouette | null>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const measured = isFaceLandmarksUsable(landmarks) ? landmarks : detected
  const enriched = useMemo(() => enrichFaceLandmarks(measured), [measured])
  const authoredSide = side && imageSrc === sampleProfilePhoto

  const preset = useMemo(() => {
    if (!side) return category.overlayPreset === undefined ? getReportOverlayPreset(category.id) : category.overlayPreset
    return image ? getSideReportOverlay(category.id, image, enriched, silhouette ?? null, imageSrc) : null
  }, [category, enriched, image, imageSrc, side, silhouette])

  useEffect(() => {
    if (!image || authoredSide || isFaceLandmarksUsable(landmarks)) return
    let active = true
    getReportImageLandmarks(imageSrc, image.src, side).then((result) => {
      if (!active) return
      setDetected(result)
      setFailed(!result)
    })
    return () => { active = false }
  }, [authoredSide, image, imageSrc, landmarks, attempt, side])

  useEffect(() => {
    if (!side || authoredSide) return
    let current = true
    void getProfileSilhouetteRegions(imageSrc).then(result => { if (current) setSilhouette(result) })
    return () => { current = false }
  }, [attempt, authoredSide, imageSrc, side])

  const canDraw = side ? Boolean(preset) : Boolean(enriched)
  const waitingForProfile = !authoredSide && ((!enriched && !failed) || silhouette === undefined)
  const retryOverlay = failed && !canDraw && !enriched && (!side || category.id !== 'symmetry')
  const status = side
    ? category.id === 'symmetry' ? 'Use front view for symmetry'
      : canDraw ? 'Profile overlay' : waitingForProfile ? 'Mapping profile' : 'Profile guide unavailable'
    : enriched ? 'Active measurement' : failed ? 'Face overlay unavailable' : 'Locating facial landmarks'

  return (
    <div style={{ '--portrait-ratio': image ? image.width / image.height : 2 / 3 } as CSSProperties} className={`${styles.portrait} ${naturalImage ? styles.natural : ''} ${clearPortrait ? styles.clearPortrait : ''}`}>
      <div className={styles.media} data-scan-portrait={mobileScan ? "report" : undefined}>
        <SkeletonImage key={attempt} className={mobileScan ? "object-cover object-center" : "object-contain object-center"} src={imageSrc} alt={`${category.title} ${side ? 'side profile' : 'analysis image'}`} priority={active && !clearPortrait} loading={active ? undefined : 'eager'} onError={() => setFailed(true)} sizes={clearPortrait ? "(min-width: 1360px) 26vw, (min-width: 960px) 52vw, 90vw" : "(min-width: 1024px) 44vw, 100vw"} onLoad={(event) => {
          const photo = event.currentTarget
          if (photo.naturalWidth && photo.naturalHeight) onAspectRatio?.(photo.naturalWidth / photo.naturalHeight)
          setImage((previous) => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
        }} />
        <AnimatePresence>
          {active && image && canDraw ? <FaceOverlay key={category.id} categoryId={authoredOverlay ? undefined : category.id}
            appearance={side ? 'profile-report' : 'report'} fit={mobileScan ? "cover" : "contain"} preset={preset}
            faceMapPointCount={category.faceMapPointCount} landmarks={enriched} image={image} value={value} /> : null}
        </AnimatePresence>
        {!clearPortrait && <ProgressiveBlur className={styles.bottomBlur} blurLayers={8} intensity={16} />}
        {clearPortrait && image && <div className={styles.featheredBlur} style={{ backgroundImage: `url(${JSON.stringify(image.src)})` }} aria-hidden="true" />}
        <div className={styles.wash} aria-hidden="true" />
        {active && <div className="report-measurement-label absolute inset-x-4 top-4 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-wide text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
          <span>[ {category.title} ]</span>
          <span role="status">{status}</span>
        </div>}
        {active && retryOverlay ? (
          <button type="button" className={`absolute ${side ? 'bottom-14' : 'bottom-4'} left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`} onClick={() => { setFailed(false); setAttempt((current) => current + 1) }}>
            Retry face overlay
          </button>
        ) : null}
      </div>
    </div>
  )
}
