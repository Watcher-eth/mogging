import { profileGeometry, profileFeatureForText, type ProfileStudy } from '@/lib/creator/video-profile'
import { SkeletonImage } from '@/components/ui/skeleton-image'
import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { FaceLandmarksPayload } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportImageLandmarks } from '@/lib/client/report-landmarks'
import { enrichFaceLandmarks } from '@/lib/creator/mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from '@/lib/creator/mobile-overlay-engine/landmarks'
import { getReportOverlayPreset } from '@/lib/creator/mobile-overlay-engine/report-presets'
import type { OverlayPreset } from '@/lib/creator/mobile-overlay-engine/schema'
import { FaceOverlay, type LoadedImage } from './face-overlay'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import styles from './report-image-panel.module.css'


export function ReportImagePanel({ category, imageSrc, landmarks, value, naturalImage = false, mobileScan = false, clearPortrait = false, side = false, authoredOverlay = false }: {
  category: { id: string; title: string; overlayPreset?: OverlayPreset | null; faceMapPointCount?: number }
  imageSrc: string
  landmarks: FaceLandmarksPayload | null
  naturalImage?: boolean
  mobileScan?: boolean
  clearPortrait?: boolean
  side?: boolean
  authoredOverlay?: boolean
  value?: string
}) {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [detected, setDetected] = useState<FaceLandmarksPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const measured = isFaceLandmarksUsable(landmarks) ? landmarks : detected
  const enriched = useMemo(() => enrichFaceLandmarks(measured), [measured])

  const preset = useMemo(() => {
    if (!side) return category.overlayPreset === undefined ? getReportOverlayPreset(category.id) : category.overlayPreset
    if (!enriched || enriched.source === 'demo-static' || !image) return null
    if (!['overall', 'face', 'face-shape', 'eyes', 'brows', 'nose', 'mouth', 'jaw', 'cheeks'].includes(category.id)) return null
    const feature = ['eyes', 'brows'].includes(category.id)
      ? category.id as ProfileStudy['feature']
      : profileFeatureForText(category.title, category.id)
    try {
      const { contour } = profileGeometry({ id: 'profile', name: 'Side photo', dataUrl: image.src,
        width: image.width, height: image.height, landmarks: { ...enriched, source: enriched.source }, status: 'ready' },
      { view: 'profile', side: (enriched.quality?.yawRadians ?? 0) > 0 ? 'left' : 'right', feature })
      return { id: `profile-${feature}`, footer: '[ PROFILE ]', primitives: [{
        id: feature, kind: 'polyline', points: contour.map(point => ({ point: { x: point.x / image.width, y: point.y / image.height } })),
        strokeWidth: .32, opacity: .9, animation: { delay: 0, duration: 850, entrance: 'draw' },
      }] } satisfies OverlayPreset
    } catch {
      return null
    }
  }, [category, enriched, image, side])

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
    <div style={{ '--portrait-ratio': image ? image.width / image.height : 2 / 3 } as CSSProperties} className={`${styles.portrait} ${naturalImage ? styles.natural : ''} ${clearPortrait ? styles.clearPortrait : ''}`}>
      <div className={styles.media} data-scan-portrait={mobileScan ? "report" : undefined}>
        <SkeletonImage key={attempt} className={mobileScan ? "object-cover object-center" : "object-contain object-center"} src={imageSrc} alt={`${category.title} analysis image`} priority={!clearPortrait} onError={() => setFailed(true)} sizes={clearPortrait ? "(min-width: 1360px) 26vw, (min-width: 960px) 52vw, 90vw" : "(min-width: 1024px) 44vw, 100vw"} onLoad={(event) => {
          const photo = event.currentTarget
          setImage((previous) => previous?.src === photo.currentSrc ? previous : { src: photo.currentSrc, width: photo.naturalWidth, height: photo.naturalHeight })
        }} />
        <AnimatePresence>
          {image && enriched && (!side || preset) ? <FaceOverlay key={category.id} categoryId={side || authoredOverlay ? undefined : category.id} fit={mobileScan ? "cover" : "contain"} preset={preset} faceMapPointCount={category.faceMapPointCount} landmarks={enriched} image={image} value={value} /> : null}
        </AnimatePresence>
        {!clearPortrait && <>
          <ProgressiveBlur className={styles.leftBlur} direction="left" blurLayers={6} intensity={12} />
          <ProgressiveBlur className={styles.rightBlur} direction="right" blurLayers={6} intensity={8} />
          <ProgressiveBlur className={styles.bottomBlur} blurLayers={8} intensity={16} />
        </>}
        {clearPortrait && image && <div className={styles.featheredBlur} style={{ backgroundImage: `url(${JSON.stringify(image.src)})` }} aria-hidden="true" />}
        <div className={styles.wash} aria-hidden="true" />
        <div className="report-measurement-label absolute inset-x-4 top-4 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-wide text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
          <span>[ {category.title} ]</span>
          <span role="status">{side && enriched ? preset ? 'Profile contour' : 'Profile contour unavailable' : enriched ? 'Active measurement' : failed ? 'Face overlay unavailable' : 'Locating facial landmarks'}</span>
        </div>
        {failed && !enriched ? (
          <button type="button" className={`absolute ${side ? 'bottom-14' : 'bottom-4'} left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`} onClick={() => { setFailed(false); setAttempt((current) => current + 1) }}>
            Retry face overlay
          </button>
        ) : null}
      </div>
    </div>
  )
}
